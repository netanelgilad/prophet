import { createCommonJSLoader, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Any, TESBoolean, isThrownValue, WithProperties } from "../src/types";
import { ExecutionContext, setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { isForkedCompletion } from "../src/execution-context/Completion";

function initial(globals: { [name: string]: Any } = {}) {
  return ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...globals }) });
}

function properties(result: [Any, TExecutionContext]) {
  expect(isThrownValue(result[0])).toBe(false);
  expect(isForkedCompletion(result[0])).toBe(false);
  return getProperties(result[0] as WithProperties, result[1]);
}

test("a validator loaded through a directory proves bounds read from JSON configuration", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `module.exports = require("./normalize");`,
    "/app/normalize/package.json": '{"main":"./lib/normalize.js","type":"commonjs"}',
    "/app/normalize/lib/normalize.js": `
      const limits = require("../limits.json");
      module.exports = function(value) {
        if (!(value >= limits.low && value <= limits.high)) throw "range";
        return (value - limits.low) / (limits.high - limits.low);
      };
    `,
    "/app/normalize/limits.json": '{"low":20,"high":80}'
  });
  const [normalize, loaded] = loader.load("/app/entry.cjs", initial());
  const [completion, result] = evaluateCode(`
    const result = normalize(Math.random() * 60 + 20);
    const bounded = result >= 0 && result <= 1;
    let rejected = false;
    try { normalize(100); } catch (error) { rejected = error === "range"; }
    let uncertain = false;
    try { normalize(Math.random() * 100); } catch (error) { uncertain = true; }
  `, setVariablesInScope(loaded, { normalize }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(result.value.scope.bounded).toMatchObject({ value: true });
  expect(result.value.scope.rejected).toMatchObject({ value: true });
  expect((result.value.scope.uncertain as TESBoolean).value).toBeUndefined();
});

test("different request spellings retain JSON identity and path-dependent writes", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      let first;
      if (guard) {
        first = require("./settings");
        first.count = 1;
        first.__proto__ = 7;
      }
      const second = require("./settings.json");
      module.exports = {
        proof: guard
          ? first === second && second.count === 1 && second.__proto__ === 7
          : second.count === 0 && second.__proto__ === 3,
        uncertain: second.count === 0
      };
    `,
    "/app/settings.json": '{"count":0,"__proto__":3}'
  }).load("/app/entry.cjs", initial({ guard: ESBoolean() })));
  expect(exported.proof).toMatchObject({ value: true });
  expect((exported.uncertain as TESBoolean).value).toBeUndefined();
});

test("symbolic directory choices resolve independently and preserve their JSON results", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      const chosen = require(guard ? "./left/" : "./right/");
      const left = require("./left/index.json");
      const right = require("./right/data.json");
      module.exports = {
        same: guard ? chosen === left : chosen === right,
        proof: guard ? chosen.limit === 10 : chosen.limit === 100,
        uncertain: chosen.limit === 10
      };
    `,
    "/app/left/index.json": '{"limit":10}',
    "/app/right/package.json": '{"main":"data.json"}',
    "/app/right/data.json": '{"limit":100}'
  }).load("/app/entry.cjs", initial({ guard: ESBoolean() })));
  expect(exported.same).toMatchObject({ value: true });
  expect(exported.proof).toMatchObject({ value: true });
  expect((exported.uncertain as TESBoolean).value).toBeUndefined();
});

test("a symbolic choice between valid and malformed JSON keeps its catch path", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      let value;
      let caught = false;
      try { value = require(guard ? "./good" : "./bad"); }
      catch (error) { caught = error.name === "SyntaxError"; }
      const again = require("./good.json");
      module.exports = {
        proof: guard ? !caught && value === again : caught && value === undefined,
        uncertain: caught
      };
    `,
    "/app/good.json": '{"ok":true}',
    "/app/bad.json": '{'
  }).load("/app/entry.cjs", initial({ guard: ESBoolean() })));
  expect(exported.proof).toMatchObject({ value: true });
  expect((exported.uncertain as TESBoolean).value).toBeUndefined();
});
