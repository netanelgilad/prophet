import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { isThrownValue } from "../src/types";

function scope(source: string) {
  const [completion, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return context.value.scope;
}

test("ordinary and intrinsic functions share live Function.prototype methods", () => {
  const result = scope(`
    function Box() {}
    const instance = new Box();
    const identities = instance.constructor === Box && Error.constructor === Function &&
      Box.call === Function.prototype.call;
    Function.prototype.call = function() { return "changed"; };
    const inherited = Box.call() === "changed";
  `);
  expect(result.identities).toMatchObject({ value: true });
  expect(result.inherited).toMatchObject({ value: true });
});

test("primitive own-property inspection remains a boxing gap", () => {
  expect(() => scope('const result = Object.prototype.hasOwnProperty.call("abc", "0");'))
    .toThrow(/boxing.*not yet supported/);
});

test("conditional global properties preserve unresolved names and typeof", () => {
  const result = scope(`
    const condition = Math.random() < 0.5;
    if (condition) this.created = 1;
    let caught = false;
    try { created; } catch (error) { caught = error.name === "ReferenceError"; }
    const kind = typeof created;
    const proof = condition ? !caught && kind === "number" : caught && kind === "undefined";
  `);
  expect(result.proof).toMatchObject({ value: true });
});

test("strict assignment captures conditional global resolution before RHS effects", () => {
  const result = scope(`
    "use strict";
    const condition = Math.random() < 0.5;
    if (condition) this.created = 1;
    let caught = false;
    try { created = (this.created = 2); } catch (error) { caught = error.name === "ReferenceError"; }
    const proof = (condition ? !caught : caught) && this.created === 2;
  `);
  expect(result.proof).toMatchObject({ value: true });
});

test("conditional own properties retain inheritance on the other path", () => {
  const result = scope(`
    function Box() {}
    Box.prototype.message = "inherited";
    const box = new Box();
    const condition = Math.random() < 0.5;
    if (condition) box.message = "own";
    const value = box.message;
    const own = box.hasOwnProperty("message");
    const proof = condition ? value === "own" && own : value === "inherited" && !own;
    const uncertain = own;
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.uncertain).toMatchObject({ value: undefined });
});

test("an own undefined value still shadows inherited properties", () => {
  const result = scope(`
    const error = Error();
    const condition = Math.random() < 0.5;
    if (condition) error.name = undefined;
    Error.prototype.name = "Problem";
    const proof = condition ? error.name === undefined && error.hasOwnProperty("name") :
      error.name === "Problem" && !error.hasOwnProperty("name");
  `);
  expect(result.proof).toMatchObject({ value: true });
});

test("constructor prototypes are live heap links and can be chosen symbolically", () => {
  const result = scope(`
    function Box() {}
    const condition = Math.random() < 0.5;
    const left = { marker: "left" };
    const right = { marker: "right" };
    Box.prototype = condition ? left : right;
    const box = new Box();
    left.marker = "changed";
    const proof = condition ? box.marker === "changed" : box.marker === "right";
    const own = box.hasOwnProperty("marker");
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.own).toMatchObject({ value: false });
});
