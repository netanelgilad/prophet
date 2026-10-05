import { createHash } from "crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { removeSync } from "fs-extra";
import { runFile } from "../src/cli/runtime";
import { effectPaths } from "../src/effects";
import { getProperties } from "../src/execution-context/Heap";
import { isThrownValue, WithProperties } from "../src/types";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "prophet-cli-runtime-")); });
afterEach(() => { removeSync(directory); });

function run(source: string, filename = "entry.cjs", maxSteps = 100000) {
  writeFileSync(join(directory, filename), source);
  return runFile({ script: filename, args: ["argument"], maxSteps, runtime: "node@24.21.0" }, directory);
}

test("automatic startup captures source provenance and executes CommonJS metadata without native output", () => {
  const source = `console.log("ready"); module.exports = {
    filename: __filename, directory: __dirname, id: module.id,
    during: module.loaded, record: module, same: exports === this
  };`;
  const result = run(source);
  expect(result.status).toBe("evaluated");
  expect(result.input).toMatchObject({ runtime: "node@24.21.0", args: ["argument"],
    source: { text: source, sha256: createHash("sha256").update(source).digest("hex") } });
  const properties = getProperties(result.completion as WithProperties, result.current);
  expect(properties.filename).toMatchObject({ value: result.input.filename });
  expect(properties.directory).toMatchObject({ value: dirname(result.input.filename) });
  expect(properties.id).toMatchObject({ value: "." });
  expect(properties.during).toMatchObject({ value: false });
  expect(properties.same).toMatchObject({ value: true });
  expect(getProperties(properties.record as WithProperties, result.current).loaded).toMatchObject({ value: true });
  expect(result.initial.value.effects).toBeUndefined();
  expect(result.initial.value.evaluationBudget!.remaining).toBe(100000);
  expect(result.current.value.evaluationBudget!.remaining).toBeLessThan(100000);
  const output = effectPaths(result.current.value.effects)[0].events.filter(event =>
    event.kind === "return" && event.call.operation === "console.stdout.write");
  expect(output.map(event => event.call.args[0])).toMatchObject([{ value: "ready\n" }]);
});

test("console aliases share the same modeled identity", () => {
  const result = run(`module.exports = require("console") === console && require("node:console") === console;`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ value: true });
});

test("fresh symbolic randomness retains exclusive output alternatives and shared continuation", () => {
  const result = run(`if (Math.random() < 0.5) console.log("left"); else console.log("right"); console.log("done");`);
  expect(result.status).toBe("evaluated");
  const paths = effectPaths(result.current.value.effects);
  expect(paths.map(path => path.events.filter(event => event.kind === "return" &&
    event.call.operation === "console.stdout.write").map(event => (event.call.args[0] as { value: string }).value)))
    .toEqual([["left\n", "done\n"], ["right\n", "done\n"]]);
  expect(paths.every(path => path.knowledge.length > 0)).toBe(true);
});

test.each(["require('fs').readFileSync('unknown')", "process.env", "Math.sin(0)", "typeof fetch"])(
  "unsupported startup cannot become an application exception or fabricated absence: %s", operation => {
    const result = run(`console.log("before"); try { ${operation}; } catch (error) { console.log("caught"); } console.log("after");`);
    expect(result.status).toBe("analysis-stop");
    if (operation.startsWith("require")) expect(result.completion).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
    else expect(result.completion).toBeUndefined();
    expect(result.diagnostic).toBeTruthy();
    const writes = effectPaths(result.current.value.effects)[0].events.filter(event =>
      event.kind === "return" && event.call.operation === "console.stdout.write");
    expect(writes.map(event => event.call.args[0])).toMatchObject([{ value: "before\n" }]);
  }
);

test("captured local code is not executed natively", () => {
  const marker = join(directory, "marker");
  writeFileSync(marker, "unchanged");
  writeFileSync(join(directory, "dependency.js"), `require('fs').writeFileSync(${JSON.stringify(marker)}, 'changed');`);
  const result = run(`require('./dependency.js');`);
  expect(result.status).toBe("analysis-stop");
  expect(readFileSync(marker, "utf8")).toBe("unchanged");
});

test("JavaScript throws remain execution completions", () => {
  const result = run(`console.log("before"); throw "stop";`);
  expect(result.status).toBe("evaluated");
  expect(isThrownValue(result.completion!)).toBe(true);
  expect(result.completion).toMatchObject({ value: { value: "stop" } });
});

test("the execution budget stops recursion with a partial checkpoint", () => {
  const result = run(`console.log("before"); function recurse() { return recurse(); } recurse();`, "entry.cjs", 100);
  expect(result.status).toBe("analysis-stop");
  expect(result.diagnostic).toMatch(/budget/);
  expect(result.current.value.effects).toBeDefined();
});

test("package metadata selects the captured .js entry format while .cjs remains CommonJS", () => {
  writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
  const esm = run(`console.log("must not run");`, "entry.js");
  expect(esm.status).toBe("analysis-stop");
  expect(esm.current.value.effects).toBeUndefined();
  expect(Array.from(esm.input.sources.values()).some(source => source.text.includes('"module"'))).toBe(true);
  expect(run(`module.exports = true;`, "entry.cjs").completion).toMatchObject({ value: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "commonjs" }));
  expect(run(`module.exports = true;`, "entry.js").completion).toMatchObject({ value: true });
});

test("unsupported file formats stop explicitly and missing entry acquisition fails before execution", () => {
  expect(run(`console.log("must not run");`, "entry.mjs").status).toBe("analysis-stop");
  expect(() => runFile({ script: "absent.cjs", args: [], maxSteps: 100, runtime: "node@24.21.0" }, directory))
    .toThrow();
});

test("source acquisition does not silently replace invalid UTF-8 bytes", () => {
  writeFileSync(join(directory, "entry.cjs"), Buffer.from([0xff]));
  expect(() => runFile({ script: "entry.cjs", args: [], maxSteps: 100, runtime: "node@24.21.0" }, directory))
    .toThrow(/UTF-8/);
});

test("source acquisition rejects directories before reading them as program source", () => {
  expect(() => runFile({ script: ".", args: [], maxSteps: 100, runtime: "node@24.21.0" }, directory))
    .toThrow(/regular file/);
});

test.each([
  `Number("1") === 1`, `Number.MAX_VALUE`, `Function(1)`, `Function()`,
  `new Number(1)`, `new Boolean(false)`,
  `(function() {}).constructor(1)`, `String.constructor("a", 1)`,
  `Number.prototype.constructor("1")`, `Function.prototype.constructor(1)`, `Math.round(1.1)`
])("known incomplete intrinsic surfaces stop instead of fabricating a result: %s", expression => {
  const result = run(`module.exports = ${expression};`);
  expect(result.status).toBe("analysis-stop");
  expect(result.completion).toBeUndefined();
});

test.each([
  `Function("a", "return a")(1)`, `(new Function("a", "return a"))(1)`,
  `(function() {}).constructor("a", "return a")(1)`, `String.constructor("a", "return a")(1)`,
  `Function.prototype.constructor("a", "return a")(1)`
])("concrete dynamic Function parameters use the shared VM through each constructor alias: %s", expression => {
  const result = run(`module.exports = ${expression};`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ type: "number", value: 1 });
});

test("guarded constructors retain their known function type", () => {
  const result = run(`module.exports = typeof Number === "function" && typeof Function === "function";`);
  expect(result.status).toBe("evaluated");
  expect(result.completion).toMatchObject({ value: true });
});
