import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Undefined, WithProperties } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { resolveBoolean } from "../src/symbolic";
import { createRegExpLiteral } from "../src/regexp/RegExp";
import { matches } from "../src/regexp/matcher";
import { withValue } from "../src/conversion/toString";
import { test262Root } from "./test262/runner";

// Independent review of source82356b6. Native controls run only in a separate,
// version-checked process. No worker result data is imported as expectations.
function native(body: string, input: any = null): any {
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", 'if (process.version !== "v24.21.0") throw Error(process.version);' +
      'const input = JSON.parse(process.argv[1]);' + body, JSON.stringify(input)],
    { cwd: "/Users/netanelgilad/development/prophet-worktrees/review-p007-regexp-test",
      encoding: "utf8", timeout: 15000, maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}

const atoms = ["(?:)", "a?", "a|", "|b", "^|a", "$|b", "a|ab", "ab|a", "[]|b", "[^a]", "[a-b]", "\\d|a"];
const suffixes = ["*", "+", "?", "{0}", "{2}", "{1,3}", "{2,}", "{0,3}?"];
const patterns: string[] = [];
for (const atom of atoms) for (const suffix of suffixes) {
  patterns.push("^(?:" + atom + ")" + suffix + "b?$", "(?:" + atom + ")" + suffix + "a$");
}
patterns.push("^(?:(?:a?|b?){1,3}){2,3}$", "^(?:(?:^|a)*|b)+$", "^(?:(?:$|b)?a?)*$",
  "^[\\]-a]+$", "^[\\x2d-a]+$", "^[^\\D\\W]+$", "^[\\S\\d]+$", "^[\\uD800-\\uDFFF]{2}$",
  "^é+$", "^😀?$", "^\\uD83D\\uDE00?$", "^a$\\n", "a$b", "^$^", "^[^]$", "^[]*$");
const inputs = ["", "a", "b", "c", "0", "1", "é", "😀", "\uD800", "\uDC00", "\n", "\r", "\r\n", "\u2028", "\u2029", "a\n", "a\r\n", "\nabc", "ab\u2028", "]", "^", "_", "-", "`"];
for (let length = 2; length <= 5; length++) {
  for (let bits = 0; bits < (1 << length); bits++) {
    let s = "";
    for (let i = 0; i < length; i++) s += bits & (1 << i) ? "a" : "b";
    inputs.push(s);
  }
}

test("independent nullable/anchor/range/UTF-16 matrix against pinned Node", () => {
  const expected = native('process.stdout.write(JSON.stringify(input[0].map(p => { const r = new RegExp(p); return input[1].map(s => r.test(s)); })));', [patterns, inputs]);
  const mismatches: any[] = [];
  patterns.forEach((pattern, p) => inputs.forEach((input, i) => {
    const actual = matches(pattern, input);
    if (actual !== expected[p][i]) mismatches.push({ pattern, input, actual, expected: expected[p][i] });
  }));
  expect(mismatches).toEqual([]);
  // Also traverse actual parsed literals and the intrinsic for every pattern.
  patterns.forEach((pattern, p) => {
    const input = inputs[p % inputs.length];
    const [completion, after] = evaluateCode('const answer = /' + pattern + '/.test(input);',
      setVariablesInScope(nodeInitialExecutionContext, { input: ESString(input) }));
    expect(completion).toBe(Undefined);
    expect((after.value.scope.answer as any).value).toBe(expected[p][p % inputs.length]);
  });
  console.log("INDEPENDENT_MATRIX", JSON.stringify({ patterns: patterns.length, inputs: inputs.length,
    directComparisons: patterns.length * inputs.length, interpretedComparisons: patterns.length }));
});

test("independent complete BMP classification for whitespace, word, digit and complements", () => {
  const classes = ["\\s", "\\S", "\\w", "\\W", "\\d", "\\D", ".", "[^]", "[]", "[^\\s\\S]"];
  const expected = native('process.stdout.write(JSON.stringify(input.map(p => { const r = new RegExp("^" + p + "$"); let bits = ""; for (let c = 0; c < 65536; c++) bits += r.test(String.fromCharCode(c)) ? "1" : "0"; return bits; })));', classes);
  for (let p = 0; p < classes.length; p++) {
    let actual = "";
    for (let c = 0; c < 65536; c++) actual += matches("^" + classes[p] + "$", String.fromCharCode(c)) ? "1" : "0";
    expect(actual).toBe(expected[p]);
  }
  console.log("INDEPENDENT_BMP", classes.length * 65536);
});

