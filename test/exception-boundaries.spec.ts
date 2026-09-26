import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { isThrownValue } from "../src/types";

function run(source: string) {
  const [completion, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("a conditionally initialized captured binding resumes expressions only on its initialized path", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let read;
    try {
      read = function() { return captured; };
      if (guard) throw "before initialization";
      let captured = 7;
    } catch (error) {}
    let result = 0;
    let tails = 0;
    let caught = false;
    function tail() { tails = tails + 1; return 1; }
    try { result = read() + tail(); }
    catch (error) { caught = error.name === "ReferenceError"; }
    const proof = guard
      ? caught && result === 0 && tails === 0
      : !caught && result === 8 && tails === 1;
  `);
  expect(scope.proof).toMatchObject({ value: true });
});

test("throwing arguments retain the original member receiver and restore the enclosing this", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    const original = { value: 1, read: function(a, b) { return this.value + a + b; } };
    let owner = original;
    let result = 0;
    let caught = false;
    let restored = false;
    function argument() {
      owner = { value: 9 };
      if (guard) throw "argument";
      return 3;
    }
    const enclosing = {
      run: function() {
        try { result = owner.read(argument(), 2); }
        catch (error) { caught = error === "argument"; }
        finally { restored = this === enclosing; }
      }
    };
    enclosing.run();
    const proof = guard
      ? caught && result === 0 && owner.value === 9
      : !caught && result === 6 && owner.value === 9;
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.restored).toMatchObject({ value: true });
});

test("an initializer fork does not replay earlier allocations or side effects", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let saved;
    let allocations = 0;
    let result = 0;
    let caught = false;
    function allocate() {
      allocations = allocations + 1;
      saved = { value: 4 };
      return saved;
    }
    function maybe() { if (guard) throw "stop"; return 2; }
    try { result = [allocate(), maybe(), saved]; }
    catch (error) { caught = error === "stop"; }
    const proof = guard
      ? caught && result === 0 && saved.value === 4
      : !caught && result[0] === saved && result[2] === saved && result[1] === 2;
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.allocations).toMatchObject({ value: 1 });
});

test("joining same-object throws preserves heap correlation through catch and finally", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    const box = { value: 0 };
    let same = false;
    let caughtProof = false;
    let finalizers = 0;
    function fail() {
      if (guard) { box.value = 1; throw box; }
      box.value = 2;
      throw box;
    }
    try { fail(); }
    catch (error) {
      same = error === box;
      caughtProof = guard ? error.value === 1 : error.value === 2;
    } finally {
      finalizers = finalizers + 1;
      box.value = box.value + 10;
    }
    const afterProof = guard ? box.value === 11 : box.value === 12;
  `);
  expect(scope.same).toMatchObject({ value: true });
  expect(scope.caughtProof).toMatchObject({ value: true });
  expect(scope.afterProof).toMatchObject({ value: true });
  expect(scope.finalizers).toMatchObject({ value: 1 });
});
