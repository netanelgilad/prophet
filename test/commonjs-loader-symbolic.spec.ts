import { createCommonJSLoader, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Any, ESNumber, TESBoolean, TESNumber, isThrownValue, WithProperties } from "../src/types";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { ESString } from "../src/string/String";

function initial(globals: { [name: string]: Any } = {}) {
  return ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...globals }) });
}

function properties(result: [Any, TExecutionContext]) {
  expect(isThrownValue(result[0])).toBe(false);
  expect(isForkedCompletion(result[0])).toBe(false);
  return getProperties(result[0] as WithProperties, result[1]);
}

test("a conditional require followed by an unconditional require initializes once on every path", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      let first;
      if (guard) first = require("./counter.cjs");
      const second = require("./counter.cjs");
      module.exports = {
        once: state.count === 1,
        same: guard ? first === second : first === undefined,
        uncertain: guard ? first.count : 0
      };
    `,
    "/app/counter.cjs": `state.count = state.count + 1; module.exports = { count: state.count };`
  });
  const result = loader.load("/app/entry.cjs", initial({
    guard: ESBoolean(), state: ESObject({ count: ESNumber(0) })
  }));
  const exported = properties(result);
  expect(exported.once).toMatchObject({ value: true });
  expect(exported.same).toMatchObject({ value: true });
  expect((exported.uncertain as TESNumber).value).toBeUndefined();
});

test("only a failed path retries its initializer, while completed dependencies stay cached", () => {
  const guard = ESBoolean();
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      let first;
      let caught = false;
      try { first = require("./unstable.cjs"); }
      catch (error) { caught = error === "init"; }
      state.fail = false;
      const second = require("./unstable.cjs");
      const child = require("./stable.cjs");
      module.exports = {
        proof: guard
          ? caught && state.attempts === 2 && first === undefined
          : !caught && state.attempts === 1 && first === second,
        child: state.childRuns === 1 && second.child === child,
        attempts: state.attempts
      };
    `,
    "/app/unstable.cjs": `
      state.attempts = state.attempts + 1;
      const child = require("./stable.cjs");
      if (state.fail) throw "init";
      module.exports = { child: child };
    `,
    "/app/stable.cjs": `state.childRuns = state.childRuns + 1; module.exports = {};`
  });
  const exported = properties(loader.load("/app/entry.cjs", initial({ guard,
    state: ESObject({ fail: guard, attempts: ESNumber(0), childRuns: ESNumber(0) })
  })));
  expect(exported.proof).toMatchObject({ value: true });
  expect(exported.child).toMatchObject({ value: true });
  expect((exported.attempts as TESNumber).value).toBeUndefined();
});

test("cache snapshots and separate loader identities do not share initialization state", () => {
  const files = { "/app/counter.cjs": `state.runs = state.runs + 1; module.exports = {};` };
  const loader = createCommonJSLoader(files);
  const starting = initial({ state: ESObject({ runs: ESNumber(0) }) });
  const first = loader.load("/app/counter.cjs", starting);
  const cached = loader.load("/app/counter.cjs", first[1]);
  const earlier = loader.load("/app/counter.cjs", starting);
  const independent = createCommonJSLoader(files).load("/app/counter.cjs", first[1]);
  expect(cached[0]).toBe(first[0]);
  expect(earlier[0]).not.toBe(first[0]);
  expect(independent[0]).not.toBe(first[0]);
  for (const result of [first, cached, earlier]) {
    const [, observed] = evaluateCode("const count = state.runs;", result[1]);
    expect(observed.value.scope.count).toMatchObject({ value: 1 });
  }
  const [, observed] = evaluateCode("const count = state.runs;", independent[1]);
  expect(observed.value.scope.count).toMatchObject({ value: 2 });
});

