import { execFileSync } from "child_process";
import { createFileSystemModel, fileSystemDirectory, fileSystemFile, evaluateCode,
  nodeInitialExecutionContext, hasExecutionBoundary, isThrownValue, isForkedCompletion } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { assertPinnedNode, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

for (const file of ["file.txt", "missing.txt"]) {
  test(`stream callback state and event order match pinned Node for ${file}`, () => {
    const source = `const stream = fs.createReadStream(${JSON.stringify(file)});
      let trace = "";
      stream.on("data", function(chunk) { trace = trace + "data:" + stream.bytesRead + ":" + stream.closed + ","; });
      stream.on("end", function() { trace = trace + "end:" + stream.bytesRead + ":" + stream.closed + ","; });
      stream.on("error", function(error) { trace = trace + error.code + ":" + stream.bytesRead + ":" + stream.closed + ","; });
      stream.on("close", function() { trace = trace + "close:" + stream.bytesRead + ":" + stream.closed; });`;
    const expected = withModuleGraphFixture({ "file.txt": "abc" }, (_files, directory) =>
      execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
        ["-e", `const fs = require("node:fs"); ${source}
          stream.on("close", function() { process.stdout.write(trace); });`],
        { cwd: directory, encoding: "utf8", timeout: 10000,
          env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }));
    const model = createFileSystemModel({ root: fileSystemDirectory({
      "file.txt": fileSystemFile("abc") }), cwd: "/" });
    const setup = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, { fs: model.module }));
    expect(hasExecutionBoundary(setup[0])).toBe(false);
    expect(isThrownValue(setup[0])).toBe(false);
    expect(isForkedCompletion(setup[0])).toBe(false);
    const delivered = model.deliverReadStream(model.createdReadStreams[0], setup[1]);
    expect(hasExecutionBoundary(delivered[0])).toBe(false);
    expect(isThrownValue(delivered[0])).toBe(false);
    expect(isForkedCompletion(delivered[0])).toBe(false);
    expect(delivered[1].value.scope.trace).toMatchObject({ value: expected });
    expect(() => model.deliverReadStream(model.createdReadStreams[0], delivered[1]))
      .toThrow(/repeat fs ReadStream delivery/);
  });
}
