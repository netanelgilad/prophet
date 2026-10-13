import { evaluateCode, isExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ESNumber, Undefined, WithProperties } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { resolveBoolean } from "../src/symbolic";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";
import { createRegExpLiteral } from "../src/regexp/RegExp";

// These expressions are complete native/VM controls; no oracle result feeds the VM.
const controls = [
  String.raw`/abc/.test("zabc!") && !/abc/.test("ab") && /^abc$/.test("abc") && !/^abc$/.test("zabc")`,
  String.raw`/^(ab|cd)+e?$/.test("abcdabe") && !/^(ab|cd)+e?$/.test("abce")`,
  String.raw`/^[a-c\d_]{2,4}$/.test("a2_c") && !/^[a-c\d_]{2,4}$/.test("a2_cd")`,
  String.raw`/^a{2}$/.test("aa") && !/^a{2}$/.test("a") && /^a{2,}$/.test("aaa") && !/^a{2,}$/.test("b")`,
  String.raw`/^a*?b+$/.test("aaabb") && /^a{0}b$/.test("b") && !/^a{0}b$/.test("ab")`,
  String.raw`/^(?:a?|)*$/.test("") && /^(?:a?|)*$/.test("aaa") && !/^(?:a?|)*$/.test("b")`,
  String.raw`/(?:)/.test("") && /a|/.test("b") && !/[]/.test("x") && /[^]/.test("\n")`,
  String.raw`/^.$/.test("a") && !/^.$/.test("\n") && !/^.$/.test("\r") && !/^.$/.test("\u2028") && !/^.$/.test("\u2029")`,
  String.raw`!/^a$/.test("a\n") && !/^a$/.test("a\r\n") && !/^a$/.test("a\u2028")`,
  String.raw`/^..$/.test("😀") && !/^.$/.test("😀") && /^\uD83D\uDE00$/.test("😀")`,
  String.raw`/^[^a-c\d]+$/.test("XYZ") && !/^[^a-c\d]+$/.test("X2")`,
  String.raw`/^\w\W\d\D\s\S$/.test("a!2x z") && !/^\w+$/.test("é")`,
  String.raw`/^\s+$/.test("\t\n\v\f\r \u00a0\u1680\u2000\u200a\u2028\u2029\u202f\u205f\u3000\ufeff") && !/\s/.test("\u180e")`,
  String.raw`/^\x41\u0042\0\t\n\r\v\f$/.test("AB\0\t\n\r\v\f") && /^[\b]$/.test("\b")`,
  String.raw`/^[\]\[\-\\\/]+$/.test("][-\\/") && !/^[\]\[\-\\\/]+$/.test("x")`,
  String.raw`/\.well-known[\\+\/]/.test(".well-known/key") && /\.well-known[\\+\/]/.test("x.well-known+key") && !/\.well-known[\\+\/]/.test("hello.txt")`,
  String.raw`/(^\.|[\\+|\/+]\.)/.test(".hidden") && /(^\.|[\\+|\/+]\.)/.test("dir/.hidden") && /(^\.|[\\+|\/+]\.)/.test("x|.hidden") && !/(^\.|[\\+|\/+]\.)/.test("hello.txt")`,
  String.raw`/[/]([A-Za-z\s\d~$._-]+\.\w+){1,}$/.test("/a.txt") && !/[/]([A-Za-z\s\d~$._-]+\.\w+){1,}$/.test("/a")`,
  String.raw`/undefined/.test() && /null/.test(null) && /true/.test(true) && /^12$/.test(12)`,
];
const programs = controls.map(expression => `module.exports = (${expression});`).concat([
  `const r = /a/; const alias = r; const test = r.test;
   module.exports = test === /b/.test && alias.test === test && test.call(r, "a") && !test.call(/b/, "a") && test.name === "test" && test.length === 1 && test.prototype === undefined;`,
  `let log = ""; const r = /a/; const marker = {valueOf() { log = log + "n"; return {}; }, toString() { log = log + "i"; return "9"; }};
   r.lastIndex = marker; const input = {toString() { log = log + "s"; return {}; }, valueOf() { log = log + "v"; return "a"; }};
   const matched = r.test(input); module.exports = matched && log === "svni" && r.lastIndex === marker;`,
  `let log = ""; const r = /a/; r.lastIndex = {valueOf() { log = log + "i"; throw "index"; }};
   let caught = false; try { r.test({toString() { log = log + "s"; return "a"; }}); } catch (e) { caught = e === "index"; }
   module.exports = caught && log === "si";`,
  `let count = 0; const r = /a/; r.lastIndex = {valueOf() { count = count + 1; return 0; }};
   let caught = false; try { r.test({toString() { throw "input"; }}); } catch (e) { caught = e === "input"; }
   module.exports = caught && count === 0;`,
  `const r = /a/; r.lastIndex = -0; const a = r.test("a"); const b = r.test("b");
   module.exports = a && !b && 1 / r.lastIndex === -Infinity;`,
  `const r = /a/; r.lastIndex = Infinity; const a = r.test("a"); r.lastIndex = NaN; const b = r.test("a");
   module.exports = a && b && r.lastIndex !== r.lastIndex;`,
  `const test = /a/.test; let caught = false; try { new test("a"); } catch (e) { caught = e instanceof TypeError; } module.exports = caught;`,
  `const test = /a/.test; let count = 0; let caught = false;
   try { test.call(null, {toString() { count = count + 1; return "a"; }}); } catch (e) { caught = e instanceof TypeError; } module.exports = caught && count === 0;`,
  `const test = /a/.test; let count = 0; let caught = false;
   try { test.call({}, {toString() { count = count + 1; return "a"; }}); } catch (e) { caught = e instanceof TypeError; } module.exports = caught && count === 1;`,
  `const test = /a/.test; let caught = false; try { test.call({exec: 3}, "a"); } catch (e) { caught = e instanceof TypeError; } module.exports = caught;`,
]);

