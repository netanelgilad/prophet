import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString, TESString } from "../src/string/String";
import { Any, ESNumber, TESBoolean, isThrownValue } from "../src/types";
import { isForkedCompletion } from "../src/execution-context/Completion";

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

describe("String.prototype.concat", () => {
  test("converts primitive arguments and preserves UTF-16 string contents", () => {
    const scope = run(`
      var empty = "hello".concat();
      var values = "".concat(undefined, null, false, true, -0, 42, NaN, Infinity, -Infinity);
      var unicode = "\\ud800".concat("\\udc00", "\\udfff");
      var constructed = String(42).concat(void 0);
      var absent = String().concat("empty");
    `);
    expect((scope.empty as TESString).value).toBe("hello");
    expect((scope.values as TESString).value).toBe("undefinednullfalsetrue042NaNInfinity-Infinity");
    expect((scope.unicode as TESString).value).toBe("\ud800\udc00\udfff");
    expect((scope.constructed as TESString).value).toBe("42undefined");
    expect((scope.absent as TESString).value).toBe("empty");
  });

  test("coerces the receiver before arguments after argument expressions have run", () => {
    const scope = run(`
      var trace = "";
      var receiver = { toString: function () { trace = trace + "r"; return "R"; } };
      function make(label) {
        trace = trace + label;
        return { toString: function () { trace = trace + label; return label; } };
      }
      var result = String.prototype.concat.call(receiver, make("a"), make("b"));
    `);
    expect((scope.trace as TESString).value).toBe("abrab");
    expect((scope.result as TESString).value).toBe("Rab");
  });

  test("uses a generic receiver and falls back to valueOf only after a nonprimitive toString result", () => {
    const scope = run(`
      var calls = 0;
      var receiver = {
        toString: function () { calls = calls + 1; return {}; },
        valueOf: function () { calls = calls + 1; return 5; }
      };
      var result = String.prototype.concat.call(receiver, true);
      var skipped = "".concat({ toString: 7, valueOf: function () { return "value"; } });
    `);
    expect((scope.result as TESString).value).toBe("5true");
    expect((scope.skipped as TESString).value).toBe("value");
    expect((scope.calls as { value: number }).value).toBe(2);
  });

  test("a coercion throw keeps prior effects and prevents subsequent conversions", () => {
    const scope = run(`
      var trace = "";
      var caught;
      try {
        "start".concat(
          { toString: function () { trace = trace + "a"; return "first"; } },
          { toString: function () { trace = trace + "b"; throw "failed"; } },
          { toString: function () { trace = trace + "c"; return "last"; } }
        );
      } catch (error) { caught = error; }
    `);
    expect((scope.trace as TESString).value).toBe("ab");
    expect((scope.caught as TESString).value).toBe("failed");
  });

  test("nullish receivers and impossible object conversion throw interpreted TypeErrors", () => {
    const scope = run(`
      var nullError, undefinedError, conversionError;
      try { String.prototype.concat.call(null); } catch (error) { nullError = error.name; }
      try { String.prototype.concat.call(undefined); } catch (error) { undefinedError = error.name; }
      try {
        "".concat({ toString: function () { return {}; }, valueOf: function () { return {}; } });
      } catch (error) { conversionError = error.name; }
    `);
    for (const name of ["nullError", "undefinedError", "conversionError"]) {
      expect((scope[name] as TESString).value).toBe("TypeError");
    }
  });

  test("concat is one inherited method and existing strings observe prototype writes", () => {
    const scope = run(`
      var existing = "before";
      var same = existing.concat === "after".concat && existing.concat === String.prototype.concat;
      var noPrototype = String.prototype.concat.prototype === undefined;
      String.prototype.concat = function () { "use strict"; return "changed"; };
      var observed = existing.concat();
    `);
    expect((scope.same as TESBoolean).value).toBe(true);
    expect((scope.noPrototype as TESBoolean).value).toBe(true);
    expect((scope.observed as TESString).value).toBe("changed");
  });

  test("the inherited string toString method is shared and enforces its receiver brand", () => {
    const scope = run(`
      var same = "first".toString === "second".toString && "first".toString === String.prototype.toString;
      var empty = String.prototype.toString.call(String.prototype);
      var rejected;
      try { String.prototype.toString.call({}); } catch (error) { rejected = error.name; }
      String.prototype.toString = function () { "use strict"; return "changed"; };
      var observed = "first".toString();
      var primitive = String("first");
    `);
    expect((scope.same as TESBoolean).value).toBe(true);
    expect((scope.empty as TESString).value).toBe("");
    expect((scope.rejected as TESString).value).toBe("TypeError");
    expect((scope.observed as TESString).value).toBe("changed");
    expect((scope.primitive as TESString).value).toBe("first");
  });

  test("symbolic string choices preserve their path relationship", () => {
    const scope = run(`
      var result = "value:".concat(guard ? "yes" : "no");
      var proof = guard ? result === "value:yes" : result === "value:no";
      var uncertain = result === "value:yes";
    `, { guard: ESBoolean() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("a symbolic coercion throw does not replay effects or convert later arguments on that path", () => {
    const scope = run(`
      var firstCalls = 0;
      var laterCalls = 0;
      var result;
      try {
        result = "prefix:".concat(
          { toString: function () { firstCalls = firstCalls + 1; if (guard) throw "failed"; return "ok"; } },
          { toString: function () { laterCalls = laterCalls + 1; return "!"; } }
        );
      } catch (error) { result = error; }
      var proof = firstCalls === 1 && (guard
        ? result === "failed" && laterCalls === 0
        : result === "prefix:ok!" && laterCalls === 1);
      var uncertain = laterCalls === 1;
    `, { guard: ESBoolean() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("unknown string and number inputs stay unknown", () => {
    const scope = run(`
      var text = "prefix:".concat(unknownText);
      var number = "number:".concat(unknownNumber);
      var proof = typeof text === "string" && typeof number === "string";
      var uncertain = text === "prefix:" || number === "number:1";
    `, { unknownText: ESString(), unknownNumber: ESNumber() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("Function.prototype.call preserves a strict function's receiver and arguments", () => {
    const scope = run(`
      function inspect(first, second) { "use strict"; return this === null && first === 1 && second === 2; }
      function exact(value) { "use strict"; return this === value; }
      var proof = inspect.call(null, 1, 2) && exact.call(undefined, undefined) && exact.call(0, 0)
        && exact.call("", "") && exact.call(false, false);
    `);
    expect((scope.proof as TESBoolean).value).toBe(true);
  });

  test("nullish receivers become the global receiver only for sloppy ordinary functions", () => {
    const scope = run(`
      var globalReceiver = this;
      function inspect() { return this === globalReceiver; }
      var proof = inspect.call(null) && inspect.call(undefined) && inspect.call();
    `);
    expect((scope.proof as TESBoolean).value).toBe(true);
  });

  test("symbolic call targets retain their effects and thrown values on the correct paths", () => {
    const scope = run(`
      var calls = 0;
      function yes(value) { calls = calls + 1; return value; }
      function no(value) { calls = calls + 1; throw value; }
      var target = guard ? yes : no;
      var result, caught = false;
      try { result = target.call(null, "value"); } catch (error) { result = error; caught = true; }
      var proof = calls === 1 && result === "value" && (guard ? caught === false : caught === true);
      var uncertain = caught;
    `, { guard: ESBoolean() });
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("sloppy primitive receiver boxing remains an explicit gap", () => {
    expect(() => run('function receiver() { return this; } var value = receiver.call(3);'))
      .toThrow(/boxing|wrapper/);
  });

  test("borrowed call rejects noncallable receivers and concat cannot be constructed", () => {
    const scope = run(`
      var callError, constructError;
      try { String.prototype.concat.call.call({}); } catch (error) { callError = error.name; }
      try { new String.prototype.concat(); } catch (error) { constructError = error.name; }
    `);
    expect((scope.callError as TESString).value).toBe("TypeError");
    expect((scope.constructError as TESString).value).toBe("TypeError");
  });

  test("String wrapper construction remains an explicit gap", () => {
    expect(() => run('var value = new String("text");')).toThrow("String wrapper construction is not yet supported");
  });

  test("a long concrete argument list does not consume the host call stack", () => {
    const argumentsSource = new Array(1500).fill('"x"').join(",");
    const scope = run(`var result = "".concat(${argumentsSource});`);
    expect((scope.result as TESString).value).toBe("x".repeat(1500));
  });

  test("String prototype identity is exposed but replacing its intrinsic property stays explicit", () => {
    const scope = run(`
      var proof = String.prototype.constructor === String && String.prototype.length === 0
        && Object.prototype.toString.call(String.prototype) === "[object String]";
    `);
    expect((scope.proof as TESBoolean).value).toBe(true);
    expect(() => run("String.prototype = {};"))
      .toThrow("Unmodeled host property write 'prototype'");
  });
});
