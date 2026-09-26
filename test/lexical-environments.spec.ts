import { evaluateCode, nodeInitialExecutionContext } from "../src";
import {
  setVariablesInScope,
  TExecutionContext
} from "../src/execution-context/ExecutionContext";
import { ESNumber, TESBoolean, TESNumber } from "../src/types";

function run(source: string, initial: TExecutionContext = nodeInitialExecutionContext) {
  const [, context] = evaluateCode(source, initial);
  expect(context.value.uncaught).toBeUndefined();
  return context;
}

describe("lexical environments and captured binding cells", () => {
  test("independent range validators retain bounds for an arbitrary finite input", () => {
    // Every finite number is allowed; no interval assumption makes acceptance
    // concrete. Each returned function must retain its own low/high bindings.
    const input = ESNumber();
    input.knowledge = [{ kind: "finite", subject: input }];
    const initial = setVariablesInScope(nodeInitialExecutionContext, { input });
    const { scope } = run(`
      function range(low, high) {
        return function(value) { return value >= low && value <= high; };
      }
      const lower = range(0, 10);
      const upper = range(20, 30);
      const inLower = lower(input);
      const inUpper = upper(input);
      const lowerProof = inLower ? input >= 0 && input <= 10 : true;
      const upperProof = inUpper ? input >= 20 && input <= 30 : true;
      const overlap = inLower && inUpper;
      const boundaries = lower(0) && lower(10) && !lower(-1) && !lower(11)
        && upper(20) && upper(30) && !upper(10);
    `, initial).value;

    for (const name of ["lowerProof", "upperProof", "boundaries"]) {
      expect(scope[name]).toMatchObject({ type: "boolean", value: true });
    }
    expect(scope.overlap).toMatchObject({ type: "boolean", value: false });
    expect((scope.inLower as TESBoolean).value).toBeUndefined();
    expect((scope.inUpper as TESBoolean).value).toBeUndefined();
  });

  test("a closure reads its definition environment when its caller shadows a name", () => {
    const { scope } = run(`
      const value = 7;
      function read() { return value; }
      function caller(value) {
        const nested = 99;
        return read();
      }
      const result = caller(100);
      const unchanged = value;
    `).value;

    expect(scope.result).toMatchObject({ type: "number", value: 7 });
    expect(scope.unchanged).toMatchObject({ type: "number", value: 7 });
    expect(scope).not.toHaveProperty("nested");
  });

  test("two closures share updates to the same captured mutable binding", () => {
    const { scope } = run(`
      function counter() {
        let count = 0;
        return {
          increment: function() { count = count + 1; return count; },
          read: function() { return count; }
        };
      }
      const pair = counter();
      const initial = pair.read();
      const first = pair.increment();
      const observed = pair.read();
      const second = pair.increment();
      const latest = pair.read();
    `).value;

    expect(scope.initial).toMatchObject({ value: 0 });
    expect(scope.first).toMatchObject({ value: 1 });
    expect(scope.observed).toMatchObject({ value: 1 });
    expect(scope.second).toMatchObject({ value: 2 });
    expect(scope.latest).toMatchObject({ value: 2 });
    expect(scope).not.toHaveProperty("count");
  });

  test("separate factory activations own independent mutable bindings", () => {
    const { scope } = run(`
      function counter(start) {
        return function() { start = start + 1; return start; };
      }
      const first = counter(0);
      const second = counter(10);
      const a = first();
      const b = second();
      const c = first();
      const d = second();
    `).value;

    expect(scope.a).toMatchObject({ value: 1 });
    expect(scope.b).toMatchObject({ value: 11 });
    expect(scope.c).toMatchObject({ value: 2 });
    expect(scope.d).toMatchObject({ value: 12 });
  });

  test("a block capture survives both block exit and its enclosing function return", () => {
    const { scope } = run(`
      function factory() {
        let read;
        {
          let value = 3;
          read = function() { return value; };
          value = 4;
        }
        return read;
      }
      const read = factory();
      const value = 100;
      const result = read();
    `).value;

    expect(scope.result).toMatchObject({ value: 4 });
    expect(scope.value).toMatchObject({ value: 100 });
  });

  test("var hoists to the function while let shadows only within its block", () => {
    const { scope } = run(`
      function inspect() {
        const before = local;
        { var local = 1; }
        let value = 3;
        let read;
        {
          let value = 7;
          read = function() { return value; };
        }
        return [before, local, value, read()];
      }
      const values = inspect();
      const hoisted = values[0] === undefined;
      const initialized = values[1];
      const outer = values[2];
      const captured = values[3];
    `).value;

    expect(scope.hoisted).toMatchObject({ value: true });
    expect(scope.initialized).toMatchObject({ value: 1 });
    expect(scope.outer).toMatchObject({ value: 3 });
    expect(scope.captured).toMatchObject({ value: 7 });
    expect(scope).not.toHaveProperty("local");
  });

  test("lexical reads and typeof before initialization throw catchable ReferenceErrors", () => {
    const { scope } = run(`
      let readError;
      let typeError;
      try {
        const observed = later;
        let later = 1;
      } catch (error) { readError = error.name; }
      try {
        const observed = typeof later;
        let later = 1;
      } catch (error) { typeError = error.name; }
      const missing = typeof missingName;
    `).value;

    expect(scope.readError).toMatchObject({ value: "ReferenceError" });
    expect(scope.typeError).toMatchObject({ value: "ReferenceError" });
    expect(scope.missing).toMatchObject({ value: "undefined" });
  });

  test("a captured const rejects reassignment without changing its value", () => {
    const { scope } = run(`
      const value = 1;
      function change() { value = 2; }
      let failure;
      try { change(); } catch (error) { failure = error.name; }
      const preserved = value;
    `).value;

    expect(scope.failure).toMatchObject({ value: "TypeError" });
    expect(scope.preserved).toMatchObject({ value: 1 });
  });

  test("a closure retains the catch binding after the outer binding is restored", () => {
    const { scope } = run(`
      const error = "outer";
      let read;
      try { throw "caught"; }
      catch (error) {
        read = function() { return error; };
        error = "saved";
      }
      const captured = read();
      const outer = error;
    `).value;

    expect(scope.captured).toMatchObject({ value: "saved" });
    expect(scope.outer).toMatchObject({ value: "outer" });
  });

  test("named function expressions have private self bindings for recursion", () => {
    const { scope } = run(`
      const self = "outer";
      const recurse = function self(n) {
        if (n === 0) return 5;
        return self(n - 1);
      };
      const result = recurse(3);
      const outer = self;
      const named = function privateName() { return privateName; };
      const identity = named() === named;
      const leaked = typeof privateName;
    `).value;

    expect(scope.result).toMatchObject({ value: 5 });
    expect(scope.outer).toMatchObject({ value: "outer" });
    expect(scope.identity).toMatchObject({ value: true });
    expect(scope.leaked).toMatchObject({ value: "undefined" });
  });

  test("function declarations can be called before their source position", () => {
    const { scope } = run(`
      const top = later(2);
      function later(n) { return n + 1; }
      function factory() {
        const result = local();
        function local() { return 4; }
        return result;
      }
      const nested = factory();
    `).value;

    expect(scope.top).toMatchObject({ value: 3 });
    expect(scope.nested).toMatchObject({ value: 4 });
  });

  test("symbolic writes through aliased closures merge the captured cell with its guard", () => {
    const { scope } = run(`
      function cell() {
        let value = 0;
        return {
          write: function(next) { value = next; },
          read: function() { return value; }
        };
      }
      const guard = Math.random() < 0.5;
      const state = cell();
      const alias = state;
      if (guard) state.write(1);
      else alias.write(2);
      const observed = alias.read();
      const proof = guard ? observed === 1 : observed === 2;
      const same = state.read === alias.read;
      const uncertain = observed === 1;
    `).value;

    expect(scope.proof).toMatchObject({ value: true });
    expect(scope.same).toMatchObject({ value: true });
    expect((scope.observed as TESNumber).value).toBeUndefined();
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("conditional closures update only their own activation on the selected path", () => {
    const { scope } = run(`
      function counter(start) {
        return function() { start = start + 1; return start; };
      }
      const guard = Math.random() < 0.5;
      const first = counter(0);
      const second = counter(100);
      const selected = guard ? first : second;
      const observed = selected();
      const selectedProof = guard ? observed === 1 : observed === 101;
      const firstNext = first();
      const secondNext = second();
      const firstProof = guard ? firstNext === 2 : firstNext === 1;
      const secondProof = guard ? secondNext === 101 : secondNext === 102;
      const uncertain = observed < 50;
      const fromBranch = guard ? counter(5) : counter(50);
      const branchObserved = fromBranch();
      const branchProof = guard ? branchObserved === 6 : branchObserved === 51;
    `).value;

    for (const name of ["selectedProof", "firstProof", "secondProof", "branchProof"]) {
      expect(scope[name]).toMatchObject({ value: true });
    }
    expect((scope.uncertain as TESBoolean).value).toBeUndefined();
  });

  test("captured cell updates preserve earlier execution-context snapshots", () => {
    const before = run(`
      function counter() {
        let count = 0;
        return {
          increment: function() { count = count + 1; return count; },
          read: function() { return count; }
        };
      }
      const state = counter();
    `);
    const after = run(`const observed = state.increment();`, before);
    const earlier = run(`const observed = state.read();`, before);
    const independent = run(`const observed = state.increment();`, before);
    const later = run(`const next = state.increment();`, after);

    expect(after.value.scope.observed).toMatchObject({ value: 1 });
    expect(earlier.value.scope.observed).toMatchObject({ value: 0 });
    expect(independent.value.scope.observed).toMatchObject({ value: 1 });
    expect(later.value.scope.next).toMatchObject({ value: 2 });
    expect(after.value.scope.state).toBe(before.value.scope.state);
    expect(before.value.scope).not.toHaveProperty("observed");
  });
});