const concretePrograms = [
  'const r = /a/; const t = r.test; let n = 0; Object.prototype.exec = function() { n = n + 1; return null; }; const answer = t.call(r, "a") && n === 0;',
  'const r = /a/; let n = 0; let caught = false; try { r.test.call(7, {toString() { n = 1; return "a"; }}); } catch(e) { caught = e instanceof TypeError; } const answer = caught && n === 0;',
  'const t = /a/.test; let n = 0; let caught = false; try { t.call({exec: null}, {toString() { n = 1; throw "x"; }}); } catch(e) { caught = e === "x"; } const answer = caught && n === 1;',
  'Object.prototype.exec = 42; let n = 0; let caught = false; try { /a/.test.call({}, {toString() { n = 1; return "a"; }}); } catch(e) { caught = e instanceof TypeError; } const answer = caught && n === 1;',
  'const r = /a/; let order = ""; r.lastIndex = {valueOf() { order = order + "i"; return {}; }, toString() { order = order + "j"; return {}; }}; let caught = false; try { r.test({toString() { order = order + "s"; return "a"; }}); } catch(e) { caught = e instanceof TypeError; } const answer = caught && order === "sij";',
  'const r = /a/; const alias = r; let n = 0; const old = {valueOf() { n = n + 1; alias.lastIndex = 19; return -Infinity; }}; r.lastIndex = old; const yes = r.test("a"); const no = r.test("b"); const answer = yes && !no && n === 1 && alias.lastIndex === 19;',
  'const r = /a/; let trace = ""; r.lastIndex = {valueOf() { trace = trace + "i"; return 0; }}; const arg = {toString() { const nested = /b/.test("b"); trace = trace + "s"; return nested ? "a" : "x"; }}; const answer = r.test(arg) && trace === "si";'
];
concretePrograms.forEach((source, i) => test("independent dispatch/coercion Node control " + i, () => {
  expect(native('process.stdout.write(JSON.stringify(Function(input + ";return answer;")()));', source)).toBe(true);
  const [completion, after] = evaluateCode(source, nodeInitialExecutionContext);
  expect(completion).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({ value: true });
}));

for (const exec of ['Object.prototype.exec = function() { return null; };', '']) {
  test("ordinary inherited callable dispatch stays an honest boundary " + exec, () => {
    const source = exec + 'let effects = ""; const receiver = ' + (exec ? '{}' : '{exec() { return {}; }}') +
      '; /a/.test.call(receiver, {toString() { effects = "converted"; return "a"; }});';
    const [completion, after] = evaluateCode(source, nodeInitialExecutionContext);
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
    expect(after.value.scope.effects).toMatchObject({ value: "converted" });
  });
}

for (const source of ['a|(?=a)', '(?:a|(a)\\1){0}', 'a|\\q', 'a|[\\d-a]', '(?:a|\\b)*']) {
  test("unsupported syntax cannot hide in successful/unexecuted alternative: " + source, () => {
    const [completion, after] = evaluateCode('let trace = ""; const r = /' + source + '/; r.lastIndex = {valueOf() { trace = trace + "i"; return 0; }}; r.test({toString() { trace = trace + "s"; return "a"; }});', nodeInitialExecutionContext);
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
    expect(after.value.scope.trace).toMatchObject({ value: "si" });
  });
}

