import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { Array as ESArray } from '../src/array/Array';
import { symbolicNumberArray } from '../src/array/symbolic';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { resolveBoolean } from '../src/symbolic';
import { isExecutionBoundary } from '../src/execution-context/Completion';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { getArrayPrototype } from '../src/array/Array';
import { toPrimitiveSymbol } from '../src/Object/wellKnownSymbols';
import { Any, ESNumber, Undefined } from '../src/types';
import { assertPinnedNode } from './commonjs/oracle';

beforeAll(assertPinnedNode);
function run(source: string, input: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}
function compare(source: string) {
  const native = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', source + '; process.stdout.write(JSON.stringify(proof));'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  expect(JSON.parse(native)).toBe(true);
  const result = run(source);
  expect(result[1].value.scope.proof).toMatchObject({ value: true });
  return result;
}
// Bounded ordinary-array call/new spread. Native controls are pinned Node
// 24.21.0; the VM asserts the same answers for the supported domain and typed
// boundaries elsewhere. The implicit arguments object and rest parameters are
// unmodeled in the VM, so arity is proven through named parameters.

test('ordinary arrays spread in place, in order, including holes as undefined', () => {
  compare(`function f(a, b, c, d) { return [a, b, c, d]; }
    const direct = f(...[1, 2, 3]);
    const mixed = f(0, ...[1, 2], 3);
    const two = f(...[1], ...[2, 3]);
    const holey = f(...[1, , 3]);
    const empty = f(...[]);
    const proof = direct[0] === 1 && direct[1] === 2 && direct[2] === 3 && direct[3] === undefined &&
      mixed[0] === 0 && mixed[1] === 1 && mixed[2] === 2 && mixed[3] === 3 &&
      two[0] === 1 && two[1] === 2 && two[2] === 3 &&
      holey[0] === 1 && holey[1] === undefined && holey[2] === 3 && holey.length === 4 &&
      empty[0] === undefined;`);
});

test('spread argument evaluation interleaves with sibling arguments left to right', () => {
  compare(`let trace = "";
    function mark(x) { trace = trace + x; return x; }
    function f(a, b, c, d) { return a + b + c + d; }
    const out = f(mark("0"), ...[mark("1"), mark("2")], mark("3"));
    const proof = out === "0123" && trace === "0123";`);
});

test('constructors receive spread arguments', () => {
  compare(`function F(a, b) { this.sum = a + b; }
    const made = new F(...[7, 8]);
    const proof = made.sum === 15 && made instanceof F;`);
});

test('builtins receive spread arguments: sirv shapes', () => {
  compare(`const extns = [""];
    extns.push(...["html", "htm"]);
    const proof = extns.length === 3 && extns[0] === "" && extns[1] === "html" && extns[2] === "htm";`);
});

