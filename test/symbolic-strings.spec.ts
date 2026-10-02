import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { ESString } from "../src/string/String";
import { Any, ESNumber, TESBoolean, isThrownValue } from "../src/types";
import { resolveBoolean } from "../src/symbolic";
import { assertPinnedNode, compareModule } from "./commonjs/oracle";

beforeAll(assertPinnedNode);
function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { scope: context.value.scope, context };
}
function proof(source: string, inputs: { [name: string]: Any } = {}) {
  const { scope, context } = run(source, { text: ESString(), other: ESString(), flag: ESBoolean(), ...inputs });
  expect(resolveBoolean(scope.proof as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(scope.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
}
function compare(source: string) {
  expect(compareModule(source).loaded).toMatchObject({ type: "boolean", value: true });
}

for (const expression of ['"/users/" + text + ".json"', '"/users/".concat(text, ".json")', '`/users/${text}.json`']) {
  test(`concat length and known boundaries: ${expression}`, () => {
    proof(`const path = ${expression};
      const proof = path.length >= 12 && path.length >= text.length &&
        path.slice(0, 7) === "/users/" && path.slice(-5) === ".json" &&
        path.slice(7, -5) === text;
      const uncertain = path === "/users/alice.json";`);
  });
}

test("nested known chunks can be removed without deciding the unknown text", () => {
  proof(`const s = "ab" + ("cd" + text + "ef") + "gh";
    const proof = s.slice(1, 4) === "bcd" && s.slice(-4, -1) === "efg" &&
      s.slice(4, -4) === text && s.slice(0) === s && s.slice(-Infinity, Infinity) === s;
    const uncertain = s.slice(4, 5) === "x";`);
});

test("a symbolic slice preserves bounds but does not invent its contents", () => {
  proof(`const s = text.slice(2, 5);
    const proof = s.length >= 0 && s.length <= 3 && s.length <= text.length;
    const uncertain = s === "abc";`);
});

test("negative slices and lengths do not assume a minimum input length", () => {
  proof(`const tail = text.slice(-2);
    const proof = tail.length >= 0 && tail.length <= 2 && tail.length <= text.length;
    const uncertain = tail.length === 2;`);
});

test("unknown indices remain symbolic and bounded", () => {
  proof(`const result = text.slice(start, end);
    const proof = result.length >= 0 && result.length <= text.length;
    const uncertain = result === "";`, { start: ESNumber(), end: ESNumber() });
});

test("symbolic numeric text is converted rather than assumed to be an index", () => {
  proof(`const result = "abc".slice(text);
    const proof = result.length >= 0 && result.length <= 3;
    const uncertain = result === "abc";`);
});

test("finite choices retain string and index correlations", () => {
  proof(`const s = flag ? "pre:" + text : "other:" + text;
    const result = s.slice(flag ? 4 : 6);
    const proof = result === text;
    const uncertain = s.slice(0, 4) === "pre:";`);
});

test("known empty slices are still empty over an unknown string", () => {
  proof(`const proof = text.slice(Infinity) === "" && text.slice(0, -Infinity) === "" &&
      text.slice(4, 2) === "" && text.slice(-2, -4) === "";
    const uncertain = text.slice(-2, 1) === "";`);
});

test("concat length orders retain unrestricted unknown pieces", () => {
  proof(`const joined = text + other;
    const proof = joined.length >= text.length && joined.length >= other.length;
    const uncertain = joined.length === text.length;`);
});

for (const [start, end, expected] of [
  ["undefined", "undefined", "abcdef"], ["null", "true", "a"], ["NaN", "Infinity", "abcdef"],
  ["-Infinity", "-Infinity", ""], ["Infinity", "Infinity", ""], ["1.9", "4.9", "bcd"],
  ["-4.9", "-1.9", "cde"], ["-100", "100", "abcdef"], ["4", "2", ""],
  ['"2"', '"5"', "cde"], ['"bad"', "undefined", "abcdef"], ["-0", "0", ""],
  ["false", "null", ""], ["2", "-2", "cd"], ["-2", "2", ""], ["2", "-0", ""]
]) {
  test(`concrete slice ${start}, ${end}`, () => {
    compare(`module.exports = "abcdef".slice(${start}, ${end}) === ${JSON.stringify(expected)};`);
  });
}

test("slice is UTF-16 code units including split surrogate pairs and NUL", () => {
  compare(`const s = "a\\ud83d\\ude00\\ud800\\0z";
    module.exports = s.length === 6 && s.slice(1, 2) === "\\ud83d" &&
      s.slice(2, 4) === "\\ude00\\ud800" && s.slice(-2) === "\\0z";`);
});

test("receiver conversion precedes ordered numeric-hint index conversions", () => {
  compare(`let trace = "";
    const receiver = { toString: function () { trace = trace + "r"; return "abcdef"; } };
    function arg(tag, result) { trace = trace + tag;
      return { valueOf: function () { trace = trace + tag; return {}; },
        toString: function () { trace = trace + tag; return result; } }; }
    const value = String.prototype.slice.call(receiver, arg("s", 1), arg("e", 4));
    module.exports = value === "bcd" && trace === "serssee";`);
});

test("index coercion exceptions retain effects and skip following conversion", () => {
  compare(`let trace = ""; let caught;
    try { "abc".slice({ valueOf: function () { trace = trace + "s"; throw "stop"; } },
      { valueOf: function () { trace = trace + "e"; return 2; } }); }
    catch (error) { caught = error; }
    module.exports = trace === "s" && caught === "stop";`);
});

test("end is converted even when the start already guarantees an empty slice", () => {
  compare(`let calls = 0;
    const result = "abc".slice(Infinity, { valueOf: function () { calls = calls + 1; return 2; } });
    module.exports = result === "" && calls === 1;`);
});

test("nullish receiver errors happen before index conversion", () => {
  compare(`let calls = 0; let caught;
    try { String.prototype.slice.call(null, { valueOf: function () { calls = calls + 1; return 0; } }); }
    catch (error) { caught = error.name; }
    module.exports = caught === "TypeError" && calls === 0;`);
});

test("generic primitive receivers and nonprimitive numeric conversions", () => {
  compare(`let caught;
    try { "abc".slice({ valueOf: function () { return {}; }, toString: function () { return {}; } }); }
    catch (error) { caught = error.name; }
    module.exports = String.prototype.slice.call(12345, 1, 3) === "23" &&
      String.prototype.slice.call(false, 1) === "alse" && caught === "TypeError";`);
});

test("conditional conversion throws preserve each path exactly once", () => {
  proof(`let calls = 0; let result;
    try { result = "abcdef".slice({ valueOf: function () {
      calls = calls + 1; if (flag) throw "failed"; return 2;
    } }, { valueOf: function () { calls = calls + 1; return 4; } }); }
    catch (error) { result = error; }
    const proof = flag ? calls === 1 && result === "failed" : calls === 2 && result === "cd";
    const uncertain = calls === 1;`);
});

test("slice is shared, replaceable and not constructible", () => {
  compare(`const first = "before"; const original = String.prototype.slice;
    const shared = first.slice === "after".slice && original.length === 2 && original.name === "slice" && original.prototype === undefined;
    let caught; try { new original(); } catch (error) { caught = error.name; }
    String.prototype.slice = function () { "use strict"; return "changed"; };
    module.exports = shared && first.slice() === "changed" && caught === "TypeError";`);
});


test("sloppy primitive replacement boxing remains an explicit gap", () => {
  expect(() => run('String.prototype.slice = function () { return "replacement"; }; "abc".slice();'))
    .toThrow("Sloppy receiver boxing is not yet supported");
});

test("unknown host and explicit exotic primitive coercions are not ignored", () => {
  const partial = Object.assign(ESObject(), { unknownProperties: "test host", modeledPrototype: true });
  const exotic = Object.assign(ESObject(), { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESNumber(1)]]) });
  for (const value of [partial, exotic]) {
    expect(() => run('String.prototype.slice.call(input, 0);', { input: value })).toThrow(/Symbol.toPrimitive/);
    expect(() => run('"text".slice(input);', { input: value })).toThrow(/Symbol.toPrimitive/);
  }
});

