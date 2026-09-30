import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { createCommonJSLoader, evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isThrownValue } from "../src/types";
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
