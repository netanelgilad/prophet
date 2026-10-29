import { spawnSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { resolveBoolean } from "../src/symbolic";
import { Undefined } from "../src/types";
import { compareModule, assertPinnedNode } from "./commonjs/oracle";

const controls = [
  String.raw`/(br|brotli)/i.test("BROTLI") && !/(br|brotli)/i.test("gzip")`,
  String.raw`/^[a-z]+$/i.test("AbC") && /^[A-Z]+$/i.test("aBc")`,
  String.raw`/^[A-z]+$/i.test("[_` + "`" + String.raw`]") && !/^[A-Z]+$/i.test("[")`,
  String.raw`! /^[^a-c]+$/i.test("ABC") && /^[^a-c]+$/i.test("XYZ")`,
  String.raw`/^\x61\u0042$/i.test("Ab") && /^\w\W\d\D\s\S$/i.test("Z!1a B")`,
  String.raw`/^[^\W]+$/i.test("Z_1") && !/^[^\W]+$/i.test("!")`,
  String.raw`/^(ab|CD){1,3}?$/i.test("ABcd") && !/^(ab|CD){1,3}?$/i.test("ABC")`,
  String.raw`let log = ""; const r = /a/i; const marker = {valueOf() { log = log + "i"; return 5; }}; r.lastIndex = marker; const answer = r.test({toString() {log = log + "s"; return "A"; }}); module.exports = answer && log === "si" && r.lastIndex === marker;`,
];
controls.forEach((expression, i) => test(`ignoreCase native comparison ${i}`, () => {
  const source = expression.startsWith("let ") ? expression : `module.exports = (${expression});`;
  expect(compareModule(source).loaded).toMatchObject({ value: true });
}));

test("finite case-insensitive choices preserve proof and unknown", () => {
  const [result, after] = evaluateCode(`const input = selected ? "BR" : "gzip";
    const answer = /(br|brotli)/i.test(input); const proof = selected ? answer : !answer;`,
    setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
  expect(result).toBe(Undefined);
  expect(resolveBoolean(after.value.scope.proof as any, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.answer as any, after.value.knowledge)).toBeUndefined();
});

for (const expression of ['/a/i.test(input)', '/\\u00e9/i.test("a")', '/é/i.test("a")', '/a/gi.test("a")']) {
  test(`boundary retains conversion effects and sibling: ${expression}`, () => {
    const [result] = evaluateCode(`let log = ""; const input = {toString() { log = log + "s"; return "é"; }};
      if (selected) { log = "before"; ${expression}; log = "wrong"; } else log = "sibling";`,
      setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
    expect(isForkedCompletion(result)).toBe(true);
    if (!isForkedCompletion(result)) throw new Error("expected fork");
    expect(result.consequent[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
    expect(result.consequent[1].value.scope.log).toMatchObject({ value: expression.includes("test(input)") ? "befores" : "before" });
    expect(result.alternate[1].value.scope.log).toMatchObject({ value: "sibling" });
  });
}

test("ignoreCase ASCII class matrix matches pinned Node", () => {
  assertPinnedNode();
  const patterns = ["[A-z]", "[^A-z]", "[a-z]", "[^a-z]", "[Z-a]", "[^Z-a]", "[\\W_]", "[^\\W_]", "\\w", "\\W", "\\s", "\\S", "\\x61", "[\\u0041-\\u005a]", "(br|brotli)", "[]", "[^]", "."];
  const inputs = Array.from({length: 128}, (_, i) => String.fromCharCode(i));
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `const [ps, xs] = JSON.parse(process.argv[1]); process.stdout.write(JSON.stringify(ps.map(p => xs.map(x => new RegExp(p, "i").test(x)))));`, JSON.stringify([patterns, inputs])], {encoding: "utf8", timeout: 10000, env: {...process.env, NODE_OPTIONS: "", NODE_PATH: ""}});
  expect(child.status).toBe(0);
  const expected = JSON.parse(child.stdout);
  patterns.forEach((pattern, p) => inputs.forEach((input, i) => {
    const [result, after] = evaluateCode(`const answer = /${pattern}/i.test(input);`, setVariablesInScope(nodeInitialExecutionContext, {input: ESString(input)}));
    expect(result).toBe(Undefined);
    expect({pattern, input, answer: (after.value.scope.answer as any).value}).toEqual({pattern, input, answer: expected[p][i]});
  }));
});

for (const pattern of ['a|\\u00e9', '[a-\\u00e9]', '[^\\u00e9]']) test(`decoded pattern domain is checked before successful prefix: ${pattern}`, () => {
  const [result] = evaluateCode(`const answer = /${pattern}/i.test("a");`, nodeInitialExecutionContext);
  expect(result).toMatchObject({type: "ExecutionBoundary", kind: "unsupported", message: "RegExp.test is not yet supported: ignoreCase non-ASCII pattern characters"});
});

for (const {label, input} of [{label: "nonASCII", input: ESString("é")}, {label: "open", input: ESString()}]) test(`domain stop follows both conversions: ${label}`, () => {
  const [result] = evaluateCode(`let log = ""; const r = /a/i;
    r.lastIndex = {valueOf() {log = log + "i"; return 7; }};
    const candidate = {toString() { log = log + "s"; return selected ? input : "A"; }};
    try { r.test(candidate); log = log + "done"; } catch (e) {log = "caught";}`, setVariablesInScope(nodeInitialExecutionContext, {selected: ESBoolean(), input}));
  expect(isForkedCompletion(result)).toBe(true);
  if (!isForkedCompletion(result)) throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
  expect(result.consequent[1].value.scope.log).toMatchObject({value: "si"});
  expect(result.alternate[0]).toBe(Undefined);
  expect(result.alternate[1].value.scope.log).toMatchObject({value: "sidone"});
});

test("input cap precedes ASCII domain scan", () => {
  const [result] = evaluateCode('/a/i.test(input);', setVariablesInScope(nodeInitialExecutionContext, {input: ESString("é".repeat(4097))}));
  expect(result).toMatchObject({type: "ExecutionBoundary", kind: "budget", message: "RegExp.test exceeded its input length budget"});
});