for (const value of ["", "x", "a\ud83d\ude00", "\ud800", "0123456789"]) {
  test(`native witness for unrestricted boundary proof: ${JSON.stringify(value)}`, () => {
    compare(`const text = ${JSON.stringify(value)}; const path = "/users/" + text + ".json";
      module.exports = path.length >= 12 && path.length >= text.length &&
        path.slice(0, 7) === "/users/" && path.slice(-5) === ".json" && path.slice(7, -5) === text;`);
  });
}

test("symbolic boundaries count UTF-16 units rather than Unicode characters", () => {
  proof(`const value = "\\ud83d\\ude00" + text + "\\udfff";
    const proof = value.length >= 3 && value.slice(0, 1) === "\\ud83d" &&
      value.slice(1, 2) === "\\ude00" && value.slice(2, -1) === text;
    const uncertain = value.slice(2, 3) === "x";`);
});

test("known text on only one edge does not determine an overlapping slice", () => {
  proof(`const value = "ab" + text + "cd";
    const proof = value.length >= 4;
    const uncertain = value.slice(1, -1) === "bc";`);
});

test("ordinary numeric conversion skips noncallable valueOf and uses inherited methods", () => {
  compare(`function Start() {} Start.prototype.valueOf = function () { return 1; };
    const end = { valueOf: 5, toString: function () { return "3"; } };
    module.exports = "abcdef".slice(new Start(), end) === "bc";`);
});

test("an undefined end omits conversion while an object returning undefined converts to NaN", () => {
  compare(`module.exports = "abcdef".slice(1, undefined) === "bcdef" &&
    "abcdef".slice(1, { valueOf: function () { return undefined; } }) === "";`);
});

test("intrinsic slice metadata writes remain an explicit descriptor gap", () => {
  expect(() => run('String.prototype.slice.length = 9;')).toThrow("Unmodeled host property write 'length'");
  expect(() => run('String.prototype.slice.name = "other";')).toThrow("Unmodeled host property write 'name'");
});

test("a negative end before the known suffix returns empty rather than leaking suffix text", () => {
  proof(`const value = text + "abcd";
    const proof = value.slice(-2, -6) === "" && value.slice(-3, -2) === "b";
    const uncertain = value.slice(-6, -2) === "ab";`);
});

test("receiver conversion choices and throws retain index effects on only normal paths", () => {
  proof(`let calls = 0; let indexes = 0; let result;
    const receiver = { toString: function () {
      calls = calls + 1; if (flag) throw "failed"; return "pre:" + text;
    } };
    try { result = String.prototype.slice.call(receiver, { valueOf: function () {
      indexes = indexes + 1; return 4;
    } }); } catch (error) { result = error; }
    const proof = calls === 1 && (flag ? result === "failed" && indexes === 0 : result === text && indexes === 1);
    const uncertain = indexes === 1;`);
});