test('conditional array operands spread on each path with a joined conditional result', () => {
  const selected = ESBoolean();
  const [, context] = run(`const first = [1], second = [2, 3];
    function f(a, b) { return [a, b]; }
    const out = f(...(selected ? first : second));
    const proof = selected ? out[0] === 1 && out[1] === undefined : out[0] === 2 && out[1] === 3;`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('branching callee returns spread on each path with a joined conditional result', () => {
  const selected = ESBoolean();
  const [, context] = run(`function pick() { if (selected) return [1]; return [2, 3]; }
    function f(a, b) { return [a, b]; }
    const out = f(...pick());
    const proof = selected ? out[0] === 1 && out[1] === undefined : out[0] === 2 && out[1] === 3;`, { selected });
  expect(resolveBoolean(context.value.scope.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('symbolic element values spread by identity', () => {
  const result = run(`function f(a, b) { return [a, b]; }
    const out = f(...[flag, 2]);`, { flag: ESBoolean() });
  expect(result[0]).toBe(Undefined);
  const out: any = result[1].value.scope.out;
  const elements = out.shape && out.shape.kind === "elements" ? out.value : undefined;
  expect(elements).toBeDefined();
  expect(elements[0]).toBeDefined();
  expect(elements[1]).toMatchObject({ value: 2 });
});

test('non-array iterables and non-iterables stop rather than fabricating iteration or TypeErrors', () => {
  // Native controls (pinned Node 24.21.0): strings spread into code points,
  // numbers and plain objects throw "Spread syntax requires ...iterable
  // [Symbol.iterator] to be a function". The VM models none of these yet.
  const nativeString = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', 'const f=(a,b)=>a+b; process.stdout.write(JSON.stringify(f(..."ab")));'],
    { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  expect(JSON.parse(nativeString)).toBe("ab");
  for (const operand of ['5', '{}']) {
    const nativeError = execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', `try { (function(a){})(...${operand}); } catch (e) { process.stdout.write(JSON.stringify(e.constructor.name + ":" + e.message)); }`],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
    expect(JSON.parse(nativeError)).toBe('TypeError:Spread syntax requires ...iterable[Symbol.iterator] to be a function');
  }
  for (const source of ['function f(a){} f(..."ab");', 'function f(a){} f(...5);', 'function f(a){} f(...{});']) {
    const result = run(source);
    expect(result[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "Array analysis is not yet supported: spread requires an ordinary array argument, not other iterables" });
  }
});

test('custom own iteration hooks stop rather than being bypassed', () => {
  // Native control: an own Symbol.iterator redirects spread (f(...[1,2]) with
  // a custom iterator yields 9). The VM stops instead of skipping the hook.
  const hooked = ESArray([ESNumber(1), ESNumber(2)]);
  Object.assign(hooked, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(true)]]) });
  const result = run('function f(a){} f(...array);', { array: hooked });
  expect(result[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
    message: "Array analysis is not yet supported: exotic/accessor/custom-iterator array spread operands" });
});

test('replaced Array.prototype iteration stops rather than being bypassed', () => {
  const arrayPrototype = getArrayPrototype();
  const savedSlots = arrayPrototype.wellKnownSymbols;
  try {
    Object.assign(arrayPrototype, { wellKnownSymbols: new Map([[toPrimitiveSymbol, ESBoolean(false)]]) });
    const result = run('function f(a){} f(...[1, 2]);');
    expect(result[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
      message: "Array analysis is not yet supported: unresolved inherited symbol state in spread operands" });
  } finally {
    if (savedSlots === undefined) delete arrayPrototype.wellKnownSymbols;
    else arrayPrototype.wellKnownSymbols = savedSlots;
  }
  compare(`function f(a, b) { return [a, b]; }
    const proof = f(...[1, 2]).join(",") === "1,2";`);
});

test('accessor, exotic, unknown-layout and symbolic arrays stop rather than guessing elements', () => {
  const accessor = Object.assign(ESArray([ESNumber(1)]), { propertyAccess: {
    read() { return undefined; }, write() { throw new Error('must not invoke hidden setter'); }
  } });
  for (const array of [accessor, ESArray(), ESArray([ESArray([ESNumber(1)]), ESArray()], 'segments'),
    symbolicNumberArray({ element: ESNumber() })]) {
    expect(isExecutionBoundary(run('function f(a){} f(...array);', { array })[0])).toBe(true);
  }
});

test('explicit embedding boundaries on the array stop spread', () => {
  for (const metadata of [{ unmodeledPropertyReads: ['length'] }, { unmodeledPropertyWrites: ['1'] },
    { unmodeledOwnPropertyInspection: 'custom descriptors' },
    { unmodeledPrototype: 'custom prototype' }, { unknownProperties: 'custom layout' }]) {
    const array = Object.assign(ESArray([ESNumber(1)]), metadata);
    expect(isExecutionBoundary(run('function f(a){} f(...array);', { array })[0])).toBe(true);
  }
});

test('inherited indexed elements stop hole reads instead of materializing prototype values', () => {
  // Native control: Array.prototype[1] = "X" makes f(...[0,,2]) yield (0,"X",2).
  // The VM stops rather than materializing the inherited value.
  const arrayPrototype = getArrayPrototype() as any;
  const saved = arrayPrototype.properties[1];
  const had = 1 in arrayPrototype.properties;
  try {
    arrayPrototype.properties[1] = ESNumber(9);
    const result = run('function f(a, b, c) { return [a, b, c]; } f(...[0, , 2]);');
    expect(isExecutionBoundary(result[0])).toBe(true);
  } finally {
    if (had) arrayPrototype.properties[1] = saved;
    else delete arrayPrototype.properties[1];
  }
});

test('spread above the element budget stops instead of unbounded host work', () => {
  const big = ESArray(Array.from({ length: 1025 }, () => ESNumber(0)));
  const result = run('function f(a){} f(...array);', { array: big });
  expect(result[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported",
    message: "Array analysis is not yet supported: spread exceeds the supported element limit" });
  const atBudget = ESArray(Array.from({ length: 1024 }, () => ESNumber(0)));
  const ok = run('function f(a) { return a; } const proof = f(...array) === 0;', { array: atBudget });
  expect(ok[0]).toBe(Undefined);
  expect(ok[1].value.scope.proof).toMatchObject({ value: true });
});

test('spread argument boundary and throw outcomes are preserved', () => {
  // A boundary inside the spread operand stops the call after earlier effects.
  const result = run('let mark = 0; function side(){ mark = 1; return "x".charAt; } function f(a){} f(...side());');
  expect(result[0]).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  expect(result[1].value.scope.mark).toMatchObject({ value: 1 });
  // A guest throw inside the spread operand propagates unchanged.
  const thrown = run('function boom(){ throw "E"; } function f(a){} f(...boom());');
  expect(thrown[0]).toMatchObject({ type: "ThrownValue" });
});