test("independent normal/throw/unknown/budget leaves retain last coercion and old snapshot", () => {
  const initial = setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean(), open: ESString(), large: ESString("x".repeat(4097)) });
  const [, before] = evaluateCode('const r = /a/; const alias = r;', initial);
  for (const input of ['open', 'large']) {
    const [completion] = evaluateCode('let effects = ""; let caught = false; r.lastIndex = {valueOf() { effects = effects + "i"; alias.lastIndex = 29; return 0; }}; const input = {toString() { effects = "s"; return selected ? ' + input + ' : "a"; }}; try { r.test(input); effects = effects + "done"; } catch(e) { caught = true; }', before);
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw Error("missing fork");
    expect(completion.consequent[0]).toMatchObject({ type: "ExecutionBoundary", kind: input === 'open' ? "unsupported" : "budget" });
    expect(completion.consequent[1].value.scope.effects).toMatchObject({ value: "si" });
    expect(completion.consequent[1].value.scope.caught).toMatchObject({ value: false });
    expect(getProperties(before.value.scope.r as WithProperties, completion.consequent[1]).lastIndex).toMatchObject({ value: 29 });
    expect(completion.alternate[0]).toBe(Undefined);
    expect(completion.alternate[1].value.scope.effects).toMatchObject({ value: "sidone" });
    expect(getProperties(before.value.scope.r as WithProperties, before).lastIndex).toMatchObject({ value: 0 });
  }
  const [done, after] = evaluateCode('let caught = false; let matched = false; r.lastIndex = {valueOf() { if (selected) throw "index"; return 9; }}; try { matched = r.test(selected ? "b" : "a"); } catch(e) { caught = e === "index"; } const proof = selected ? caught && !matched : !caught && matched; const unknown = matched;', before);
  expect(done).toBe(Undefined);
  expect(resolveBoolean(after.value.scope.proof as any, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.unknown as any, after.value.knowledge)).toBeUndefined();
});

const resourceCases: Array<[string, string, string, string | null]> = [
  ['exact source', '.'.repeat(511) + '?', '', null],
  ['over source', '.'.repeat(512) + '?', '', 'source length'],
  ['exact depth', '('.repeat(32) + 'a' + ')'.repeat(32), '', null],
  ['over depth', '('.repeat(33) + 'a' + ')'.repeat(33), '', 'nesting'],
  ['exact states', '^' + 'a{128}'.repeat(7) + 'a{125}$', '', null],
  ['over states', '^' + 'a{128}'.repeat(7) + 'a{126}$', '', 'state count'],
  ['empty compiler work', '(?:(?:(){128}){128}){128}', '', 'work'],
  ['scan work', '[^z]{128}z', 'a'.repeat(4096), 'work'],
  ['exact input', '^z$', 'a'.repeat(4096), null],
  ['over input', '^z$', 'a'.repeat(4097), 'input length'],
  ['over count', 'a{129}', '', 'repetition']
];
resourceCases.forEach(([label, source, input, boundary]) => test('independent cap: ' + label, () => {
  const r = createRegExpLiteral(source, '');
  const [completion, after] = evaluateCode('let effects = ""; let caught = false; r.lastIndex = {valueOf() { effects = effects + "i"; r.lastIndex = 31; return 0; }}; try { const answer = r.test({toString() { effects = "s"; return input; }}); } catch(e) { caught = true; }',
    setVariablesInScope(nodeInitialExecutionContext, { r, input: ESString(input) }));
  if (boundary) expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "budget", message: 'RegExp.test exceeded its ' + boundary + ' budget' });
  else expect(completion).toBe(Undefined);
  expect(after.value.scope.effects).toMatchObject({ value: 'si' });
  expect(after.value.scope.caught).toMatchObject({ value: false });
  expect(getProperties(r, after).lastIndex).toMatchObject({ value: 31 });
}));

test("all fifteen newly activated whole Test262 files also pass pinned Node", () => {
  const selection = readFileSync(join(__dirname, "test262.spec.ts"), "utf8");
  const expression = /"(built-ins\/RegExp\/[^"\n]+\.js)"/g;
  let match: RegExpExecArray | null;
  const sources: Array<[string, string]> = [];
  while ((match = expression.exec(selection))) sources.push([match[1], readFileSync(join(test262Root, 'test', match[1]), 'utf8')]);
  expect(sources).toHaveLength(15);
  const harness = ['sta.js', 'assert.js'].map(file => readFileSync(join(test262Root, 'harness', file), 'utf8'));
  expect(native(String.raw`const vm = require("vm"); let count = 0; for (const [name, text] of input.sources) for (const strict of [false, true]) { const context = vm.createContext({}); for (const h of input.harness) vm.runInContext(h, context, {timeout: 1000}); vm.runInContext((strict ? '"use strict";\n' : '') + text, context, {filename: name, timeout: 1000}); count++; } process.stdout.write(JSON.stringify(count));`, { sources, harness })).toBe(30);
});

