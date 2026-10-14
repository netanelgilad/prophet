import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

const whitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const texts = ["", "abc", whitespace, whitespace + "a" + whitespace + "b" + whitespace,
  " \u0085 ", " \u180e ", " \u200b ", " 😀\ud800\udfff ", " \0 "];
const expected = ["", "abc", "", "a" + whitespace + "b", "\u0085", "\u180e", "\u200b", "😀\ud800\udfff", "\0"];
// Escape separators in source for the pinned parser; their runtime contents are unchanged.
const literal = (text: string) => JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const programs = texts.map((text, i) => `const input = ${literal(text)};
  module.exports = input.trim() === ${literal(expected[i])} && input === ${literal(text)};`).concat([
  `const trim = String.prototype.trim; module.exports = trim.call(true) === "true" && trim.call(false) === "false"
    && trim.call(-0) === "0" && trim.call(NaN) === "NaN" && trim.call(Infinity) === "Infinity"
    && trim.call({}) === "[object Object]" && trim.call(String.prototype) === "";`,
  `let order = ""; const receiver = {toString() { order = order + "s"; return {}; }, valueOf() { order = order + "v"; return " x "; }};
    const answer = String.prototype.trim.call(receiver, {toString() { throw "unused"; }});
    module.exports = answer === "x" && order === "sv";`,
  `let order = ""; let caught = false; const receiver = {toString() { order = "s"; throw "stop"; }, valueOf() { order = "wrong"; return "x"; }};
    try { String.prototype.trim.call(receiver); } catch (e) { caught = e === "stop"; }
    module.exports = caught && order === "s";`,
  `let a = false; let b = false; let c = false;
    try { String.prototype.trim.call(null); } catch (e) { a = e instanceof TypeError; }
    try { String.prototype.trim.call(undefined); } catch (e) { b = e instanceof TypeError; }
    try { String.prototype.trim.call({toString() {return {};}, valueOf() {return {};}}); } catch(e) { c = e instanceof TypeError; }
    module.exports = a && b && c;`,
  `const old = " a "; const trim = old.trim; let caught = false;
    try { new trim(); } catch(e) { caught = e instanceof TypeError; }
    const same = trim === "b".trim && trim === String.prototype.trim;
    const metadata = trim.name === "trim" && trim.length === 0 && trim.prototype === undefined;
    String.prototype.trim = function() { "use strict"; return "changed"; };
    module.exports = caught && same && metadata && old.trim() === "changed" && trim.call(old) === "a";`,
  `function C() {} C.prototype.toString = function() { return " before "; }; const receiver = new C();
    const first = String.prototype.trim.call(receiver); C.prototype.toString = function() {return " after ";};
    module.exports = first === "before" && String.prototype.trim.call(receiver) === "after";`,
  `let order = ""; function argument() {order = order + "a"; return 0;}
    const receiver = {toString() {order = order + "s"; return " x ";}};
    module.exports = String.prototype.trim.call(receiver, argument()) === "x" && order === "as";`,
  `let order = ""; const receiver = {toString: 7, valueOf() { order = "v"; return " x "; }};
    module.exports = String.prototype.trim.call(receiver) === "x" && order === "v";`
]);
programs.forEach((source, i) => {
  test(`native exact trim control ${i}`, () => withModuleFixture(source, file => {
    expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
  }));
  test(`VM trim control ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value: true}));
});

function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}

test("finite receiver/conversion choices retain correlations, effects and mandatory unknowns", () => {
  const [completion, after] = run(`let count = 0; let answer;
    const receiver = selected ? {toString() {count = count + 1; return " yes ";}} : " no ";
    answer = String.prototype.trim.call(receiver);
    const proof = selected ? answer === "yes" && count === 1 : answer === "no" && count === 0;
    const uncertain = answer === "yes";
    let caught; try { String.prototype.trim.call(selected ? null : undefined); } catch(e) { caught = e.name; }`, {selected: ESBoolean()});
  expect(completion).toBe(Undefined);
  expect(after.value.scope.proof).toMatchObject({value: true});
  expect((after.value.scope.uncertain as any).value).toBeUndefined();
  expect(after.value.scope.caught).toMatchObject({value: "TypeError"});
});

test("coercion forks between a guest throw and a normal result without replay", () => {
  const [completion, after] = run(`let count = 0; let answer;
    try { answer = String.prototype.trim.call({toString() { count = count + 1; if(selected) throw "stop"; return " ok "; }}); }
    catch(e) { answer = e; }
    const proof = count === 1 && (selected ? answer === "stop" : answer === "ok");`, {selected: ESBoolean()});
  expect(completion).toBe(Undefined);
  expect(after.value.scope.proof).toMatchObject({value: true});
});

for (const input of [ESString(), ESNumber(), ESString([ESString(" x ")])]) {
  test(`open or legacy ${input.type} conversion preserves a stopped sibling`, () => {
    const [completion] = run(`let trace = ""; let caught = false;
      const receiver = {toString() { trace = "converted"; return selected ? input : " ok "; }};
      try { const answer = String.prototype.trim.call(receiver); trace = trace + answer; }
      catch(e) { caught = true; } finally { trace = trace + "!"; }`, {selected: ESBoolean(), input});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "converted"});
    expect(completion.consequent[1].value.scope.caught).toMatchObject({value: false});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "convertedok!"});
  });
}

for (const expression of ['[]', 'function() {}', 'input']) {
  // The last receiver has an embedding-provided inherited Symbol.toPrimitive.
  test(`exotic receiver stays explicit: ${expression}`, () => {
    const proto = ESObject({}); proto.wellKnownSymbols = new Map([[toPrimitiveSymbol, ESNumber(1)]]);
    const [completion] = run(`let trace = "";
      if (selected) { trace = "before"; String.prototype.trim.call(${expression}); }
      else { trace = "sibling"; }`, {selected: ESBoolean(), input: {...ESObject({}), prototype: proto}});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "before"});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
  });
}

// Run under an external timeout; input is injected so parser/source preparation
// does not dominate the measured trim scan or allocate a source-sized copy.
for (const text of [" ".repeat(65536), "x".repeat(65536)]) test("inclusive scan/allocation bound", () => {
  const [completion, after] = run('const answer = input.trim();', {input: ESString(text)});
  expect(completion).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({value: text[0] === " " ? "" : text});
});
for (const text of [" ".repeat(65537), "x".repeat(1000000)]) test("over-limit conversion retains state and normal sibling", () => {
  const [completion] = run(`let trace = ""; let caught = false;
    try { const result = String.prototype.trim.call({toString() {trace = "converted"; return selected ? input : " ok ";}}); trace = result; }
    catch(e) {caught = true;} finally {trace = trace + "!";}`, {selected: ESBoolean(), input: ESString(text)});
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw new Error("expected fork");
  expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "budget"});
  expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "converted"});
  expect(completion.consequent[1].value.scope.caught).toMatchObject({value: false});
  expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "ok!"});
});

test("lowercase retains reached trim coercion state, siblings and own replacements", () => {
  const [normal, state] = run(`let trace = "";
    if(selected) { const text = String.prototype.trim.call({toString() {trace = "converted"; return " X ";}}); trace = trace + text.toLowerCase(); }
    else { trace = "sibling"; }
    const proof = selected ? trace === "convertedx" : trace === "sibling";`, {selected: ESBoolean()});
  expect(normal).toBe(Undefined);
  expect(state.value.scope.proof).toMatchObject({value: true});
  const [done, after] = run('String.prototype.toLowerCase = function() {"use strict"; return "custom";}; const answer = " X ".trim().toLowerCase();');
  expect(done).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({value: "custom"});
});


test("conditional prototype replacement reads current heap without changing an earlier snapshot", () => {
  const [initial, before] = run('const old = " x "; const original = old.trim;', {selected: ESBoolean()});
  expect(initial).toBe(Undefined);
  const [completion, after] = evaluateCode(`if(selected) String.prototype.trim = function() {"use strict"; return "changed";};
    const answer = old.trim(); const proof = selected ? answer === "changed" : answer === "x";
    const intrinsic = original.call(old);`, before);
  expect(completion).toBe(Undefined);
  expect(after.value.scope.proof).toMatchObject({value: true});
  expect(after.value.scope.intrinsic).toMatchObject({value: "x"});
  const [untouched, snapshot] = evaluateCode('const answer = old.trim();', before);
  expect(untouched).toBe(Undefined);
  expect(snapshot.value.scope.answer).toMatchObject({value: "x"});
});

test("customized arrays/functions remain explicit before coercion, beside a normal sibling", () => {
  for (const source of ["[]", "function() {}"] ) {
    const [completion] = run(`let trace = ""; const receiver = ${source};
      receiver.toString = function() {trace = "coerced"; return " x ";};
      if(selected) { trace = "before"; String.prototype.trim.call(receiver); }
      else { trace = "sibling"; }`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "before"});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
  }
});

// Correction 1: root disclosed three false absence observations and two legacy
// enumeration failures. These are local regressions, not hidden review probes.
const partialSurfaceControls = [
  'typeof String.prototype.trimEnd === "function"',
  'typeof "x".padStart === "function"',
  'Object.prototype.hasOwnProperty.call(String.prototype, "trimEnd")',
  'Object.keys(String.prototype.trim).length === 0',
  'Object.keys(String.prototype).length === 0',
  'typeof String.prototype.trimLeft === "function" && typeof String.prototype.trimRight === "function"',
];
partialSurfaceControls.forEach((expression, i) => {
  test(`native partial String surface control ${i}`, () => withModuleFixture(`module.exports = ${expression};`, file => {
    expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
  }));
  for (const reverse of [false, true]) test(`partial String boundary ${i} keeps both branch orders (${reverse})`, () => {
    const [completion] = run(`let trace = ""; let caught = false; let fallback = false;
      try { if (${reverse ? "!selected" : "selected"}) {
        trace = "prefix"; const observed = ${expression}; if (!observed) fallback = true;
        trace = "incorrectly completed";
      } else trace = "sibling"; } catch(e) {caught = true;} finally {trace = trace + "!";}`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    const leaves = [completion.consequent, completion.alternate];
    const stopped = leaves.find(leaf => (leaf[0] as any).type === "ExecutionBoundary")!;
    const normal = leaves.find(leaf => leaf[0] === Undefined)!;
    expect(stopped).toBeDefined(); expect(normal).toBeDefined();
    expect(stopped[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(stopped[1].value.scope.trace).toMatchObject({value: "prefix"});
    expect(stopped[1].value.scope.caught).toMatchObject({value: false});
    expect(stopped[1].value.scope.fallback).toMatchObject({value: false});
    expect(normal[1].value.scope.trace).toMatchObject({value: "sibling!"});
  });
});

test("deferred presence preserves key coercion and its normal/throwing siblings", () => {
  const [completion] = run(`let trace = ""; let caught;
    const key = {toString() {trace = "converted"; if(selected) return "trimEnd"; throw "key";}};
    try { const answer = Object.prototype.hasOwnProperty.call(String.prototype, key); trace = "wrong"; }
    catch(e) {caught = e; trace = trace + "caught";}`, {selected: ESBoolean()});
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw new Error("expected fork");
  expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
  expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "converted"});
  expect(completion.alternate[0]).toBe(Undefined);
  expect(completion.alternate[1].value.scope.caught).toMatchObject({value: "key"});
  expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "convertedcaught"});
});

for (const operation of ['typeof "x".trimEnd', 'Object.prototype.hasOwnProperty.call(String.prototype, "trimEnd")']) {
  test(`conditional replacement is usable only on its installed path: ${operation}`, () => {
    const [completion] = run(`let trace = "";
      if(selected) String.prototype.trimEnd = function() {"use strict"; return "custom";};
      const observed = ${operation}; trace = "observed";
      const answer = "x".trimEnd();`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toBe(Undefined);
    expect(completion.consequent[1].value.scope.answer).toMatchObject({value: "custom"});
    expect(completion.alternate[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: ""});
  });
}

const preciseSurface = `const own = Object.prototype.hasOwnProperty;
  String.prototype.trimEnd = undefined;
  String.prototype.padStart = function() {"use strict"; return "custom";};
  const ordinary = {trimEnd: undefined};
  module.exports = String.prototype.trimEnd === undefined && own.call(String.prototype, "trimEnd")
    && " x ".trim() === "x" && "x".padStart() === "custom"
    && own.call(String.prototype, "trim") && own.call(String.prototype, "length")
    && own.call(String.prototype.trim, "name") && own.call(String.prototype.trim, "length")
    && !own.call(String.prototype.trim, "prototype") && !own.call(String.prototype.trim, "call")
    && own.call(ordinary, "trimEnd") && !own.call({}, "trimEnd")
    && ({}).trimEnd === undefined && String.prototype.notAStandardStringProperty === undefined
    && !own.call(String.prototype, "notAStandardStringProperty")
    && String.prototype.constructor === String && String.prototype.length === 0
    && Object.prototype.toString.call(String.prototype) === "[object String]"
    && String.prototype.trim.call(String.prototype) === "";`;
test("native known fields/replacements/ordinary negative controls", () => withModuleFixture(preciseSurface, file => {
  expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
}));
test("known fields/replacements/ordinary negative controls remain precise", () => {
  expect(compareModule(preciseSurface).loaded).toMatchObject({value: true});
});

test("available own-inspection syntax stops at the typed String metadata boundary", () => {
  for (const expression of ['({...String.prototype})', '({...String.prototype.trim})']) {
    const [completion] = run(`let trace = "";
      if(selected) {trace = "prefix"; const copy = ${expression}; trace = "wrong";} else trace = "sibling";`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "prefix"});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
  }
});

// A native enumeration checks that the declared standard string-keyed surface
// is complete for the pinned runtime, independently of the implementation list.
const deferredStringNames = ["anchor", "at", "big", "blink", "bold", "charAt", "charCodeAt",
  "codePointAt", "endsWith", "fontcolor", "fontsize", "fixed", "includes", "indexOf",
  "isWellFormed", "italics", "lastIndexOf", "link", "localeCompare", "match", "matchAll",
  "normalize", "padEnd", "padStart", "repeat", "replace", "replaceAll", "search", "small",
  "split", "strike", "sub", "substr", "substring", "sup", "startsWith", "toWellFormed",
  "trimStart", "trimLeft", "trimEnd", "trimRight", "toLocaleLowerCase", "toLocaleUpperCase",
  "toUpperCase"];
test("native pinned String prototype own-name inventory", () => {
  const names = deferredStringNames.concat(["length", "constructor", "concat", "slice", "toString", "trim", "toLowerCase", "valueOf"]).sort();
  withModuleFixture(`module.exports = Object.getOwnPropertyNames(String.prototype).sort().join("|") === ${JSON.stringify(names.join("|"))};`, file => {
    expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
  });
});
test("every deferred own name stops reads and presence without guessing absence", () => {
  for (const name of deferredStringNames) {
    for (const expression of [`String.prototype[${JSON.stringify(name)}]`,
      `Object.prototype.hasOwnProperty.call(String.prototype, ${JSON.stringify(name)})`]) {
      const [completion, after] = run(`let trace = "prefix"; const observation = ${expression}; trace = "wrong";`);
      expect(completion).toMatchObject({type: "ExecutionBoundary", kind: "unsupported",
        message: `String.prototype.${name} is not yet supported`});
      expect(after.value.scope.trace).toMatchObject({value: "prefix"});
    }
  }
});
test("trim metadata guards retain state beside completed siblings", () => {
  for (const operation of ['const observed = typeof String.prototype.trim.bind;', 'String.prototype.trim.name = "other";']) {
    const [completion] = run(`let trace = "";
      if(selected) {trace = "prefix"; ${operation} trace = "wrong";} else trace = "sibling";`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);
    if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "prefix"});
    expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
  }
});
