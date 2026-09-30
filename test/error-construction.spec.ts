import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { ESNumber, isThrownValue } from "../src/types";
import { concretePrimitive } from "./test262/runner";

function run(source: string) {
  const [completion, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return context.value.scope;
}

test.each([
  'Error().message', 'new Error(undefined).message', 'Error(null).message',
  'new Error(-0).message', 'Error(NaN).message', 'Error(Infinity).message',
  'Error(false).message', 'Error({}).message', 'Error("ouch").toString()',
  'new TypeError("bad").toString()', 'new SyntaxError().name',
  'Error().hasOwnProperty("message")', 'Error("").hasOwnProperty("message")',
  'Error("x") === Error("x")', 'Error.prototype.constructor === Error'
])("Error construction agrees with JavaScript: %s", expression => {
  expect(concretePrimitive(run(`const result = ${expression};`).result))
    .toEqual(Function(`return (${expression});`)());
});

test("Error conversion preserves method order, receiver, and abrupt effects", () => {
  const scope = run(`
    let trace = "";
    const message = {
      marker: "m",
      toString: function() { trace = trace + this.marker; return {}; },
      valueOf: function() { trace = trace + "v"; throw "conversion failed"; }
    };
    let caught;
    try { new Error(message); trace = trace + "bad"; } catch (error) { caught = error; }
    const result = trace === "mv" && caught === "conversion failed";
  `);
  expect(scope.result).toMatchObject({ value: true });
});

test("errors keep prototype links and isolate own messages and heap mutations", () => {
  const scope = run(`
    const first = Error();
    const second = Error("own");
    Error.prototype.message = "inherited";
    Error.prototype.name = "Problem";
    const result = first.toString() === "Problem: inherited" &&
      second.toString() === "Problem: own" && !first.hasOwnProperty("message");
  `);
  expect(scope.result).toMatchObject({ value: true });
  expect(run('const result = Error().toString();').result).toMatchObject({ value: "Error" });
});

test("Error.prototype.toString is generic and converts name before reading message", () => {
  const scope = run(`
    const target = { name: { toString: function() { target.message = "changed"; return "Kind"; } }, message: "old" };
    const result = Error.prototype.toString.call(target) === "Kind: changed";
    let caught;
    try { Error.prototype.toString.call(1); } catch (error) { caught = error.name; }
  `);
  expect(scope.result).toMatchObject({ value: true });
  expect(scope.caught).toMatchObject({ value: "TypeError" });
});

test("failed ordinary conversion is an interpreted TypeError", () => {
  const scope = run(`
    let caught;
    try { Error({ toString: function() { return {}; }, valueOf: function() { return {}; } }); }
    catch (error) { caught = error.name; }
  `);
  expect(scope.caught).toMatchObject({ value: "TypeError" });
});

test("unmodeled object-literal prototype setters cannot fabricate successful conversion", () => {
  expect(() => run('const result = Error({ __proto__: null });')).toThrow(/prototype setters.*not yet supported/);
  expect(run('const result = Error({ ["__proto__"]: null }).message;').result)
    .toMatchObject({ value: "[object Object]" });
});

test("symbolic message conversion keeps both callback outcomes and their effects", () => {
  const [completion, context] = evaluateCode(`
    let calls = 0;
    let proof;
    try {
      const error = Error({ toString: function() {
        calls = calls + 1;
        if (input < 0) throw "no message";
        return "message";
      } });
      proof = error.message === "message" && calls === 1 && !(input < 0);
    } catch (error) { proof = error === "no message" && calls === 1 && input < 0; }
    const unknown = Error(input).message === "5";
  `, setVariablesInScope(nodeInitialExecutionContext, { input: ESNumber() }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.proof).toMatchObject({ value: true });
  expect(context.value.scope.unknown).toMatchObject({ value: undefined });
});

test("Error stack inspection remains an explicit host-model gap", () => {
  expect(() => run('const result = Error("x").stack;')).toThrow(/Unmodeled.*stack/);
  expect(() => run('const result = Error("x").hasOwnProperty("stack");')).toThrow(/Unmodeled.*stack/);
  expect(() => run('const result = Error("x", { cause: 1 });')).toThrow(/cause options.*not yet supported/);
});

test("Error formatting preserves symbolic names and messages", () => {
  const result = run(`
    const condition = Math.random() < 0.5;
    Error.prototype.name = condition ? "" : "Oops";
    const text = Error(condition ? "left" : "right").toString();
    const proof = condition ? text === "left" : text === "Oops: right";
    const unknown = text === "left";
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.unknown).toMatchObject({ value: undefined });
});
