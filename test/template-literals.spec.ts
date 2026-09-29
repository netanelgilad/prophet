import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESString, TESString } from "../src/string/String";
import { Any, ESNumber, TESBoolean, isThrownValue } from "../src/types";
import { compareModule } from "./commonjs/oracle";

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

function compare(source: string) {
  const { loaded } = compareModule(`${source}\nmodule.exports = result;`);
  expect(loaded).toMatchObject({ type: "boolean", value: true });
}

describe("untagged template literals", () => {
  test("uses cooked text, escapes, line continuations, and UTF-16 code units", () => {
    compare('const result = `` === "" && `plain` === "plain" && ' +
      '`a\\nb\\t\\u{1f600}\\ud800\\x62\\`\\${literal}` === "a\\nb\\t\\u{1f600}\\ud800b`\\${literal}" && ' +
      '`first\\\nsecond` === "firstsecond" && `first\r\nsecond` === "first\\nsecond";');
  });

  test("converts primitive substitutions and supports nested templates", () => {
    compare(`
      const primitive = \`\${undefined}|\${null}|\${false}|\${true}|\${-0}|\${42}|\${NaN}|\${Infinity}|\${-Infinity}\`;
      const nested = \`head:\${\`inside:\${3}\`}:tail\`;
      const result = primitive === "undefined|null|false|true|0|42|NaN|Infinity|-Infinity"
        && nested === "head:inside:3:tail";
    `);
  });

  test("normalizes physical CR/CRLF without changing escaped carriage returns", () => {
    compare('const result = `a\\r\\n\\x0d\\u000d\\u{d}\\\r\nz\rw\r\nq` === "a\\r\\n\\r\\r\\rz\\nw\\nq";');
  });

  test("converts each expression before evaluating the next expression", () => {
    compare(`
      let trace = "";
      let value = "before";
      function first() {
        trace = trace + "expression1:";
        return { toString: function() {
          trace = trace + "conversion1:";
          value = "after";
          return "first";
        } };
      }
      function second() { trace = trace + "expression2:"; return value; }
      const text = \`head:\${first()}:\${second()}:tail\`;
      const result = text === "head:first:after:tail" && trace === "expression1:conversion1:expression2:";
    `);
  });

  test("ordinary object conversion uses the string hint and the original receiver", () => {
    compare(`
      let trace = "";
      const object = {
        value: "fallback",
        toString: function() { trace = trace + "string:"; return {}; },
        valueOf: function() { trace = trace + "value:"; return this.value; }
      };
      const skipped = { toString: 0, valueOf: function() { return 5; } };
      const text = \`\${object}:\${skipped}:\${{}}\`;
      const result = text === "fallback:5:[object Object]" && trace === "string:value:";
    `);
  });

  for (const stage of ["expression", "conversion"]) {
    test(`an abrupt ${stage} preserves earlier effects and skips later substitutions`, () => {
      compare(`
        let trace = "";
        const failure = {};
        function first() { trace = trace + "first:"; return "value"; }
        function fail() { trace = trace + "throw:"; throw failure; }
        function later() { trace = trace + "later:"; return "later"; }
        let caught = false;
        try { \`\${first()}:\${${stage === "expression" ? "fail()" : "{ toString: fail }"}}:\${later()}\`; }
        catch (error) { caught = error === failure; }
        const result = caught && trace === "first:throw:";
      `);
    });
  }

  test("a nonprimitive result from both conversion methods throws an interpreted TypeError", () => {
    compare(`
      let trace = "";
      const object = {
        toString: function() { trace = trace + "string:"; return {}; },
        valueOf: function() { trace = trace + "value:"; return {}; }
      };
      let caught = false;
      try { \`\${object}\`; } catch (error) { caught = error.name === "TypeError"; }
      const result = caught && trace === "string:value:";
    `);
  });

  test("symbolic choices preserve correlations through several substitutions", () => {
    const scope = run(`
      const text = \`value:\${guard ? "yes" : "no"}:\${guard}\`;
      const proof = guard ? text === "value:yes:true" : text === "value:no:false";
      const uncertain = text === "value:yes:true";
    `, { guard: ESBoolean() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  for (const stage of ["expression", "conversion"]) {
    test(`a conditional ${stage} throw resumes only normal paths without replaying effects`, () => {
      const scope = run(`
        let firstCalls = 0, laterCalls = 0, convertedCalls = 0;
        function first() { firstCalls = firstCalls + 1; return "first"; }
        function convert() {
          convertedCalls = convertedCalls + 1;
          if (guard) throw "failed";
          return "ok";
        }
        function later() { laterCalls = laterCalls + 1; return "last"; }
        let result;
        try { result = \`prefix:\${first()}:\${${stage === "expression" ? "convert()" : "{ toString: convert }"}}:\${later()}:tail\`; }
        catch (error) { result = error; }
        const proof = firstCalls === 1 && convertedCalls === 1 && (guard
          ? result === "failed" && laterCalls === 0
          : result === "prefix:first:ok:last:tail" && laterCalls === 1);
        const uncertain = laterCalls === 1;
      `, { guard: ESBoolean() });
      expect((scope.proof as TESBoolean).value).toBe(true);
      expect((scope.uncertain as TESBoolean).value).toBeUndefined();
    });
  }

  test("unknown strings and numbers remain symbolic while empty affixes preserve string identity", () => {
    const scope = run(`
      const text = \`prefix:\${unknownText}\`;
      const number = \`number:\${unknownNumber}\`;
      const identity = \`\${unknownText}\` === unknownText;
      const proof = typeof text === "string" && typeof number === "string" && identity;
      const uncertainText = text === "prefix:";
      const uncertainNumber = number === "number:1";
    `, { unknownText: ESString(), unknownNumber: ESNumber() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertainText as TESBoolean).value).toBeUndefined();
    expect((scope.uncertainNumber as TESBoolean).value).toBeUndefined();
  });

  test("a long concrete substitution list does not consume the host call stack", () => {
    const substitutions = new Array(1500).fill('${"x"}').join("");
    const scope = run("const result = `" + substitutions + "`; ");
    expect((scope.result as TESString).value).toBe("x".repeat(1500));
  });

  test("tagged templates and default array/function conversion remain explicit gaps", () => {
    expect(() => run("function tag() { return 1; } const value = tag`text`;"))
      .toThrow(/TaggedTemplateExpression/);
    expect(() => run("const value = `${[1, 2]}`;"))
      .toThrow("Default array string conversion is not yet supported");
    expect(() => run("const value = `${function() {}}`;"))
      .toThrow("Function source string conversion is not yet supported");
  });
});
