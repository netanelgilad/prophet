import { createBufferValue, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { readMember } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { Any, TESBoolean, isThrownValue, isUndefined } from "../src/types";
import { assertPinnedNode, compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function compare(source: string) {
  const result = compareModule(source);
  expect(result.loaded).toMatchObject({ type: "boolean", value: true });
  return result;
}
function run(source: string, inputs: { [name: string]: Any } = {}) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { scope: context.value.scope, context };
}
function proof(source: string) {
  const selected = ESBoolean();
  const result = run(source, { selected });
  expect(resolveBoolean(result.scope.proof as TESBoolean, result.context.value.knowledge)).toBe(true);
  expect(resolveBoolean(result.scope.uncertain as TESBoolean, result.context.value.knowledge)).toBeUndefined();
  return result;
}

// Each concrete module runs unchanged in pinned Node as an independent oracle.
// The symbolic cases explicitly admit both values of the selected Boolean.
test("ordinary constructors compare prototype identity rather than a function name", () => {
  compare(`function First() {} function Second() {}
    const first = new First();
    module.exports = first instanceof First && !(first instanceof Second) &&
      !(First.prototype instanceof First) && !(Second.prototype instanceof First);`);
});

test("instanceof walks a complete ordinary prototype chain", () => {
  compare(`function Parent() {} function Child() {} function Unrelated() {}
    Child.prototype = new Parent();
    const child = new Child();
    module.exports = child instanceof Child && child instanceof Parent &&
      child instanceof Object && !(child instanceof Unrelated);`);
});

test("constructor's current prototype and an earlier instance's original prototype stay distinct", () => {
  compare(`function Item() {}
    const original = new Item(); const oldPrototype = Item.prototype;
    Item.prototype = {};
    const replacement = new Item();
    const replaced = !(original instanceof Item) && replacement instanceof Item;
    Item.prototype = oldPrototype;
    module.exports = replaced && original instanceof Item && !(replacement instanceof Item);`);
});

test("an ordinary property named constructor does not decide instanceof", () => {
  compare(`function First() {} function Second() {}
    const first = new First(); first.constructor = Second;
    const impostor = { constructor: First };
    module.exports = first instanceof First && !(first instanceof Second) && !(impostor instanceof First);`);
});

test("Object and Function use their existing intrinsic prototype links", () => {
  compare(`function Item() {}
    module.exports = ({}) instanceof Object && Item instanceof Function && Item instanceof Object &&
      Object instanceof Function && Function instanceof Function &&
      Function.prototype instanceof Object && !(Function.prototype instanceof Function) &&
      !(Object.prototype instanceof Object);`);
});

for (const name of ["Error", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError"]) {
  test(`${name} instances follow the shared Error prototype family`, () => {
    compare(`const error = new ${name}("message");
      module.exports = error instanceof ${name} && error instanceof Error && error instanceof Object &&
        !(error instanceof Function) && ${name} instanceof Function &&
        ${name === "Error" ? "!(error instanceof TypeError)" : `${name}.prototype instanceof Error`};`);
  });
}

for (const value of ["undefined", "null", "false", "0", '"text"']) {
  test(`a primitive left operand is false with an ordinary constructor: ${value}`, () => {
    compare(`function Item() {} module.exports = !(${value} instanceof Item) && !(${value} instanceof Object);`);
  });
}

for (const right of ["undefined", "null", "false", "1", '"text"', "{}"] ) {
  test(`an invalid right operand throws an interpreted TypeError: ${right}`, () => {
    compare(`let caught = false;
      try { ({}) instanceof (${right}); } catch (error) { caught = error.name === "TypeError"; }
      module.exports = caught;`);
  });
}

for (const prototype of ["undefined", "null", "false", "1", '"text"']) {
  test(`constructor prototype ${prototype} is checked only for object left operands`, () => {
    compare(`function Item() {} Item.prototype = ${prototype};
      const primitive = !(1 instanceof Item);
      let caught = false;
      try { ({}) instanceof Item; } catch (error) { caught = error.name === "TypeError"; }
      module.exports = primitive && caught;`);
  });
}

test("an arrow's missing prototype returns false for primitives and throws for objects", () => {
  compare(`const Arrow = () => 1;
    let caught = false;
    try { ({}) instanceof Arrow; } catch (error) { caught = error.name === "TypeError"; }
    module.exports = !(1 instanceof Arrow) && caught;`);
});

test("an arrow with an explicitly assigned object prototype can be an instanceof target", () => {
  compare(`function Item() {} const Arrow = () => 1;
    Arrow.prototype = Item.prototype;
    module.exports = new Item() instanceof Arrow && !(({}) instanceof Arrow);`);
});

test("left and right operands run once in order before the instance check", () => {
  compare(`let trace = ""; function Item() {}
    const item = new Item();
    function left() { trace = trace + "L"; return item; }
    function right() { trace = trace + "R"; return Item; }
    const result = left() instanceof right();
    module.exports = result && trace === "LR";`);
});

test("a throwing left operand skips the right operand and preserves its earlier effects", () => {
  compare(`let trace = "", caught = false;
    function left() { trace = trace + "L"; throw "left"; }
    function right() { trace = trace + "R"; return Object; }
    try { left() instanceof right(); } catch (error) { caught = error === "left"; }
    module.exports = caught && trace === "L";`);
});

test("a throwing right operand preserves both operand effects", () => {
  compare(`let trace = "", caught = false;
    function left() { trace = trace + "L"; return {}; }
    function right() { trace = trace + "R"; throw "right"; }
    try { left() instanceof right(); } catch (error) { caught = error === "right"; }
    module.exports = caught && trace === "LR";`);
});

test("right operand evaluation can change the prototype used by the check", () => {
  compare(`function Item() {} const item = new Item();
    function right() { Item.prototype = {}; return Item; }
    module.exports = !(item instanceof right());`);
});

test("symbolic object choices preserve both a valid proof and an unknown instance answer", () => {
  proof(`function First() {} function Second() {}
    const value = selected ? new First() : new Second();
    const result = value instanceof First;
    const proof = selected ? result : !result;
    const uncertain = result;`);
});

test("symbolic constructors remain correlated with the object used to create them", () => {
  proof(`function First() {} function Second() {}
    const Constructor = selected ? First : Second;
    const value = new Constructor();
    const proof = value instanceof Constructor && (selected ? value instanceof First : !(value instanceof First));
    const uncertain = value instanceof First;`);
});

test("symbolic prototype reassignment keeps prior object identity and current knowledge", () => {
  proof(`function Item() {}
    const value = new Item(); const original = Item.prototype;
    Item.prototype = selected ? original : {};
    const result = value instanceof Item;
    const proof = selected ? result : !result;
    const uncertain = result;`);
});

test("symbolic prototype links installed during construction remain correlated", () => {
  proof(`function First() {} function Second() {} function Item() {}
    Item.prototype = selected ? new First() : new Second();
    const value = new Item();
    const proof = value instanceof Item && (selected ? value instanceof First && !(value instanceof Second) :
      value instanceof Second && !(value instanceof First));
    const uncertain = value instanceof First;`);
});

test("a symbolic invalid constructor retains normal and caught TypeError paths", () => {
  proof(`function Item() {} const value = new Item();
    let result = false, caught = false;
    try { result = value instanceof (selected ? Item : {}); }
    catch (error) { caught = error.name === "TypeError"; }
    const proof = selected ? result && !caught : !result && caught;
    const uncertain = caught;`);
});

test("a symbolic non-object prototype retains normal and caught TypeError paths", () => {
  proof(`function Item() {} const value = new Item(); const original = Item.prototype;
    Item.prototype = selected ? original : null;
    let result = false, caught = false;
    try { result = value instanceof Item; }
    catch (error) { caught = error.name === "TypeError"; }
    const proof = selected ? result && !caught : !result && caught;
    const uncertain = caught;`);
});

test("a symbolic throwing operand does not run later operand effects on its failing path", () => {
  proof(`function Item() {} const value = new Item(); let trace = "", caught = false, result = false;
    function left() { trace = trace + "L"; if (selected) throw "stop"; return value; }
    function right() { trace = trace + "R"; return Item; }
    try { result = left() instanceof right(); } catch (error) { caught = error === "stop"; }
    const proof = selected ? caught && !result && trace === "L" : !caught && result && trace === "LR";
    const uncertain = caught;`);
});

test("an uncaught instanceof failure exposes separate completions and path-specific state", () => {
  const selected = ESBoolean();
  const [completion, context] = evaluateCode(`function Item() {} const value = new Item();
    let progress = 1;
    const result = value instanceof (selected ? Item : {});
    progress = 2;`, setVariablesInScope(nodeInitialExecutionContext, { selected }));
  expect(isForkedCompletion(completion)).toBe(true);
  let normal = 0, thrown = 0;
  const inspect = (value: Any, branch: TExecutionContext): void => {
    if (isForkedCompletion(value)) {
      inspect(value.consequent[0], value.consequent[1]);
      inspect(value.alternate[0], value.alternate[1]);
    } else if (isThrownValue(value)) {
      thrown += 1;
      expect(readMember(value.value, "name", branch)[0]).toMatchObject({ type: "string", value: "TypeError" });
      expect(resolveBoolean(selected, branch.value.knowledge)).toBe(false);
      expect(branch.value.scope.progress).toMatchObject({ value: 1 });
      expect(branch.value.scope).not.toHaveProperty("result");
    } else {
      normal += 1;
      expect(isUndefined(value)).toBe(true);
      expect(resolveBoolean(selected, branch.value.knowledge)).toBe(true);
      expect(branch.value.scope.progress).toMatchObject({ value: 2 });
      expect(branch.value.scope.result).toMatchObject({ value: true });
    }
  };
  inspect(completion, context);
  expect({ normal, thrown }).toEqual({ normal: 1, thrown: 1 });
});


for (const left of ["1", "{}"] ) {
  test(`a partial host right operand does not silently discard Symbol.hasInstance (${left})`, () => {
    const partial = Object.assign(ESObject(), { unknownProperties: "Partial host right operand" });
    expect(() => run(`const result = (${left}) instanceof partial;`, { partial }))
      .toThrow(/Symbol.*hasInstance|prototype|partial|unmodeled|unknown/i);
  });
}

test("a partial host left operand does not invent its unknown prototype chain", () => {
  const partial = Object.assign(ESObject(), { unknownProperties: "Partial host left operand" });
  expect(() => run('const result = partial instanceof Error;', { partial }))
    .toThrow(/prototype|partial|unmodeled|unknown/i);
});

test("an ordinary object cannot skip an unknown host ancestor while walking prototypes", () => {
  const partial = Object.assign(ESObject(), { unknownProperties: "Partial host ancestor" });
  expect(() => run('function Item() {} Item.prototype = partial; const result = new Item() instanceof Error;', { partial }))
    .toThrow(/prototype|partial|unmodeled|unknown/i);
});

test("arrays use their declared shared intrinsic prototype chain", () => {
  const source = 'module.exports = [] instanceof Object;';
  expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
    .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  compare('module.exports = [] instanceof Object && [] instanceof Array && !(Array.prototype instanceof Array);');
});

for (const constructor of ["Object", "Function", "Number", "Boolean"]) {
  test(`unmodeled writes to ${constructor}.prototype cannot change intrinsic instanceof results`, () => {
    const source = `const original = ${constructor}.prototype; ${constructor}.prototype = {};
      module.exports = ${constructor}.prototype === original;`;
    expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
      .toEqual({ kind: "return", value: { type: "boolean", value: true } });
    expect(() => run(`${constructor}.prototype = {};`)).toThrow(/prototype|unmodeled/i);
  });
}

test("unmodeled inherited __proto__ setters cannot become ordinary own properties", () => {
  const source = 'const value = {}; value.__proto__ = { marker: 1 }; module.exports = value.marker === 1;';
  expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
    .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  expect(() => run('const value = {}; value.__proto__ = { marker: 1 };')).toThrow(/prototype|__proto__|unmodeled/i);
});

test("an own data property named __proto__ can still change without altering inheritance", () => {
  compare(`const value = { ["__proto__"]: 1 }; value.__proto__ = 2;
    module.exports = value.__proto__ === 2 && value.hasOwnProperty("__proto__") && value instanceof Object;`);
});

test("the unavailable Symbol API is still a known function rather than a missing global", () => {
  compare('module.exports = typeof Symbol === "function";');
});

test("custom Symbol.hasInstance source stops explicitly before pretending to evaluate the hook", () => {
  const source = `const target = { [Symbol.hasInstance]: function(value) { return value === 1; } };
    module.exports = 1 instanceof target;`;
  expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
    .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  expect(() => run(`let caught = false;
    try { const target = { [Symbol.hasInstance]: function() { return true; } }; 1 instanceof target; }
    catch (error) { caught = true; }`)).toThrow(/Symbol|unmodeled|unsupported/i);
});

test("unmodeled Symbol creation remains an analysis boundary outside interpreted catch", () => {
  expect(() => run('try { Symbol("input"); } catch (error) {}')).toThrow(/Symbol|unmodeled|unsupported/i);
});


test("an explicitly unmodeled internal prototype cannot produce an instance proof", () => {
  const partial = Object.assign(ESObject(), { unmodeledPrototype: "Unknown external inheritance" });
  expect(() => run('const result = partial instanceof Object;', { partial }))
    .toThrow(/prototype|unmodeled|unknown/i);
});

test("Buffer values use their modeled intrinsic chain without pretending to be Errors", () => {
  const body = 'const result = bytes instanceof Object && !(bytes instanceof Error) && !(bytes instanceof Function);';
  expect(withModuleFixture('const bytes = Buffer.from([65]); ' + body + ' module.exports = result;',
    filename => nodeModuleObservation(filename)))
    .toEqual({ kind: "return", value: { type: "boolean", value: true } });
  expect(run(body, { bytes: createBufferValue([65]) }).scope.result).toMatchObject({ type: "boolean", value: true });
});

for (const setup of [
  'function Item() {} const value = new Item();',
  'function Parent() {} function Child() {} Child.prototype = new Parent(); const value = new Child();'
]) {
  test(`an inherited __proto__ getter stays an explicit boundary through ordinary ancestors: ${setup}`, () => {
    const source = setup + ' module.exports = value.__proto__ instanceof Object;';
    expect(withModuleFixture(source, filename => nodeModuleObservation(filename)))
      .toEqual({ kind: "return", value: { type: "boolean", value: true } });
    expect(() => run(setup + ' const result = value.__proto__ instanceof Object;'))
      .toThrow(/__proto__|prototype|unmodeled/i);
  });
}


test("NativeError constructors inherit Error itself without making Error its own ancestor", () => {
  compare(`function Ancestor() {} Ancestor.prototype = Error;
    module.exports = EvalError instanceof Ancestor && RangeError instanceof Ancestor &&
      ReferenceError instanceof Ancestor && SyntaxError instanceof Ancestor &&
      TypeError instanceof Ancestor && URIError instanceof Ancestor &&
      !(Error instanceof Ancestor) && !(Error instanceof Error) && Error instanceof Function;`);
});
