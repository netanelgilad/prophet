import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { mapCompletions } from "../src/evaluate";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { vm } from "../src/node-builtin-modules/vm";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { Any, ESNumber, isThrownValue } from "../src/types";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

function compare(source: string) {
  const result = compareModule(`${source}\nmodule.exports = result;`);
  expect(result.loaded).toMatchObject({ type: "boolean", value: true });
}

test("configuration defaults and symbolic overrides retain a positive-port proof without choosing a branch", () => {
  const override = ESBoolean();
  const [completion, context] = evaluateCode(`
    function configure(overrides = {}) { return { port: 8080, ...overrides }; }
    const options = configure(override ? { port: 3000 } : {});
    const positive = options.port > 0;
    const correct = override ? options.port === 3000 : options.port === 8080;
    const uncertain = options.port === 8080;
    const omitted = configure().port === 8080;
  `, setVariablesInScope(nodeInitialExecutionContext, { override }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  for (const name of ["positive", "correct", "omitted"]) {
    expect(resolveBoolean(context.value.scope[name] as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  }
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("object spread ignores null, undefined, numbers, and booleans", () => {
  compare(`
    const copy = { keep: 7, ...null, ...undefined, ...0, ...17, ...NaN, ...true, ...false };
    const result = copy.keep === 7 && !Object.prototype.hasOwnProperty.call(copy, "toString") &&
      !Object.prototype.hasOwnProperty.call(copy, "valueOf");
  `);
});

test("concrete strings contribute indexed UTF-16 characters rather than VM helper properties", () => {
  compare(String.raw`
    const copy = { ..."A\ud83d\ude00" };
    const result = copy[0] === "A" && copy[1] === "\ud83d" && copy[2] === "\ude00" &&
      copy[3] === undefined && !Object.prototype.hasOwnProperty.call(copy, "length") &&
      !Object.prototype.hasOwnProperty.call(copy, "split") && !Object.prototype.hasOwnProperty.call(copy, "substr");
  `);
});

test("spread copies own data properties and leaves inherited values behind", () => {
  compare(`
    function Parent() { this.own = 7; }
    Parent.prototype.inherited = 9;
    const source = new Parent();
    const copy = { ...source };
    const result = source.inherited === 9 && copy.own === 7 && copy.inherited === undefined &&
      !Object.prototype.hasOwnProperty.call(copy, "inherited");
  `);
});

test("a copied undefined value is an own property rather than a missing property", () => {
  compare(`
    const copy = { ...{ absentValue: undefined, nil: null, disabled: false } };
    const result = Object.prototype.hasOwnProperty.call(copy, "absentValue") && copy.absentValue === undefined &&
      copy.nil === null && copy.disabled === false;
  `);
});

test("ordinary property names are copied without a universal list of builtin-looking exclusions", () => {
  compare(`
    const source = { length: 1, prototype: 2, constructor: 3, name: 4, slice: 5 };
    const copy = { ...source };
    const result = copy.length === 1 && copy.prototype === 2 && copy.constructor === 3 &&
      copy.name === 4 && copy.slice === 5 && Object.keys(copy).join(",") === "length,prototype,constructor,name,slice";
  `);
});

test("Object.keys and spread preserve string insertion order while sorting array-index keys", () => {
  compare(`
    const source = { zebra: 1, "2": 2, alpha: 3, "0": 4, "01": 5 };
    const copy = { first: 0, ...source, zebra: 9, last: 10 };
    const result = Object.keys(source).join(",") === "0,2,zebra,alpha,01" &&
      Object.keys(copy).join(",") === "0,2,first,zebra,alpha,01,last" && copy.zebra === 9;
  `);
});

test("Object.keys on primitives shares own-key enumeration while null and undefined throw", () => {
  compare(String.raw`
    let nullThrows = false;
    let undefinedThrows = false;
    try { Object.keys(null); } catch (error) { nullThrows = error.name === "TypeError"; }
    try { Object.keys(undefined); } catch (error) { undefinedThrows = error.name === "TypeError"; }
    const result = Object.keys(7).length === 0 && Object.keys(true).length === 0 &&
      Object.keys("A\ud83d\ude00").join(",") === "0,1,2" && nullThrows && undefinedThrows;
  `);
});

test("Object.keys inspects current own properties and does not include inherited ones", () => {
  compare(`
    function Parent() { this.first = 1; }
    Parent.prototype.inherited = 7;
    const source = new Parent();
    source.second = 2;
    const before = Object.keys(source);
    source.third = 3;
    const result = before.join(",") === "first,second" && Object.keys(source).join(",") === "first,second,third";
  `);
});

test("Object and new Object create fresh empty ordinary objects from omitted or nullish values", () => {
  compare(`
    const first = Object();
    const second = new Object(null);
    const third = Object(undefined);
    const fourth = new Object();
    const result = first !== second && second !== third && third !== fourth &&
      Object.keys(first).length === 0 && Object.keys(second).length === 0 &&
      Object.keys(third).length === 0 && Object.keys(fourth).length === 0;
  `);
});

test("Object and new Object preserve an existing object's identity and enumerable data", () => {
  compare(`
    const source = { value: 7 };
    const first = Object(source);
    const second = new Object(source);
    const result = first === source && second === source && Object.keys(first).join(",") === "value" &&
      ({ ...second }).value === 7;
  `);
});

for (const expression of ['Object("ab")', 'new Object("ab")']) {
  test(`unsupported primitive wrappers cannot masquerade as empty enumerable objects: ${expression}`, () => {
    expect(() => evaluateCode(`const source = ${expression}; const copy = { ...source };`, nodeInitialExecutionContext))
      .toThrow(/wrapper|boxing/i);
  });
}

test("Object.keys exposes its standard metadata without becoming constructible", () => {
  compare(`
    let caught = false;
    try { new Object.keys({}); } catch (error) { caught = error.name === "TypeError"; }
    const result = Object.keys.length === 1 && Object.keys.name === "keys" && caught &&
      !Object.prototype.hasOwnProperty.call(Object.keys, "prototype");
  `);
});

for (const name of ["caller", "arguments"]) {
  test(`Object.keys ${name} reads cannot silently bypass restricted accessors`, () => {
    const source = `Object.keys.${name};`;
    expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
      .toEqual({ kind: "throw", error: "TypeError" });
    expect(() => evaluateCode(source, nodeInitialExecutionContext))
      .toThrow(/Unmodeled property read/);
  });
}

for (const name of ["length", "name", "caller", "arguments"]) {
  test(`Object.keys ${name} writes cannot bypass unmodeled descriptors`, () => {
    if (name === "caller" || name === "arguments") {
      expect(withModuleFixture(`Object.keys.${name} = 17;`, filename => nodeModuleObservation(filename)))
        .toEqual({ kind: "throw", error: "TypeError" });
    }
    expect(() => evaluateCode(`Object.keys.${name} = 17;`, nodeInitialExecutionContext))
      .toThrow(/Unmodeled host property write/);
  });
}

test("later data properties overwrite earlier spread entries without mutating sources", () => {
  compare(`
    const first = { value: 1, first: true };
    const second = { value: 2, second: true };
    const copy = { value: 0, ...first, middle: true, ...second, value: 3 };
    const result = copy.value === 3 && copy.first && copy.second && copy.middle && first.value === 1 && second.value === 2;
  `);
});

test("source expressions and ordinary properties run once in source order", () => {
  compare(`
    let trace = "";
    const source = { value: 1 };
    function key() { trace = trace + "key:"; return "first"; }
    function value() { trace = trace + "value:"; return 7; }
    function spread() { trace = trace + "spread:"; source.value = 2; return source; }
    function after() { trace = trace + "after:"; source.value = 3; return 9; }
    const copy = { [key()]: value(), ...spread(), after: after() };
    const result = trace === "key:value:spread:after:" && copy.first === 7 && copy.value === 2 && copy.after === 9 && source.value === 3;
  `);
});

test("spread makes a new outer object while preserving nested object identity", () => {
  compare(`
    const nested = { value: 1 };
    const source = { nested: nested };
    const copy = { ...source };
    copy.nested.value = 2;
    copy.extra = 3;
    const result = copy !== source && copy.nested === source.nested && source.nested.value === 2 && source.extra === undefined;
  `);
});

test("spread reads the current heap and preserves the copied primitive snapshot", () => {
  compare(`
    const source = { value: 1 };
    source.value = 2;
    source.added = 7;
    const copy = { ...source };
    source.value = 3;
    const result = copy.value === 2 && copy.added === 7 && source.value === 3;
  `);
});

test("computed __proto__ is copied as safe data without changing the target's prototype", () => {
  compare(`
    const marker = { leaked: true };
    const source = { ["__proto__"]: marker };
    const copy = { ...source };
    const result = Object.prototype.hasOwnProperty.call(copy, "__proto__") && copy.__proto__ === marker && copy.leaked === undefined;
  `);
});

test("a source-expression exception stops later properties and preserves earlier effects", () => {
  compare(`
    let trace = "";
    const failure = {};
    function first() { trace = trace + "first:"; return 1; }
    function fail() { trace = trace + "throw:"; throw failure; }
    function later() { trace = trace + "later:"; return 2; }
    let caught = false;
    try { const copy = { first: first(), ...fail(), later: later() }; }
    catch (error) { caught = error === failure; }
    const result = caught && trace === "first:throw:";
  `);
});

test("conditional spread sources preserve value correlation and uncertain results", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    const copy = { value: 0, ...(selected ? { value: 7 } : null) };
    const correct = selected ? copy.value === 7 : copy.value === 0;
    const uncertain = copy.value === 7;
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("conditional source property presence remains conditional on the copied object", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    const source = {};
    if (selected) source.optional = 7;
    const copy = { ...source };
    const present = Object.prototype.hasOwnProperty.call(copy, "optional");
    const correct = present === selected && (selected ? copy.optional === 7 : copy.optional === undefined);
    const uncertain = present;
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a conditionally absent source property does not overwrite an earlier target value", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    const source = {};
    if (selected) source.value = 7;
    const copy = { value: 3, ...source };
    const correct = Object.prototype.hasOwnProperty.call(copy, "value") &&
      (selected ? copy.value === 7 : copy.value === 3);
    const uncertain = copy.value === 7;
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("key order follows conditional insertion history rather than a universal union of branch keys", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    const source = {};
    if (selected) { source.a = 1; source.b = 2; }
    else { source.b = 2; source.a = 1; }
    const copy = { ...source };
    const keys = Object.keys(copy).join(",");
    const correct = selected ? keys === "a,b" : keys === "b,a";
    const uncertain = keys === "a,b";
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a later explicit property overwrites a conditional copy but keeps its branch-specific insertion position", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`
    const source = {};
    if (selected) source.a = 1;
    source.b = 2;
    const copy = { first: 0, ...source, a: 9 };
    const keys = Object.keys(copy).join(",");
    const correct = copy.a === 9 && (selected ? keys === "first,a,b" : keys === "first,b,a");
    const uncertain = keys === "first,a,b";
  `, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(resolveBoolean(context.value.scope.correct as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(context.value.scope.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("a symbolic source-expression throw retains separate completions and effect order", () => {
  const fails = ESBoolean();
  const result = evaluateCode(`
    let calls = 0;
    let continued = false;
    function source() { calls = calls + 1; if (fails) throw "source failed"; return { value: 7 }; }
    const copy = { ...source() };
    continued = true;
  `, setVariablesInScope(nodeInitialExecutionContext, { fails }));
  expect(isForkedCompletion(result[0])).toBe(true);
  mapCompletions(result, (completion, context) => {
    const failed = resolveBoolean(fails, context.value.knowledge);
    expect(failed).not.toBeUndefined();
    expect(isThrownValue(completion)).toBe(failed);
    expect(context.value.scope.calls).toMatchObject({ value: 1 });
    expect(context.value.scope.continued).toMatchObject({ value: !failed });
    if (failed) expect(completion).toMatchObject({ type: "ThrownValue", value: { value: "source failed" } });
    return [completion, context];
  });
});

test("unknown numbers and booleans have no own enumerable properties even when their values are unknown", () => {
  const [completion, context] = evaluateCode(`
    const copy = { keep: 7, ...number, ...boolean };
    const correct = copy.keep === 7 && !Object.prototype.hasOwnProperty.call(copy, "valueOf");
  `, setVariablesInScope(nodeInitialExecutionContext, { number: ESNumber(), boolean: ESBoolean() }));
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.scope.correct).toMatchObject({ value: true });
});

test("an unknown string cannot silently become an empty spread object", () => {
  expect(() => evaluateCode("const copy = { ...source };",
    setVariablesInScope(nodeInitialExecutionContext, { source: ESString() })))
    .toThrow(/string|spread|propert/i);
});

test("accessor source creation stays an explicit gap until getter and descriptor semantics are modeled", () => {
  expect(() => evaluateCode("const source = { get value() { return 7; } }; const copy = { ...source };",
    nodeInitialExecutionContext)).toThrow(/accessor/i);
});

for (const source of ["[1, 2]", "function() {}", "new Error('failure')", "Object.prototype", "Function.prototype", "String.prototype", "Error.prototype", "this"]) {
  test(`unmodeled descriptor layouts cannot be guessed from a VM property dictionary: ${source}`, () => {
    expect(() => evaluateCode(`const copy = { ...(${source}) };`, nodeInitialExecutionContext))
      .toThrow(/enumerat|spread|propert/i);
    expect(() => evaluateCode(`Object.keys(${source});`, nodeInitialExecutionContext))
      .toThrow(/enumerat|spread|propert/i);
  });
}

test("opaque host objects do not become complete enumerable objects because some fields are exposed", () => {
  const source = Object.assign(ESObject({ known: ESNumber(7) }), { unknownProperties: "partial host object" });
  const context = setVariablesInScope(nodeInitialExecutionContext, { source });
  expect(() => evaluateCode("const copy = { ...source };", context)).toThrow(/enumerat|spread|propert/i);
  expect(() => evaluateCode("Object.keys(source);", context)).toThrow(/enumerat|spread|propert/i);
});

for (const source of ["Object.keys(this)", "({...this})", "Object.keys((function() { return this; })())"]) {
  test(`the legacy VM adapter cannot reclassify an intrinsic-filled global as enumerable data: ${source}`, () => {
    // This directly exercises Prophet's historical adapter. It is not a claim
    // that its contextification behavior matches the public Node vm API.
    const context = setVariablesInScope(nodeInitialExecutionContext, { legacyVM: vm as Any });
    expect(() => evaluateCode(`legacyVM.runInContext(${JSON.stringify(source)}, {});`, context))
      .toThrow(/enumerat|spread|propert/i);
  });
}
