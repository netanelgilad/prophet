import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { hasInstanceSymbol } from "../src/Object/wellKnownSymbols";
import { resolveBoolean } from "../src/symbolic";
import { Any, isThrownValue, TESBoolean, WithProperties } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Public Symbol/descriptor creation is still unsupported. The embedding declares
// one own, immutable symbol value before the observed expression runs. Native
// fixtures declare the equivalent property through Node's real Symbol API.
function observe(before: string, body: string, slot = "handler", inputs: { [name: string]: Any } = {}) {
  const [setup, initialized] = evaluateCode(before, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(setup) || isForkedCompletion(setup)).toBe(false);
  const target = initialized.value.scope.target as WithProperties;
  Object.assign(target, { wellKnownSymbols: new Map([[hasInstanceSymbol, initialized.value.scope[slot]]]) });
  const [completion, context] = evaluateCode(body, initialized);
  expect(isThrownValue(completion) || isForkedCompletion(completion)).toBe(false);
  return context;
}

function native(before: string, body: string, slot = "handler") {
  return withModuleFixture(`${before}
    Object.defineProperty(target, Symbol.hasInstance, { value: ${slot} });
    ${body}
    module.exports = proof;`, filename => nodeModuleObservation(filename));
}

function compare(before: string, body: string, slot = "handler") {
  expect(native(before, body, slot)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
  expect(observe(before, body, slot).value.scope.proof).toMatchObject({ type: "boolean", value: true });
}

test("declared symbol handler receives the target and exact operand after both operand effects", () => {
  compare(`let trace = "", correct = false;
    const target = {}, input = {};
    function left() { trace = trace + "L"; return input; }
    function right() { trace = trace + "R"; return target; }
    function handler(value) { trace = trace + "H"; correct = this === target && value === input; return 1; }`,
    `const result = left() instanceof right();
    const proof = result && correct && trace === "LRH";`);
});

for (const result of ["undefined", "null", "false", "0", "0 / 0", '""', "true", "1", '"yes"', "{}", "[]"]) {
  const truthy = ["true", "1", '"yes"', "{}", "[]"].includes(result);
  test(`declared symbol handler return is converted to Boolean: ${result}`, () => {
    compare(`const target = {}; function handler(value) { return ${result}; }`,
      `const proof = (1 instanceof target) === ${truthy};`);
  });
}

test("handler-return object truthiness does not call its conversion methods", () => {
  compare(`let converted = false;
    const target = {};
    function handler() { return { valueOf: function() { converted = true; throw "wrong"; },
      toString: function() { converted = true; throw "wrong"; } }; }`,
    `const proof = 1 instanceof target && !converted;`);
});

test("declared symbol handler throws preserve earlier changes and stop the following statement", () => {
  compare(`let trace = "", caught = false;
    const target = {};
    function handler() { trace = trace + "H"; throw "failure"; }`,
    `try { 1 instanceof target; trace = trace + "wrong"; }
    catch (error) { caught = error === "failure"; }
    const proof = caught && trace === "H";`);
});

for (const handler of ["undefined", "null", "1", "{}"] ) {
  test(`declared noncallable target symbol value follows GetMethod/fallback rules: ${handler}`, () => {
    compare(`const target = {}; const handler = ${handler};`,
      `let caught = false;
      try { 1 instanceof target; } catch (error) { caught = error.name === "TypeError"; }
      const proof = caught;`);
  });
}

for (const handler of ["undefined", "null"]) {
  test(`nullish own symbol values on callable targets retain ordinary instance fallback: ${handler}`, () => {
    compare(`function target() {} const input = new target(); const handler = ${handler};`,
      `const proof = input instanceof target && !(1 instanceof target);`);
  });
}

test("an inherited declared symbol handler receives the original target", () => {
  const before = `let correct = false; const target = {}, parent = {};
    function handler(value) { correct = this === target && value === 1; return true; }`;
  const body = `const proof = 1 instanceof target && correct;`;
  expect(withModuleFixture(`${before}
    Object.defineProperty(parent, Symbol.hasInstance, { value: handler });
    Object.setPrototypeOf(target, parent);
    ${body} module.exports = proof;`, filename => nodeModuleObservation(filename)))
    .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  const [, initialized] = evaluateCode(before, nodeInitialExecutionContext);
  Object.assign(initialized.value.scope.parent, {
    wellKnownSymbols: new Map([[hasInstanceSymbol, initialized.value.scope.handler]])
  });
  Object.assign(initialized.value.scope.target, { prototype: initialized.value.scope.parent });
  const [completion, context] = evaluateCode(body, initialized);
  expect(isThrownValue(completion) || isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.proof).toMatchObject({ value: true });
});

test("an explicit symbol slot can establish a handler on an otherwise partial host object", () => {
  const target = Object.assign(ESObject(), { unknownProperties: "Unmodeled unrelated host fields" });
  const context = observe(`function handler(value) { return value === 7; }`,
    `const proof = 7 instanceof target;`, "handler", { target });
  expect(context.value.scope.proof).toMatchObject({ value: true });
});

test("symbolic handler results keep their condition and do not become a concrete answer", () => {
  const before = `let calls = 0; const target = {};
    function handler() { calls = calls + 1; return selected ? "" : "yes"; }`;
  const body = `const result = 1 instanceof target;
    const proof = calls === 1 && (selected ? !result : result);
    const uncertain = result;`;
  for (const selected of [false, true]) {
    expect(native(`const selected = ${selected}; ${before}`, body))
      .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  }
  const context = observe(before, body, "handler", { selected: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});

test("symbolic symbol-slot values preserve invocation versus nullish noncallable failure", () => {
  const before = `let calls = 0, caught = false, result = false; const target = {};
    const handler = selected ? function() { calls = calls + 1; return true; } : null;`;
  const body = `try { result = 1 instanceof target; }
    catch (error) { caught = error.name === "TypeError"; }
    const proof = selected ? result && !caught && calls === 1 : !result && caught && calls === 0;
    const uncertain = caught;`;
  for (const selected of [false, true]) {
    expect(native(`const selected = ${selected}; ${before}`, body))
      .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  }
  const context = observe(before, body, "handler", { selected: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});

test("symbolic handler failure preserves its condition and path-specific effects", () => {
  const before = `let trace = "", caught = false, result = false; const target = {};
    function handler() { trace = trace + "H"; if (selected) throw "stop"; return {}; }`;
  const body = `try { result = 1 instanceof target; trace = trace + "R"; }
    catch (error) { caught = error === "stop"; }
    const proof = selected ? caught && !result && trace === "H" : !caught && result && trace === "HR";
    const uncertain = caught;`;
  for (const selected of [false, true]) {
    expect(native(`const selected = ${selected}; ${before}`, body))
      .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  }
  const context = observe(before, body, "handler", { selected: ESBoolean() });
  expect(resolveBoolean(context.value.scope.proof as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});
