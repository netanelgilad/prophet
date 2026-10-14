import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { createConsoleModel } from "../src/node/console";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
const units = Array.from({length: 128}, (_, i) => String.fromCharCode(i));
const outputs = units.slice();
// An explicit alphabet oracle; the VM does not use native casing.
for (let i = 0; i < 26; i++) outputs[65 + i] = "abcdefghijklmnopqrstuvwxyz"[i];
const matrix = units.map((input, i) => `const x${i} = ${JSON.stringify(input)}; const y${i} = x${i}.toLowerCase();
  if(y${i} !== ${JSON.stringify(outputs[i])} || x${i} !== ${JSON.stringify(input)}) throw "matrix";`).join("\n");
test("native exhaustive ASCII unit matrix", () => withModuleFixture(matrix + '\nmodule.exports = true;', file => {
  expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
}));
units.forEach((input, i) => test(`ASCII unit ${i} maps exactly and preserves input`, () => {
  const [completion, after] = run('const answer = input.toLowerCase(); const unchanged = input === original;',
    {input: ESString(input), original: ESString(input)});
  expect(completion).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({value: outputs[i]});
  expect(after.value.scope.unchanged).toMatchObject({value: true});
}));
const programs = [
  `let trace = ""; const receiver = {toString() {trace = "s"; this.valueOf = function() {trace = trace + "v"; return "CHANGED";}; return {};}, valueOf() {throw "old";}};
    module.exports = String.prototype.toLowerCase.call(receiver) === "changed" && trace === "sv";`,
  `let trace = ""; function argument() {trace = "argument"; throw "stop";} let caught;
    const receiver = {toString() {trace = "wrong"; return "ABC";}};
    try {String.prototype.toLowerCase.call(receiver, argument());} catch(e) {caught = e;}
    module.exports = trace === "argument" && caught === "stop";`,
  `let trace = ""; function argument() {trace = "argument"; return 0;} let caught;
    try {String.prototype.toLowerCase.call(null, argument());} catch(e) {caught = e instanceof TypeError;}
    module.exports = trace === "argument" && caught;`,
  `const input = " A-Z_09\tHello, WORLD!\0\x7f"; module.exports = input.toLowerCase() === " a-z_09\thello, world!\0\x7f" && input === " A-Z_09\tHello, WORLD!\0\x7f" && "".toLowerCase() === "";`,
  `const lower = String.prototype.toLowerCase; module.exports = lower.call(true) === "true" && lower.call(false) === "false"
    && lower.call(-0) === "0" && lower.call(NaN) === "nan" && lower.call(Infinity) === "infinity" && lower.call(-Infinity) === "-infinity"
    && lower.call({}) === "[object object]" && lower.call(String.prototype) === "";`,
  `let trace = ""; const receiver = {toString() {trace = trace + "s"; return {};}, valueOf() {trace = trace + "v"; return "ABC";}};
    const result = String.prototype.toLowerCase.call(receiver, {toString() {throw "unused";}}); module.exports = result === "abc" && trace === "sv";`,
  `let trace = ""; let caught; const receiver = {toString() {trace = "s"; throw "stop";}, valueOf() {trace = "wrong"; return "ABC";}};
    try {String.prototype.toLowerCase.call(receiver);} catch(e) {caught = e;} module.exports = trace === "s" && caught === "stop";`,
  `let a = false; let b = false; let c = false; try {String.prototype.toLowerCase.call(null);} catch(e) {a = e instanceof TypeError;}
    try {String.prototype.toLowerCase.call(undefined);} catch(e) {b = e instanceof TypeError;}
    try {String.prototype.toLowerCase.call({toString() {return {};}, valueOf() {return {};}});} catch(e) {c = e instanceof TypeError;} module.exports = a && b && c;`,
  `let trace = ""; function argument() {trace = trace + "a"; return 0;}
    const receiver = {toString() {trace = trace + "s"; return "ABC";}};
    module.exports = String.prototype.toLowerCase.call(receiver, argument()) === "abc" && trace === "as";`,
  `let trace = ""; const receiver = {toString: 7, valueOf() {trace = "v"; return "ABC";}};
    module.exports = String.prototype.toLowerCase.call(receiver) === "abc" && trace === "v";`,
  `const old = "ABC"; const lower = old.toLowerCase; let caught = false; try {new lower();} catch(e) {caught = e instanceof TypeError;}
    const own = Object.prototype.hasOwnProperty;
    const metadata = lower.name === "toLowerCase" && lower.length === 0 && lower.prototype === undefined
      && own.call(String.prototype, "toLowerCase") && own.call(lower, "length") && own.call(lower, "name") && !own.call(lower, "prototype") && !own.call(lower, "call");
    String.prototype.toLowerCase = function() {"use strict"; return "custom";};
    module.exports = caught && metadata && old.toLowerCase() === "custom" && lower.call(old) === "abc";`,
  `const lower = String.prototype.toLowerCase; const receiver = {toString() {
      String.prototype.toLowerCase = function() {"use strict"; return "custom";}; return "ABC";}};
    const result = lower.call(receiver); module.exports = result === "abc" && "XYZ".toLowerCase() === "custom" && lower.call("XYZ") === "xyz";`,
  `function C() {} C.prototype.toString = function() {return "ABC";}; const receiver = new C();
    const first = String.prototype.toLowerCase.call(receiver); C.prototype.toString = function() {return "DEF";};
    module.exports = first === "abc" && String.prototype.toLowerCase.call(receiver) === "def";`
];
programs.forEach((source, i) => {
  test(`native lowercase control ${i}`, () => withModuleFixture(source, file => {
    expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
  }));
  test(`VM lowercase control ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value: true}));
});

test("finite receiver and conversion choices retain correlations and mandatory unknowns", () => {
  const [completion, after] = run(`let count = 0; const receiver = selected ? {toString() {count = count + 1; return "YES";}} : "NO";
    const answer = String.prototype.toLowerCase.call(receiver);
    const proof = selected ? answer === "yes" && count === 1 : answer === "no" && count === 0;
    const uncertain = answer === "yes"; const boolean = String.prototype.toLowerCase.call(selected);
    const correlated = selected ? boolean === "true" : boolean === "false";`, {selected: ESBoolean()});
  expect(completion).toBe(Undefined); expect(after.value.scope.proof).toMatchObject({value: true});
  expect(after.value.scope.correlated).toMatchObject({value: true}); expect((after.value.scope.uncertain as any).value).toBeUndefined();
});
test("conversion forks between throw and return without replay", () => {
  const [completion, after] = run(`let count = 0; let answer;
    try {answer = String.prototype.toLowerCase.call({toString() {count = count + 1; if(selected) throw "stop"; return "OK";}});} catch(e) {answer = e;}
    const proof = count === 1 && (selected ? answer === "stop" : answer === "ok");`, {selected: ESBoolean()});
  expect(completion).toBe(Undefined); expect(after.value.scope.proof).toMatchObject({value: true});
});
test("conditional prototype replacements preserve captured alias and earlier snapshot", () => {
  const [initial, before] = run('const old = "ABC"; const original = old.toLowerCase;', {selected: ESBoolean()});
  expect(initial).toBe(Undefined);
  const [completion, after] = evaluateCode(`if(selected) String.prototype.toLowerCase = function() {"use strict"; return "custom";};
    const answer = old.toLowerCase(); const proof = selected ? answer === "custom" : answer === "abc"; const intrinsic = original.call(old);`, before);
  expect(completion).toBe(Undefined); expect(after.value.scope.proof).toMatchObject({value: true});
  expect(after.value.scope.intrinsic).toMatchObject({value: "abc"});
  const [untouched, snapshot] = evaluateCode('const answer = old.toLowerCase();', before);
  expect(untouched).toBe(Undefined); expect(snapshot.value.scope.answer).toMatchObject({value: "abc"});
});

const unicode = ["\x80", "AÉZ", "AΣ", "AΣB", "İ", "ß", "😀", "\ud800", "\udfff", "A".repeat(65535) + "é"];
const unicodeResults = ["\x80", "aéz", "aς", "aσb", "i\u0307", "ß", "😀", "\ud800", "\udfff", "a".repeat(65535) + "é"];
test("native non-ASCII controls include context, expansion and surrogate units", () => {
  unicode.forEach((text, i) => withModuleFixture(`module.exports = ${JSON.stringify(text)}.toLowerCase() === ${JSON.stringify(unicodeResults[i])};`, file => {
    expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}});
  }));
});
const stoppedInputs: Any[] = [...unicode.map(text => ESString(text)), ESString(), ESString([ESString("ABC")]), ESNumber()];
stoppedInputs.forEach((input, i) => {
  for (const reverse of [false, true]) test(`late unsupported input ${i} preserves conversion effects and sibling (${reverse})`, () => {
    const [completion] = run(`let trace = ""; let caught = false;
      const receiver = {toString() {trace = "converted"; return ${reverse ? "!selected" : "selected"} ? input : "OK";}};
      try {const answer = String.prototype.toLowerCase.call(receiver); trace = trace + answer;} catch(e) {caught = true;} finally {trace = trace + "!";}`,
      {input, selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true); if (!isForkedCompletion(completion)) throw new Error("expected fork");
    const leaves = [completion.consequent, completion.alternate];
    const stopped = leaves.find(leaf => (leaf[0] as any).type === "ExecutionBoundary")!;
    const normal = leaves.find(leaf => leaf[0] === Undefined)!;
    expect(stopped[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(stopped[1].value.scope.trace).toMatchObject({value: "converted"}); expect(stopped[1].value.scope.caught).toMatchObject({value: false});
    expect(normal[1].value.scope.trace).toMatchObject({value: "convertedok!"});
  });
});
// Inject resource operands: the external test cap bounds synchronous host work.
for (const length of [65535, 65536]) test(`inclusive input budget ${length}`, () => {
  const [completion, after] = run('const answer = input.toLowerCase();', {input: ESString("AZ".repeat(length).slice(0, length))});
  expect(completion).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value: "az".repeat(length).slice(0, length)});
});
for (const text of ["A".repeat(65537), "A".repeat(1000000), "é".repeat(65537)]) test(`over-budget input ${text.length} retains coercion state`, () => {
  const [completion] = run(`let trace = ""; let caught = false;
    try {const answer = String.prototype.toLowerCase.call({toString() {trace = "converted"; return selected ? input : "OK";}}); trace = answer;}
    catch(e) {caught = true;} finally {trace = trace + "!";}`, {selected: ESBoolean(), input: ESString(text)});
  expect(isForkedCompletion(completion)).toBe(true); if (!isForkedCompletion(completion)) throw new Error("expected fork");
  expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "budget"});
  expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "converted"}); expect(completion.consequent[1].value.scope.caught).toMatchObject({value: false});
  expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "ok!"});
});
for (const expression of ['[]', 'function() {}', 'input']) test(`exotic receiver boundary ${expression}`, () => {
  const proto = ESObject({}); proto.wellKnownSymbols = new Map([[toPrimitiveSymbol, ESNumber(1)]]);
  const [completion] = run(`let trace = ""; const receiver = ${expression};
    receiver.toString = function() {trace = "wrong conversion"; return "ABC";};
    if(selected) {trace = "prefix"; String.prototype.toLowerCase.call(receiver);} else trace = "sibling";`,
    {selected: ESBoolean(), input: {...ESObject({}), prototype: proto}});
  expect(isForkedCompletion(completion)).toBe(true); if (!isForkedCompletion(completion)) throw new Error("expected fork");
  expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
  expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "prefix"}); expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
});
for (const operation of ['const value = String.prototype.toLowerCase.bind;', 'const value = String.prototype.toLowerCase.caller;', 'const value = String.prototype.toLowerCase.arguments;', 'String.prototype.toLowerCase.name = "other";',
  'String.prototype.toLowerCase.length = 1;', 'const value = Object.keys(String.prototype.toLowerCase);', 'const value = ({...String.prototype.toLowerCase});',
  'const value = "x".toLocaleLowerCase;', 'const value = Object.prototype.hasOwnProperty.call(String.prototype, "indexOf");']) {
  test(`metadata and deferred surface stays typed: ${operation}`, () => {
    const [completion] = run(`let trace = ""; if(selected) {trace = "prefix"; ${operation} trace = "wrong";} else trace = "sibling";`, {selected: ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true); if (!isForkedCompletion(completion)) throw new Error("expected fork");
    expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(completion.consequent[1].value.scope.trace).toMatchObject({value: "prefix"}); expect(completion.alternate[1].value.scope.trace).toMatchObject({value: "sibling"});
  });
}

test("reached unsupported casing retains ordered external conversion effects", () => {
  const console = createConsoleModel();
  const [completion] = run(`console.log("before"); let caught = false;
    try {const result = String.prototype.toLowerCase.call({toString() {console.log("convert"); return selected ? "É" : "OK";}});
      console.log(result);} catch(e) {caught = true;} finally {console.log("finally");}`, {selected: ESBoolean(), console: console.module});
  expect(isForkedCompletion(completion)).toBe(true); if (!isForkedCompletion(completion)) throw new Error("expected fork");
  expect(completion.consequent[0]).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
  expect(completion.consequent[1].value.scope.caught).toMatchObject({value: false});
  expect(console.inspectOutput(completion.consequent[1])[0].chunks.map(chunk => chunk.value)).toEqual(["before\n", "convert\n"]);
  expect(console.inspectOutput(completion.alternate[1])[0].chunks.map(chunk => chunk.value)).toEqual(["before\n", "convert\n", "ok\n", "finally\n"]);
});

test("native customized exotic receiver controls remain outside the VM domain", () => {
  const source = `const lower = String.prototype.toLowerCase;
    const array = []; array.toString = function() {return "ABC";};
    const fn = function() {}; fn.toString = function() {return "DEF";};
    const proto = {[Symbol.toPrimitive]() {return "GHI";}};
    const object = Object.create(proto); object.toString = function() {throw "wrong";};
    module.exports = lower.call(array) === "abc" && lower.call(fn) === "def" && lower.call(object) === "ghi";`;
  withModuleFixture(source, file => expect(nodeModuleObservation(file)).toEqual({kind: "return", value: {type: "boolean", value: true}}));
});
for (const hook of [Undefined, null, ESNumber(1)]) test(`own primitive hook control ${hook === null ? "null" : hook.type}`, () => {
  const input = ESObject({});
  // Null and undefined hooks delegate to ordinary conversion; nonnull hooks stop.
  input.wellKnownSymbols = new Map([[toPrimitiveSymbol, hook === null ? ESNull : hook]]);
  const [completion, after] = run('let trace = "prefix"; const answer = String.prototype.toLowerCase.call(input);', {input});
  if (hook === Undefined || hook === null) {
    expect(completion).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value: "[object object]"});
  } else {
    expect(completion).toMatchObject({type: "ExecutionBoundary", kind: "unsupported"});
    expect(after.value.scope.trace).toMatchObject({value: "prefix"});
  }
});

test("P010 replaces obsolete lastIndexOf deferred checkpoint with native and VM behavior",()=>{
  expect(compareModule(`module.exports=typeof "x".lastIndexOf === "function" && "x.x".lastIndexOf(".")===1;`).loaded).toMatchObject({value:true});
});
