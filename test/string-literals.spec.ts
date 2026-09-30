import { parseScript } from "cherow";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

for (const [name, literal, expected] of [
  ["double quotes", '"x😀y"', "x😀y"],
  ["single quotes", "'x😀y'", "x😀y"],
  ["adjacent astral characters", '"x😀𐐀y"', "x😀𐐀y"],
  ["ordinary escapes and unpaired surrogates", String.raw`"x😀\n\u{1f600}\ud800\udc00\ud800y"`, "x😀\n😀\ud800\udc00\ud800y"],
  ["identity escape before an astral character", '"\\😀x"', "😀x"],
  ["escaped backslash before an astral character", '"\\\\😀x"', "\\😀x"],
  ["odd consecutive backslashes", '"\\\\\\😀x"', "\\😀x"],
  ["escaped quote and astral character", '"\\\"😀x"', '"😀x'],
  ["line continuation", '"x😀\\\ny"', "x😀y"],
  ["sloppy octal escape", '"x😀\\141y"', "x😀ay"]
]) {
  test(`quoted string literals preserve UTF-16 values with ${name}`, () => {
    const { loaded } = compareModule(`module.exports = ${literal};`);
    expect(loaded).toMatchObject({ type: "string", value: expected });
  });
}

for (const [name, separator] of [["line separator", "\u2028"], ["paragraph separator", "\u2029"]]) {
  for (const prefix of ["x", "x😀"]) {
    test(`a physical ${name} continuation contributes no text after ${prefix}`, () => {
      const literal = '"' + prefix + "\\" + separator + 'y"';
      const source = `module.exports = ${literal};`;
      const { loaded } = compareModule(source);
      expect(loaded).toMatchObject({ type: "string", value: prefix + "y" });
      const original: any = parseScript(source, { loc: true, raw: true });
      const corrected: any = parseECMACompliant(source);
      expect(corrected.body[0].expression.right.raw).toBe(literal);
      expect(corrected.body[0].expression.right.loc).toEqual(original.body[0].expression.right.loc);
    });
  }

  test(`escaped backslashes and Unicode escapes stay distinct from a ${name} continuation`, () => {
    const literal = '"x😀' + "\\".repeat(3) + separator + 'y"';
    const continued = compareModule(`module.exports = ${literal};`);
    expect(continued.loaded).toMatchObject({ type: "string", value: "x😀\\y" });
    const escaped = name === "line separator" ? "\\u2028" : "\\u2029";
    const { loaded } = compareModule(`module.exports = "x😀${escaped}y";`);
    expect(loaded).toMatchObject({ type: "string", value: "x😀" + separator + "y" });
  });

  test(`ordinary physical ${name} text remains an explicit JSON-superset lexer gap`, () => {
    for (const count of [0, 2]) {
      const source = 'module.exports = "x😀' + "\\".repeat(count) + separator + 'y";';
      withModuleFixture(source, filename => {
        expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: {
          type: "string", value: "x😀" + (count === 2 ? "\\" : "") + separator + "y"
        } });
      });
      expect(() => parseECMACompliant(source)).toThrow(/Parser analysis is not yet supported: ordinary Unicode line separators/);
    }
    // The same physical code unit inside an invalid escape is still a genuine
    // syntax error. The lexer-gap guard must inspect its precise diagnostic.
    expect(() => parseECMACompliant('"\\u' + separator + '";')).toThrow(SyntaxError);
    expect(() => parseECMACompliant('"\\u{1F_639}"; //' + separator)).toThrow(SyntaxError);
  });

  test(`a ${name} continuation keeps adjacent escape tokens separate`, () => {
    const octal = '"\\1' + "\\" + separator + '23"';
    const { loaded } = compareModule(`module.exports = ${octal};`);
    expect(loaded).toMatchObject({ type: "string", value: "\x01" + "23" });
    const nul = '"\\0' + "\\" + separator + '1"';
    const strict = compareModule(`"use strict"; module.exports = ${nul};`);
    expect(strict.loaded).toMatchObject({ type: "string", value: "\0" + "1" });
  });
}

test("raw astral property names and literal values agree", () => {
  const { loaded } = compareModule('const object = { "x😀y": "value😀tail" }; module.exports = object["x\\ud83d\\ude00y"];');
  expect(loaded).toMatchObject({ type: "string", value: "value😀tail" });
});

test("direct eval and generated functions share the corrected literal parser", () => {
  const literal = '"x😀y"';
  const { loaded } = compareModule(`module.exports = eval(${JSON.stringify(literal)}) + ":" + Function(${JSON.stringify(`return ${literal};`)})();`);
  expect(loaded).toMatchObject({ type: "string", value: "x😀y:x😀y" });
});

test("recooking a directive does not change the prologue or following strict mode", () => {
  const { loaded } = compareModule(`
    "x😀y";
    "use strict";
    let caught = false;
    try { missingAstralBinding = 1; } catch (error) { caught = error.name === "ReferenceError"; }
    module.exports = caught;
  `);
  expect(loaded).toMatchObject({ value: true });
});

test("literal correction preserves raw spelling, locations, identifiers, comments and RegExp source", () => {
  const source = '// 😀 comment\nconst 𐐀 = "x😀y"; const pattern = /😀/;';
  const program: any = parseECMACompliant(source);
  const first = program.body[0].declarations[0];
  expect(first.id.name).toBe("𐐀");
  expect(first.init.value).toBe("x😀y");
  expect(first.init.raw).toBe('"x😀y"');
  expect(first.init.loc).toEqual({ start: { line: 2, column: 10 }, end: { line: 2, column: 16 } });
  expect(program.body[1].declarations[0].init.regex.pattern).toBe("😀");
});

test("literal correction does not accept strict octal escapes or unescaped newlines", () => {
  expect(() => parseECMACompliant('"use strict"; "x😀\\141y";')).toThrow(SyntaxError);
  expect(() => parseECMACompliant('"x😀\ny";')).toThrow(SyntaxError);
});

test("the existing lexer rejection of quoted CRLF continuations is an analysis gap, not a JavaScript SyntaxError", () => {
  const source = 'module.exports = "x😀\\\r\ny";';
  withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "string", value: "x😀y" } });
  });
  expect(() => parseECMACompliant(source)).toThrow(/Parser analysis is not yet supported:.*CRLF line continuation/);
  try {
    parseECMACompliant(source);
    throw new Error("Expected the parser analysis gap");
  } catch (error) {
    expect(error).not.toBeInstanceOf(SyntaxError);
  }
});
