import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber, isThrownValue } from "../src/types";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { assertPinnedNode, compareModuleGraph } from "./commonjs/oracle";

const fixture = join(__dirname, "fixtures/tiny-invariant-1.3.3");
const integrity = JSON.parse(readFileSync(join(fixture, "integrity.json"), "utf8"));

function packageFiles() {
  const files: { [name: string]: string } = {};
  function read(directory: string, relative: string) {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const key = relative + "/" + name;
      if (statSync(path).isDirectory()) read(path, key);
      else {
        const bytes = readFileSync(path);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(integrity.sha256[key]);
        files["node_modules/tiny-invariant/" + key.slice("package/".length)] = bytes.toString("utf8");
      }
    }
  }
  read(join(fixture, "package"), "package");
  expect(Object.keys(files)).toHaveLength(Object.keys(integrity.sha256).length);
  return files;
}

function initial() {
  return ExecutionContext({ ...nodeInitialExecutionContext.value, global: ESObject({
    ...nodeInitialExecutionContext.value.global.properties,
    process: { ...ESObject({ env: ESObject({ NODE_ENV: ESString("development") }) }),
      unknownProperties: "Node process API" }
  }) });
}

beforeAll(assertPinnedNode);

for (const mode of ["development", "production"]) {
  test(`the published invariant normalizes accepted inputs and skips its lazy message in ${mode}`, () => {
    const files: { [name: string]: string } = {
      ...packageFiles(),
      "entry.cjs": `
        process.env.NODE_ENV = "${mode}";
        const invariant = require("tiny-invariant");
        let messageCalls = 0;
        module.exports = function(value) {
          invariant(value >= 0 && value <= 100, function() {
            messageCalls = messageCalls + 1;
            return "outside range";
          });
          return { normalized: value / 100, messageCalls: messageCalls };
        };
      `
    };
    compareModuleGraph(files, "entry.cjs", "loaded(50)", initial());
    const absolute: { [name: string]: string } = {};
    Object.keys(files).forEach(name => { absolute["/app/" + name] = files[name]; });
    const [normalize, loaded] = createCommonJSLoader(absolute).load("/app/entry.cjs", initial());
    const [completion, result] = evaluateCode(`
      const result = normalize(Math.random() * 100);
      const bounded = result.normalized >= 0 && result.normalized <= 1;
      const silent = result.messageCalls === 0;
      const uncertain = result.normalized === 0.5;
    `, setVariablesInScope(loaded, { normalize }));
    expect(isThrownValue(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    expect(result.value.scope.bounded).toMatchObject({ value: true });
    expect(result.value.scope.silent).toMatchObject({ value: true });
    expect(result.value.scope.uncertain).toMatchObject({ value: undefined });
  });
}

function rejectingNormalizerFiles(mode: string): { [name: string]: string } {
  return {
    ...packageFiles(),
    "entry.cjs": `
      process.env.NODE_ENV = "${mode}";
      const invariant = require("tiny-invariant");
      let messageCalls = 0;
      function normalize(value) {
        invariant(value >= 0 && value <= 100, function() {
          messageCalls = messageCalls + 1;
          return "outside range";
        });
        return value / 100;
      }
      module.exports = {
        normalize: normalize,
        messageCalls: function() { return messageCalls; }
      };
    `
  };
}

for (const mode of ["development", "production"]) {
  const expectedMessage = mode === "development" ? "Invariant failed: outside range" : "Invariant failed";
  const rejectedCalls = mode === "development" ? 1 : 0;

  test(`the published invariant rejects any out-of-range JavaScript number or normalizes it in ${mode}`, () => {
    const files = rejectingNormalizerFiles(mode);
    const absolute: { [name: string]: string } = {};
    Object.keys(files).forEach(name => { absolute["/app/" + name] = files[name]; });
    const [api, loaded] = createCommonJSLoader(absolute).load("/app/entry.cjs", initial());
    // ESNumber() has no input restrictions: NaN and both infinities are included.
    const [completion, result] = evaluateCode(`
      let rejected = false;
      let normalized;
      let correctError = true;
      try { normalized = api.normalize(input); }
      catch (error) {
        rejected = true;
        correctError = error.name === "Error" && error.message === "${expectedMessage}";
      }
      const classification = rejected
        ? !(input >= 0 && input <= 100)
        : input >= 0 && input <= 100;
      const bounded = rejected || (normalized >= 0 && normalized <= 1);
      const calls = api.messageCalls();
      const messageEffects = rejected ? calls === ${rejectedCalls} : calls === 0;
      const uncertain = rejected ? false : normalized === 0.5;
    `, setVariablesInScope(loaded, { api, input: ESNumber() }));
    expect(isThrownValue(completion)).toBe(false);
    expect(isForkedCompletion(completion)).toBe(false);
    for (const name of ["classification", "bounded", "correctError", "messageEffects"]) {
      expect(result.value.scope[name]).toMatchObject({ value: true });
    }
    expect(result.value.scope.rejected).toMatchObject({ value: undefined });
    expect(result.value.scope.uncertain).toMatchObject({ value: undefined });
  });

  for (const input of ["-1", "101", "(0 / 0)", "(1 / 0)", "(-1 / 0)",
    "-0", "0", "5e-324", "50", "100", "100.00000000000001", "1.7976931348623157e308"]) {
    test(`the published normalizer matches Node for ${input} in ${mode}`, () => {
      compareModuleGraph(rejectingNormalizerFiles(mode), "entry.cjs", `
        (function() {
          try {
            const normalized = loaded.normalize(${input});
            return { rejected: false, normalized: normalized, calls: loaded.messageCalls() };
          } catch (error) {
            return { rejected: true, name: error.name, message: error.message, calls: loaded.messageCalls() };
          }
        })()
      `, initial());
    });
  }

  test(`a throwing lazy message runs only when the published invariant requests it in ${mode}`, () => {
    compareModuleGraph({
      ...packageFiles(),
      "entry.cjs": `
        process.env.NODE_ENV = "${mode}";
        const invariant = require("tiny-invariant");
        let calls = 0;
        let trace = "before";
        try {
          invariant(false, function() {
            calls = calls + 1;
            trace = trace + ":message";
            throw "lazy message failed";
          });
          trace = trace + ":returned";
        } catch (error) {
          trace = trace + ":caught";
          module.exports = {
            calls: calls, trace: trace, callbackFailure: error === "lazy message failed",
            name: typeof error === "object" ? error.name : undefined,
            message: typeof error === "object" ? error.message : undefined
          };
        }
      `
    }, "entry.cjs", "", initial());
  });

  test(`a lazy object's string conversion happens once after the callback in ${mode}`, () => {
    compareModuleGraph({
      ...packageFiles(),
      "entry.cjs": `
        process.env.NODE_ENV = "${mode}";
        const invariant = require("tiny-invariant");
        let trace = "";
        let calls = 0;
        let conversions = 0;
        try {
          invariant(false, function() {
            calls = calls + 1;
            trace = trace + "message";
            return {
              toString: function() {
                conversions = conversions + 1;
                trace = trace + ":string";
                return "converted detail";
              }
            };
          });
        } catch (error) {
          module.exports = {
            calls: calls, conversions: conversions, trace: trace,
            name: error.name, message: error.message
          };
        }
      `
    }, "entry.cjs", "", initial());
  });

  test(`a failure during lazy message conversion preserves its effects and thrown value in ${mode}`, () => {
    compareModuleGraph({
      ...packageFiles(),
      "entry.cjs": `
        process.env.NODE_ENV = "${mode}";
        const invariant = require("tiny-invariant");
        let trace = "";
        try {
          invariant(false, function() {
            trace = trace + "message";
            return { toString: function() { trace = trace + ":string"; throw "conversion failed"; } };
          });
        } catch (error) {
          module.exports = {
            trace: trace, conversionFailure: error === "conversion failed",
            name: typeof error === "object" ? error.name : undefined,
            message: typeof error === "object" ? error.message : undefined
          };
        }
      `
    }, "entry.cjs", "", initial());
  });
}