test("finite choices of module names preserve both dependency identity and cached effects", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      const chosen = require(guard ? "./a.cjs" : "./b.cjs");
      const a = require("./a.cjs");
      const b = require("./b.cjs");
      module.exports = {
        proof: guard ? chosen === a && chosen.value === 1 : chosen === b && chosen.value === 2,
        once: state.a === 1 && state.b === 1,
        unknown: chosen.value === 1
      };
    `,
    "/app/a.cjs": `state.a = state.a + 1; exports.value = 1;`,
    "/app/b.cjs": `state.b = state.b + 1; exports.value = 2;`
  });
  const exported = properties(loader.load("/app/entry.cjs", initial({ guard: ESBoolean(),
    state: ESObject({ a: ESNumber(0), b: ESNumber(0) })
  })));
  expect(exported.proof).toMatchObject({ value: true });
  expect(exported.once).toMatchObject({ value: true });
  expect((exported.unknown as TESBoolean).value).toBeUndefined();
});

test("a cached undefined export is still loaded and never reruns on a second require", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      const first = require("./value.cjs");
      const second = require("./value.cjs");
      module.exports = {
        once: state.runs === 1,
        same: first === second,
        proof: guard ? first === undefined : first === 42
      };
    `,
    "/app/value.cjs": `state.runs = state.runs + 1; module.exports = guard ? undefined : 42;`
  });
  const exported = properties(loader.load("/app/entry.cjs", initial({ guard: ESBoolean(),
    state: ESObject({ runs: ESNumber(0) })
  })));
  for (const name of ["once", "same", "proof"]) expect(exported[name]).toMatchObject({ value: true });
});

for (const failure of [
  { request: "1", name: "TypeError", code: "ERR_INVALID_ARG_TYPE" },
  { request: '"./missing.cjs"', name: "Error", code: "MODULE_NOT_FOUND" }
]) {
  test(`a conditional request preserves ${failure.code} and loads only its successful path`, () => {
    const loader = createCommonJSLoader({
      "/app/entry.cjs": `
        let chosen;
        let caught = false;
        try { chosen = require(guard ? "./value.cjs" : ${failure.request}); }
        catch (error) { caught = error.name === "${failure.name}" && error.code === "${failure.code}"; }
        const during = state.runs;
        const loaded = require("./value.cjs");
        module.exports = {
          proof: guard
            ? !caught && chosen === loaded && during === 1
            : caught && chosen === undefined && during === 0,
          once: state.runs === 1,
          uncertain: caught
        };
      `,
      "/app/value.cjs": `state.runs = state.runs + 1; module.exports = {};`
    });
    const exported = properties(loader.load("/app/entry.cjs", initial({
      guard: ESBoolean(), state: ESObject({ runs: ESNumber(0) })
    })));
    expect(exported.proof).toMatchObject({ value: true });
    expect(exported.once).toMatchObject({ value: true });
    expect((exported.uncertain as TESBoolean).value).toBeUndefined();
  });
}

test("an exported function can require a validator and retain its numeric proof", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      module.exports = function(value) {
        const normalize = require("./lib/normalize.cjs");
        return normalize(value);
      };
    `,
    "/app/lib/normalize.cjs": `
      const low = 20;
      const high = 80;
      module.exports = function(value) {
        if (!(value >= low && value <= high)) throw "range";
        return (value - low) / (high - low);
      };
    `
  });
  const [apply, loaded] = loader.load("/app/entry.cjs", initial());
  const [completion, result] = evaluateCode(`
    const result = apply(Math.random() * 60 + 20);
    const proof = result >= 0 && result <= 1;
    let rejected = false;
    try { apply(100); } catch (error) { rejected = error === "range"; }
  `, setVariablesInScope(loaded, { apply }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(result.value.scope.proof).toMatchObject({ value: true });
  expect(result.value.scope.rejected).toMatchObject({ value: true });
});

test("an open symbolic module name remains an explicit analysis gap", () => {
  const loader = createCommonJSLoader({ "/app/entry.cjs": `module.exports = require(request);` });
  for (const request of [ESString(), ESString([ESString("./"), ESString(), ESString(".cjs")])]) {
    expect(() => loader.load("/app/entry.cjs", initial({ request })))
      .toThrow("CommonJS require needs a concrete path or a finite choice of paths");
  }
});
