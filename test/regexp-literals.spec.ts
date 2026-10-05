import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { encodeGraph } from "../src/cli/graph";
import { createHostFunction } from "../src/effects";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { resolveBoolean } from "../src/symbolic";
import { Undefined, WithProperties } from "../src/types";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

for (const source of [
  'const value = /a/g; module.exports = typeof value === "object" && !!value && value instanceof Object && value === value && value !== /a/g;',
  'function make() { return /(?:)/; } module.exports = make() !== make();',
  'const value = /a/; const alias = value; value.lastIndex = "text"; module.exports = alias.lastIndex === "text";',
  'const value = /a/g; value.lastIndex = -0; module.exports = 1 / value.lastIndex === -Infinity;',
  'const value = /a/y; const marker = {}; value.lastIndex = marker; module.exports = value.lastIndex === marker;',
  'const value = /a/; module.exports = value.lastIndex === 0 && 1 / value.lastIndex === Infinity;',
  'module.exports = eval("/a/") !== eval("/a/") && Function("return /a/;")() !== Function("return /a/;")();'
]) test(`RegExp literal observable values match pinned Node: ${source}`, () => {
  expect(compareModule(source).loaded).toMatchObject({ type: "boolean", value: true });
});

test("private pattern and flags survive graph projection without native RegExp values", () => {
  const source = String.raw`const value = /[/]([A-Za-z\s\d~$._-]+\.\w+){1,}$/mi; function make() { return /😀\p{ASCII}/u; }`;
  const [, context] = evaluateCode(source, nodeInitialExecutionContext);
  const value = context.value.scope.value as any;
  expect(value.regexpData).toEqual({ originalSource: String.raw`[/]([A-Za-z\s\d~$._-]+\.\w+){1,}$`, originalFlags: "mi" });
  expect(Object.isFrozen(value.regexpData)).toBe(true);
  const graph = encodeGraph({ context, value });
  expect(JSON.stringify(graph)).toContain("originalSource");
  expect(JSON.stringify(graph)).toContain("😀");
  const program: any = parseECMACompliant(source);
  expect(program.body[0].declarations[0].init.value).toBeNull();
  expect(program.body[1].body.body[0].argument.value).toBeNull();
  expect(program.body[1].body.body[0].argument.regex).toEqual({ pattern: String.raw`😀\p{ASCII}`, flags: "u" });
});

test("lastIndex writes retain aliases, symbolic correlation and earlier snapshots", () => {
  const selected = ESBoolean();
  const [, before] = evaluateCode('const value = /a/g; const alias = value;',
    setVariablesInScope(nodeInitialExecutionContext, { selected }));
  const [, after] = evaluateCode(`if (selected) alias.lastIndex = 4; else value.lastIndex = 8;
    const proof = selected ? value.lastIndex === 4 : alias.lastIndex === 8;
    const uncertain = value.lastIndex === 4;`, before);
  const value = before.value.scope.value as WithProperties;
  expect(getProperties(value, before).lastIndex).toMatchObject({ value: 0 });
  expect(after.value.scope.alias).toBe(value);
  expect(resolveBoolean(after.value.scope.proof as any, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.uncertain as any, after.value.knowledge)).toBeUndefined();
});

for (const operation of [
  'value.exec("a")', 'value.test("a")', 'value.source', 'value.flags', 'value.global', 'value.constructor',
  'value.extra', 'value.extra = 1', 'value.source = "other"', 'String(value)',
  'Object.prototype.toString.call(value)', 'Object.prototype.hasOwnProperty.call(value, "lastIndex")',
  '({ ...value })', 'Object.keys(value)'
]) test(`unfinished RegExp API preserves supported siblings: ${operation}`, () => {
  const [result] = evaluateCode(`const value = /a/g; let caught = false;
    try { if (selected) { value.lastIndex = 5; ${operation}; } else value.lastIndex = 9; }
    catch (error) { caught = true; } finally { value.lastIndex = 12; }
    const finished = true;`, setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
  expect(result).toMatchObject({ type: "ForkedCompletion", state: "partial" });
  if (!isForkedCompletion(result)) throw new Error("Expected branches");
  expect(isExecutionBoundary(result.consequent[0])).toBe(true);
  expect(getProperties(result.consequent[1].value.scope.value as WithProperties, result.consequent[1]).lastIndex)
    .toMatchObject({ value: 5 });
  expect(getProperties(result.alternate[1].value.scope.value as WithProperties, result.alternate[1]).lastIndex)
    .toMatchObject({ value: 12 });
  expect(result.alternate[1].value.scope.finished).toMatchObject({ value: true });
  expect(result.alternate[1].value.scope.caught).toMatchObject({ value: false });
});

for (const pattern of [String.raw`/\8/u`, String.raw`/\M/u`, String.raw`/[a-\d]/u`, '/\\u{110000}/u']) {
  test(`flag-sensitive invalid RegExp is rejected before prefix effects or uncalled body evaluation: ${pattern}`, () => {
    let calls = 0;
    const prefix = createHostFunction("prefix", (_call, context) => { calls++; return [Undefined, context]; });
    const source = `prefix(); function neverCalled() { return ${pattern}; }`;
    expect(() => evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, { prefix }))).toThrow(SyntaxError);
    expect(calls).toBe(0);
    withModuleFixture(`console.log("must not execute"); function neverCalled() { return ${pattern}; }`, filename => {
      expect(nodeModuleObservation(filename)).toEqual({ kind: "throw", error: "SyntaxError" });
    });
  });
}

for (const flag of ["d", "v"]) test(`modern ${flag} flag remains a parser boundary, not a guest SyntaxError`, () => {
  withModuleFixture(`module.exports = typeof /a/${flag};`, filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "string", value: "object" } });
  });
  expect(() => parseECMACompliant(`/a/${flag};`)).toThrow(/parser.*not yet supported/i);
});
