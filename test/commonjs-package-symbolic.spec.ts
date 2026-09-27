import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Any, ESNumber, TESBoolean, isThrownValue, WithProperties } from "../src/types";
import { ExecutionContext, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { isForkedCompletion } from "../src/execution-context/Completion";

function initial() {
  return ExecutionContext({ ...nodeInitialExecutionContext.value, global: ESObject({
    ...nodeInitialExecutionContext.value.global.properties,
    guard: ESBoolean(), state: ESObject({ runs: ESNumber(0) })
  }) });
}

function properties(result: [Any, TExecutionContext]) {
  expect(isThrownValue(result[0])).toBe(false);
  expect(isForkedCompletion(result[0])).toBe(false);
  return getProperties(result[0] as WithProperties, result[1]);
}

test("conditional package loading and exported aliases initialize once on each path", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      let first;
      if (guard) first = require("widget");
      const second = require("widget/alias");
      const direct = require("./node_modules/widget/shared.cjs");
      module.exports = {
        proof: guard ? first === second : first === undefined,
        same: second === direct, once: state.runs === 1
      };
    `,
    "/app/node_modules/widget/package.json": '{"exports":{".":{"require":"./shared.cjs"},"./alias":"./shared.cjs"}}',
    "/app/node_modules/widget/shared.cjs": 'state.runs = state.runs + 1; module.exports = {};'
  }).load("/app/entry.cjs", initial()));
  for (const name of ["proof", "same", "once"]) expect(exported[name]).toMatchObject({ value: true });
});

test("symbolic requests retain export-denial errors and effects on their own paths", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      let chosen;
      let denied = false;
      try { chosen = require(guard ? "widget" : "widget/private.cjs"); }
      catch (error) { denied = error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"; }
      const before = state.runs;
      const loaded = require("widget");
      module.exports = {
        proof: guard
          ? !denied && chosen === loaded && before === 1
          : denied && chosen === undefined && before === 0,
        once: state.runs === 1,
        uncertain: denied
      };
    `,
    "/app/node_modules/widget/package.json": '{"exports":"./public.cjs"}',
    "/app/node_modules/widget/public.cjs": 'state.runs = state.runs + 1; module.exports = {};',
    "/app/node_modules/widget/private.cjs": 'state.runs = state.runs + 100;'
  }).load("/app/entry.cjs", initial()));
  expect(exported.proof).toMatchObject({ value: true });
  expect(exported.once).toMatchObject({ value: true });
  expect((exported.uncertain as TESBoolean).value).toBeUndefined();
});

test("different nested package copies stay distinct across a symbolic importer choice", () => {
  const exported = properties(createCommonJSLoader({
    "/app/entry.cjs": `
      const chosen = require(guard ? "./nested/importer.cjs" : "widget");
      const outer = require("widget");
      const inner = require("./nested/importer.cjs");
      module.exports = {
        proof: guard ? chosen === inner && chosen.value === 2 : chosen === outer && chosen.value === 1,
        separate: outer !== inner, once: state.runs === 2,
        uncertain: chosen === inner
      };
    `,
    "/app/nested/importer.cjs": 'module.exports = require("widget");',
    "/app/node_modules/widget/index.js": 'state.runs = state.runs + 1; exports.value = 1;',
    "/app/nested/node_modules/widget/index.js": 'state.runs = state.runs + 1; exports.value = 2;'
  }).load("/app/entry.cjs", initial()));
  for (const name of ["proof", "separate", "once"]) expect(exported[name]).toMatchObject({ value: true });
  expect((exported.uncertain as TESBoolean).value).toBeUndefined();
});