programs.forEach((source, index) => {
  test(`native exact control ${index}`, () => withModuleFixture(source, file => {
    expect(nodeModuleObservation(file)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
  }));
  test(`VM matches native control ${index}`, () => {
    expect(compareModule(source).loaded).toMatchObject({ type: "boolean", value: true });
  });
});

test("finite input/receiver/index choices preserve correlations and snapshots", () => {
  const [, before] = evaluateCode('const r = /a/; const alias = r;',
    setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean() }));
  const [completion, after] = evaluateCode(`r.lastIndex = selected ? {valueOf() { return 7; }} : -2;
    const input = selected ? "a" : "b"; const answer = alias.test(input);
    const proof = selected ? answer : !answer; const uncertain = answer;
    const re = selected ? /a/ : /b/; const correlated = re.test(input);`, before);
  expect(completion).toBe(Undefined);
  expect(resolveBoolean(after.value.scope.proof as any, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.correlated as any, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.uncertain as any, after.value.knowledge)).toBeUndefined();
  expect(getProperties(before.value.scope.r as WithProperties, before).lastIndex).toMatchObject({ value: 0 });
});

// Non-global ToLength's resulting number is ignored, including open numeric state.
test("open numeric lastIndex is coerced but need not be concretized without g/y", () => {
  const [result, after] = evaluateCode('const r = /a/; r.lastIndex = index; const answer = r.test("a");',
    setVariablesInScope(nodeInitialExecutionContext, { index: ESNumber() }));
  expect(result).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({ value: true });
});

for (const expression of [
  '/a/g.test("a")', '/a/y.test("a")', '/a/i.test("a")', '/a/m.test("a")', '/a/s.test("a")', '/a/u.test("a")',
  '/(?=a)a/.test("a")', '/(a)\\1/.test("aa")', '/\\bword/.test("word")', '/\\cA/.test("a")', '/\\q/.test("q")',
  '/a/.test(open)', '/a/.test.call({exec() { return {}; }}, "a")',
  'r.exec = function() {}', 'r.test = function() {}'
]) test(`unsupported operation keeps effects and completed siblings: ${expression}`, () => {
  const [result] = evaluateCode(`const r = /a/; let effects = ""; let caught = false;
    try { if (selected) { effects = "before"; r.lastIndex = 7; ${expression}; } else effects = "sibling"; }
    catch (e) { caught = true; } finally { effects = effects + "!"; }
    const finished = true;`, setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean(), open: ESString() }));
  expect(isForkedCompletion(result)).toBe(true);
  if (!isForkedCompletion(result)) throw new Error("expected fork");
  expect(isExecutionBoundary(result.consequent[0])).toBe(true);
  expect(result.consequent[1].value.scope.effects).toMatchObject({ value: "before" });
  expect(result.consequent[1].value.scope.caught).toMatchObject({ value: false });
  expect(getProperties(result.consequent[1].value.scope.r as WithProperties, result.consequent[1]).lastIndex).toMatchObject({ value: 7 });
  expect(result.alternate[1].value.scope.effects).toMatchObject({ value: "sibling!" });
  expect(result.alternate[1].value.scope.finished).toMatchObject({ value: true });
});

test("a boundary after conversion and a conversion fork keeps the reached state", () => {
  const [result] = evaluateCode(`let effects = ""; const r = /a/;
    r.lastIndex = {valueOf() { effects = effects + "i"; return 8; }};
    const input = {toString() { effects = effects + "s"; return selected ? open : "a"; }};
    try { const answer = r.test(input); effects = effects + "done"; } catch (e) { effects = "caught"; }`,
    setVariablesInScope(nodeInitialExecutionContext, { selected: ESBoolean(), open: ESString() }));
  expect(isForkedCompletion(result)).toBe(true);
  if (!isForkedCompletion(result)) throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  expect(result.consequent[1].value.scope.effects).toMatchObject({ value: "si" });
  expect(result.alternate[1].value.scope.effects).toMatchObject({ value: "sidone" });
});

// Run this file with an external process timeout as well as Jest. These are VM
// values so huge sources don't first pass through Cherow's native compiler.
for (const [label, source, input] of [
  ["source", "a".repeat(513), "a"],
  ["depth", "(".repeat(33) + "a" + ")".repeat(33), "a"],
  ["repetition", "a{1000000000}", "a"],
  ["empty expansion", "(?:(?:){128}){128}", ""],
  ["states", "(?:abcdefghij){128}", "a"],
  ["input", "a", "a".repeat(4097)],
  ["work", "a{128}b", "a".repeat(4096)]
]) test(`adversarial ${label} budget is not a catchable exception or false`, () => {
  const r = createRegExpLiteral(source, "");
  const [completion, after] = evaluateCode(`let effects = ""; let caught = false; r.lastIndex = 17;
    const value = {toString() { effects = "converted"; return input; }};
    try { r.test(value); effects = "wrong"; } catch (e) { caught = true; } finally { effects = "finally"; }`,
    setVariablesInScope(nodeInitialExecutionContext, { r, input: ESString(input) }));
  expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  expect(after.value.scope.effects).toMatchObject({ value: "converted" });
  expect(after.value.scope.caught).toMatchObject({ value: false });
  expect(getProperties(r, after).lastIndex).toMatchObject({ value: 17 });
});