// Added after observing the worker's later spec-only 4b36d385 commit while
// checking for final evidence. These are disclosed regression probes, not
// blinded discoveries. Review still targets source82356b6, unchanged here.
for (const expression of ['["a"]', 'function sample() {}']) for (const field of ['input', 'lastIndex']) {
  test('deferred coercion retains a previously completed sibling: ' + field + ' ' + expression, () => {
    const nativeSource = field === 'input'
      ? 'const answer = /a/.test(' + expression + ');'
      : 'const r = /a/; r.lastIndex = ' + expression + '; const answer = r.test("a");';
    expect(native('process.stdout.write(JSON.stringify(Function(input + ";return answer;")()));', nativeSource)).toBe(true);
    const source = 'let effects = "before"; const r = /a/; ' +
      'const candidate = selected ? "a" : ' + expression + '; ' +
      (field === 'lastIndex' ? 'r.lastIndex = candidate; ' : '') +
      'try { r.test(' + (field === 'input' ? 'candidate' : '"a"') + '); effects = "done"; } catch(e) { effects = "caught"; }';
    const [completion] = evaluateCode(source,
      setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw Error('missing retained fork');
    expect(completion.consequent[0]).toBe(Undefined);
    expect(completion.consequent[1].value.scope.effects).toMatchObject({ value: 'done' });
    expect(completion.alternate[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported' });
    expect(completion.alternate[1].value.scope.effects).toMatchObject({ value: 'before' });
  });
}

// Bounded correction review of source6bae07c: reached input effects and explicit
// customized-receiver narrowing are separate from the four original red probes.
test('correction guard retains input conversion effects and lastIndex aliases', () => {
  for (const expression of ['["a"]', 'function sample() {}']) {
    const [, before] = evaluateCode('const r = /a/; const alias = r;',
      setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
    const [completion] = evaluateCode('let effects = "prefix"; const deferred = ' + expression +
      '; const input = {toString() { effects = effects + "s"; alias.lastIndex = selected ? 7 : deferred; return "a"; }};' +
      'try { r.test(input); effects = effects + "done"; } catch(e) { effects = "caught"; }', before);
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw Error('missing correction fork');
    expect(completion.consequent[0]).toBe(Undefined);
    expect(completion.consequent[1].value.scope.effects).toMatchObject({ value: 'prefixsdone' });
    expect(completion.alternate[0]).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported',
      message: 'RegExp.test is not yet supported: array/function primitive conversion' });
    expect(completion.alternate[1].value.scope.effects).toMatchObject({ value: 'prefixs' });
    const stopped = completion.alternate[1];
    withValue(getProperties(before.value.scope.r as WithProperties, stopped).lastIndex, stopped, (value, after) => {
      expect(value).toBe(after.value.scope.deferred);
      return [Undefined, after];
    });
    expect(getProperties(before.value.scope.r as WithProperties, before).lastIndex).toMatchObject({ value: 0 });
  }
});

test('correction explicitly stops customized array/function conversion before hooks', () => {
  for (const expression of ['["a"]', 'function sample() {}']) for (const field of ['input', 'lastIndex']) {
    const source = 'let effects = "prefix"; const deferred = ' + expression +
      '; deferred.toString = function() { effects = "converted"; return "a"; };' +
      'deferred.valueOf = function() { effects = "converted"; return 0; }; const r = /a/;' +
      (field === 'lastIndex' ? 'r.lastIndex = deferred;' : '') +
      'try { r.test(' + (field === 'input' ? 'deferred' : '"a"') + '); effects = "done"; } catch(e) { effects = "caught"; }';
    const [completion, after] = evaluateCode(source, nodeInitialExecutionContext);
    expect(completion).toMatchObject({ type: 'ExecutionBoundary', kind: 'unsupported',
      message: 'RegExp.test is not yet supported: array/function primitive conversion' });
    expect(after.value.scope.effects).toMatchObject({ value: 'prefix' });
  }
});
