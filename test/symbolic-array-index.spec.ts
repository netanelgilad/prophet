import {
  evaluateCode, hasExecutionBoundary, isExecutionBoundary, isForkedCompletion,
  isThrownValue, nodeInitialExecutionContext
} from "../src";
import { symbolicNumberArray, readSymbolicIndex, sliceSymbolicArray,
  symbolicActualArrayRegion } from "../src/array/symbolic";
import { getArrayPrototype } from "../src/array/Array";
import { getObjectPrototype } from "../src/Object/prototype";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { assumeInContext } from "../src/execution-context/branches";
import { writeProperty } from "../src/execution-context/Heap";
import { CollectionRegion, Fact, compareNumbers, exactIntegerEndpoint, strictEquality } from "../src/symbolic";
import { arithmeticNumber } from "../src/symbolic/arithmetic";
import { ESNumber, TESBoolean, TESNumber, Undefined } from "../src/types";

function finiteElement() {
  const element = ESNumber();
  element.knowledge = [
    { kind: "finite", subject: element },
    { kind: "order", left: ESNumber(-20), right: element, strict: false },
    { kind: "order", left: element, right: ESNumber(30), strict: false }
  ];
  return element;
}

function integerIndex(lower: number, upper: number) {
  const index = ESNumber();
  index.knowledge = [
    { kind: "integer", subject: index },
    { kind: "order", left: ESNumber(lower), right: index, strict: false },
    { kind: "order", left: index, right: ESNumber(upper), strict: false }
  ];
  return index;
}

function normal(source: string, bindings: { [name: string]: any }) {
  const [completion, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext, bindings));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  return context.value.scope;
}

test("a symbolic computed key on an ordinary object keeps the concrete-key lookup boundary", () => {
  const index = integerIndex(200, 405);
  expect(() => evaluateCode("const object = { 200: 'OK' }; const value = object[index];",
    setVariablesInScope(nodeInitialExecutionContext, { index })))
    .toThrow("Computed property access requires a concrete number or string");
});

test("a guarded arbitrary integer index is a present member without length enumeration", () => {
  // Dense immutable finite numbers, 1 <= length <= uint32 max, 0 <= index <
  // length. This is the representation needed by an arbitrary loop transition.
  const input = symbolicNumberArray({ minimumLength: 1, element: finiteElement() });
  const index = integerIndex(0, 0xfffffffe);
  const context = assumeInContext(nodeInitialExecutionContext,
    compareNumbers(index, input.properties.length, "<"), true);
  const [completion, result] = evaluateCode(`
    const first = input[index];
    const repeated = input[index];
    const equal = first === repeated;
    const range = first >= -20 && first <= 30;
  `, setVariablesInScope(context, { input, index }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(result.value.scope.first).toBe(result.value.scope.repeated);
  expect(result.value.scope.equal).toMatchObject({ value: true });
  expect(result.value.scope.range).toMatchObject({ value: true });
  expect(input.shape.sequence.indexedReads.size).toBe(1);
});

test("index identity and value equality are separate across positions and snapshots", () => {
  const input = symbolicNumberArray({ minimumLength: 3, element: finiteElement() });
  const other = symbolicNumberArray({ minimumLength: 3, element: finiteElement() });
  const left = integerIndex(0, 2), right = integerIndex(0, 2);
  const result = normal(`
    const a = input[left], again = input[left];
    const b = input[right], elsewhere = other[left];
    const samePosition = a === again;
    const maybeSamePosition = a === b;
    const maybeSameValue = a === elsewhere;
  `, { input, other, left, right });
  expect(result.a).toBe(result.again);
  expect(result.a).not.toBe(result.b);
  expect(result.a).not.toBe(result.elsewhere);
  expect(result.samePosition).toMatchObject({ value: true });
  expect((result.maybeSamePosition as TESBoolean).value).toBeUndefined();
  expect((result.maybeSameValue as TESBoolean).value).toBeUndefined();
});

test("equality refined after a read relates indices, not independent element values", () => {
  const input = symbolicNumberArray({ minimumLength: 3, element: finiteElement() });
  const i = integerIndex(0, 2), j = integerIndex(0, 2);
  const a = readSymbolicIndex(input, i, nodeInitialExecutionContext) as TESNumber;
  const b = readSymbolicIndex(input, j, nodeInitialExecutionContext) as TESNumber;
  const equalIndices = assumeInContext(nodeInitialExecutionContext, strictEquality(i, j), true);
  const distinctIndices = assumeInContext(nodeInitialExecutionContext, strictEquality(i, j), false);
  expect(strictEquality(a, b).value).toBeUndefined();
  expect(strictEquality(a, b, equalIndices.value.knowledge).value).toBe(true);
  expect(compareNumbers(a, b, "<=", equalIndices.value.knowledge).value).toBe(true);
  expect(strictEquality(a, b, distinctIndices.value.knowledge).value).toBeUndefined();
  // Distinct indices may hold equal numbers; no false equality fact follows.
});

test("symbolic reads preserve view offsets and existing concrete alias identities", () => {
  const input = symbolicNumberArray({ minimumLength: 4, element: finiteElement() });
  const i = integerIndex(0, 1);
  const tail = sliceSymbolicArray(input, 1, nodeInitialExecutionContext);
  const twin = sliceSymbolicArray(input, 1, nodeInitialExecutionContext);
  const first = readSymbolicIndex(tail, i, nodeInitialExecutionContext) as TESNumber;
  const repeated = readSymbolicIndex(twin, i, nodeInitialExecutionContext) as TESNumber;
  const unshifted = readSymbolicIndex(input, i, nodeInitialExecutionContext) as TESNumber;
  expect(first).toBe(repeated);
  expect(first).not.toBe(unshifted);
  expect(strictEquality(first, unshifted).value).toBeUndefined();
  expect(readSymbolicIndex(tail, 0, nodeInitialExecutionContext))
    .toBe(readSymbolicIndex(input, 1, nodeInitialExecutionContext));
});

test("cached indexed values do not inherit a prior view's path-dependent membership", () => {
  const input = symbolicNumberArray({ minimumLength: 1, maximumLength: 3,
    element: finiteElement() });
  const i = integerIndex(0, 2);
  const short = assumeInContext(assumeInContext(nodeInitialExecutionContext,
    strictEquality(input.properties.length, ESNumber(1)), true),
    strictEquality(i, ESNumber(0)), true);
  const view = sliceSymbolicArray(input, 0, short);
  const first = readSymbolicIndex(view, i, short) as TESNumber;
  const long = assumeInContext(assumeInContext(nodeInitialExecutionContext,
    strictEquality(input.properties.length, ESNumber(3)), true),
    strictEquality(i, ESNumber(2)), true);
  const later = readSymbolicIndex(input, i, long) as TESNumber;
  expect(later).toBe(first);
  const bound = ESNumber();
  const prefix: CollectionRegion = { id: input.shape.sequence.id, start: 0, end: 1 };
  expect(compareNumbers(bound, later, "<=", (long.value.knowledge || []).concat({
    kind: "every-element-order", collection: prefix, bound, direction: "lower"
  })).value).toBeUndefined();
});

test("a path-resolved two-position read does not poison another path", () => {
  const input = symbolicNumberArray({ minimumLength: 2, maximumLength: 2,
    element: finiteElement() });
  const index = integerIndex(0, 1);
  const zero = assumeInContext(nodeInitialExecutionContext,
    strictEquality(index, ESNumber(0)), true);
  const one = assumeInContext(nodeInitialExecutionContext,
    strictEquality(index, ESNumber(1)), true);
  const first = readSymbolicIndex(input, index, zero) as TESNumber;
  const second = readSymbolicIndex(input, index, one) as TESNumber;
  expect(first).toBe(readSymbolicIndex(input, 0, zero));
  expect(second).toBe(readSymbolicIndex(input, 1, one));
  expect(first).not.toBe(second);
  expect(input.shape.sequence.indexedReads.size).toBe(0);
});

test("same-index value equality still respects possible NaN and signed zero", () => {
  const i = integerIndex(0, 2), j = integerIndex(0, 2);
  const unknown = symbolicNumberArray({ minimumLength: 3, element: ESNumber() });
  const first = readSymbolicIndex(unknown, i, nodeInitialExecutionContext) as TESNumber;
  const second = readSymbolicIndex(unknown, j, nodeInitialExecutionContext) as TESNumber;
  const equal = assumeInContext(nodeInitialExecutionContext, strictEquality(i, j), true);
  expect(strictEquality(first, second, equal.value.knowledge).value).toBeUndefined();
  expect(compareNumbers(first, second, "<=", equal.value.knowledge).value).toBeUndefined();
  const nan = symbolicNumberArray({ minimumLength: 1, maximumLength: 1,
    element: ESNumber(NaN) });
  const nanIndex = integerIndex(0, 0);
  const nanValue = readSymbolicIndex(nan, nanIndex, nodeInitialExecutionContext) as TESNumber;
  expect(strictEquality(nanValue, nanValue).value).toBe(false);
  const negativeZero = symbolicNumberArray({ minimumLength: 1, maximumLength: 1,
    element: ESNumber(-0) });
  expect(Object.is((readSymbolicIndex(negativeZero, nanIndex,
    nodeInitialExecutionContext) as TESNumber).value, -0)).toBe(true);
});

test("a symbolic region endpoint instantiates only under proved index inclusion", () => {
  const input = symbolicNumberArray({ minimumLength: 4, element: finiteElement() });
  const i = integerIndex(1, 3), end = integerIndex(2, 4);
  const element = readSymbolicIndex(input, i, nodeInitialExecutionContext) as TESNumber;
  const bound = ESNumber();
  bound.knowledge = [{ kind: "finite", subject: bound }];
  const prefix: CollectionRegion = { id: input.shape.sequence.id,
    start: 0, end: { base: end, offset: 0 } };
  const universal = { kind: "every-element-order" as "every-element-order",
    collection: prefix, bound, direction: "lower" as "lower" };
  const path = assumeInContext(nodeInitialExecutionContext, compareNumbers(i, end, "<"), true);
  const beforeFacts = element.knowledge!.slice();
  expect(compareNumbers(bound, element, "<=", [universal]).value).toBeUndefined();
  expect(compareNumbers(bound, element, "<=",
    (path.value.knowledge || []).concat(universal)).value).toBe(true);
  expect(element.knowledge).toEqual(beforeFacts);
  expect(compareNumbers(bound, readSymbolicIndex(
    symbolicNumberArray({ minimumLength: 4, element: finiteElement() }), i,
    nodeInitialExecutionContext) as TESNumber, "<=", (path.value.knowledge || []).concat(universal))
    .value).toBeUndefined();
});

test("actual-length regions retain their length identity separately from maximum envelopes", () => {
  const input = symbolicNumberArray({ minimumLength: 3, maximumLength: 80,
    element: finiteElement() });
  const region = symbolicActualArrayRegion(input, nodeInitialExecutionContext)!;
  expect(region).toEqual({ id: input.shape.sequence.id, start: 0,
    end: { base: input.properties.length, offset: 0 } });
  const tail = sliceSymbolicArray(input, 1, nodeInitialExecutionContext);
  expect(symbolicActualArrayRegion(tail, nodeInitialExecutionContext)).toEqual({
    id: input.shape.sequence.id, start: 1,
    end: { base: input.properties.length, offset: 0 }
  });
});

test("present, absent and uncertain symbolic index positions have distinct outcomes", () => {
  const input = symbolicNumberArray({ minimumLength: 2, maximumLength: 4,
    element: finiteElement() });
  const present = integerIndex(0, 1);
  const chosen = normal("const value = input[present]; const range = value >= -20 && value <= 30;",
    { input, present });
  expect(chosen.range).toMatchObject({ value: true });
  for (const index of [integerIndex(4, 5), integerIndex(1, 4)]) {
    const [completion] = evaluateCode("const value = input[index];",
      setVariablesInScope(nodeInitialExecutionContext, { input, index }));
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(completion).toMatchObject({ kind: "unsupported" });
  }
});

test("concrete absent indices honor inherited properties and uncertain reads stay conditional", () => {
  const input = symbolicNumberArray({ minimumLength: 1, maximumLength: 2,
    element: finiteElement() });
  const ordinary = normal("const value = input[1];", { input });
  expect(ordinary.value).not.toBe(Undefined);
  const absent = symbolicNumberArray({ minimumLength: 2, maximumLength: 2,
    element: finiteElement() });
  const inherited = writeProperty(getArrayPrototype(), "2", ESNumber(99),
    nodeInitialExecutionContext);
  const [completion, result] = evaluateCode("const value = input[2];",
    setVariablesInScope(inherited, { input: absent }));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(result.value.scope.value).toMatchObject({ value: 99 });
  const uncertain = symbolicNumberArray({ minimumLength: 1, maximumLength: 2,
    element: finiteElement() });
  const uncertainContext = writeProperty(getArrayPrototype(), "1", ESNumber(99),
    nodeInitialExecutionContext);
  const [uncertainCompletion] = evaluateCode("const value = input[1];",
    setVariablesInScope(uncertainContext, { input: uncertain }));
  expect(isExecutionBoundary(uncertainCompletion)).toBe(true);
  const objectInherited = writeProperty(getObjectPrototype(), "1", ESNumber(77),
    nodeInitialExecutionContext);
  const [objectCompletion] = evaluateCode("const value = input[1];",
    setVariablesInScope(objectInherited, { input: uncertain }));
  expect(isExecutionBoundary(objectCompletion)).toBe(true);
});

test("invalid numeric keys retain key conversion or stop honestly", () => {
  const input = symbolicNumberArray({ minimumLength: 1, maximumLength: 1,
    element: ESNumber(-0) });
  const actual = normal(`
    const zero = input[-0];
    const nan = input[NaN];
    const infinite = input[Infinity];
  `, { input });
  expect(Object.is((actual.zero as TESNumber).value, -0)).toBe(true);
  expect(actual.nan).toBe(Undefined);
  expect(actual.infinite).toBe(Undefined);
  for (const index of [ESNumber(), integerIndex(-1, 1)]) {
    const [completion] = evaluateCode("const value = input[index];",
      setVariablesInScope(nodeInitialExecutionContext, { input, index }));
    expect(isExecutionBoundary(completion)).toBe(true);
  }
});

test("declared custom lookup and changed heap block concrete and symbolic shortcuts", () => {
  const input = symbolicNumberArray({ minimumLength: 2, element: finiteElement() });
  input.unmodeledPropertyReads = ["0"];
  const symbolic = integerIndex(0, 1);
  for (const code of ["const value = input[0];", "const value = input[symbolic];"]) {
    const [completion] = evaluateCode(code,
      setVariablesInScope(nodeInitialExecutionContext, { input, symbolic }));
    expect(isExecutionBoundary(completion)).toBe(true);
  }
  const hooked = symbolicNumberArray({ minimumLength: 2, element: finiteElement() });
  let called = 0;
  hooked.propertyAccess = { read() { called++; return undefined; },
    write() { called++; return undefined; } };
  const [hookBoundary] = evaluateCode("const value = hooked[0];",
    setVariablesInScope(nodeInitialExecutionContext, { hooked }));
  expect(isExecutionBoundary(hookBoundary)).toBe(true);
  expect(called).toBe(0);

  const changed = symbolicNumberArray({ minimumLength: 2, element: finiteElement() });
  const heap = writeProperty(changed, "extra", ESNumber(1), nodeInitialExecutionContext);
  const [changedBoundary] = evaluateCode("const value = changed[0];",
    setVariablesInScope(heap, { changed }));
  expect(isExecutionBoundary(changedBoundary)).toBe(true);
  const lengthChanged = symbolicNumberArray({ minimumLength: 2,
    element: finiteElement() });
  lengthChanged.properties.length = ESNumber(2);
  const [lengthBoundary] = evaluateCode("const value = lengthChanged[0];",
    setVariablesInScope(nodeInitialExecutionContext, { lengthChanged }));
  expect(isExecutionBoundary(lengthBoundary)).toBe(true);
});

test("integer-eligible region chains prove within budget and give up over budget", () => {
  const prove = (count: number) => {
    const id = {}, bound = ESNumber(), member = ESNumber();
    const chain = Array.from({ length: count }, () => ESNumber());
    const knowledge: Fact[] = chain.map(subject => ({ kind: "integer", subject }));
    chain.slice(0, -1).forEach((value, index) => knowledge.push({
      kind: "order", left: value, right: chain[index + 1], strict: true
    }));
    knowledge.push({ kind: "order", left: ESNumber(0), right: chain[0], strict: false });
    const before = knowledge.slice();
    const outer: CollectionRegion = { id, start: 0,
      end: { base: chain[count - 1], offset: 0 } };
    const inner: CollectionRegion = { id, index: { base: chain[0], offset: 0 } };
    const result = compareNumbers(bound, member, "<=", knowledge.concat([
      { kind: "every-element-order", collection: outer, bound, direction: "lower" },
      { kind: "member", collection: inner, element: member }
    ]));
    expect(knowledge).toEqual(before);
    return result.value;
  };
  expect(prove(12)).toBe(true);
  expect(prove(150)).toBeUndefined();
});

test("large unrelated knowledge cannot erase ordinary concrete-region facts", () => {
  const id = {}, bound = ESNumber(), member = ESNumber();
  const unrelated: Fact[] = Array.from({ length: 130 }, () =>
    ({ kind: "finite", subject: ESNumber() }));
  const knowledge = unrelated.concat([
    { kind: "every-element-order", collection: { id, start: 0, end: 10 },
      bound, direction: "lower" },
    { kind: "member", collection: { id, start: 3, end: 4 }, element: member }
  ] as Fact[]);
  expect(compareNumbers(bound, member, "<=", knowledge).value).toBe(true);
});

test("reviewed inherited hooks stop uncertain reads without invoking them", () => {
  const object = getObjectPrototype(), array = getArrayPrototype();
  const priorObject = object.propertyAccess, priorArray = array.propertyAccess;
  let invoked = 0;
  const hook = { read(name: string, context: any) {
    invoked++;
    return name === "1" ? [ESNumber(99), context] as any : undefined;
  }, write() { invoked++; return undefined; } };
  try {
    for (const prototype of [object, array]) {
      prototype.propertyAccess = hook;
      const input = symbolicNumberArray({ minimumLength: 1,
        maximumLength: 2, element: ESNumber(7) });
      const [completion] = evaluateCode("const value = input[1];",
        setVariablesInScope(nodeInitialExecutionContext, { input }));
      expect(isExecutionBoundary(completion)).toBe(true);
      prototype.propertyAccess = prototype === object ? priorObject : priorArray;
    }
    expect(invoked).toBe(0);
  } finally {
    if (priorObject) object.propertyAccess = priorObject;
    else delete object.propertyAccess;
    if (priorArray) array.propertyAccess = priorArray;
    else delete array.propertyAccess;
  }
  const ordinary = symbolicNumberArray({ minimumLength: 1,
    maximumLength: 2, element: ESNumber(7) });
  expect(normal("const value = input[1];", { input: ordinary }).value).not.toBe(Undefined);
});

test("mutating the default Array prototype read hook in place invalidates trust", () => {
  const hook = getArrayPrototype().propertyAccess!;
  const originalRead = hook.read;
  let invoked = 0;
  try {
    hook.read = (name, context) => {
      invoked++;
      return name === "1" ? [ESNumber(99), context] : undefined;
    };
    const input = symbolicNumberArray({ minimumLength: 1,
      maximumLength: 2, element: ESNumber(7) });
    const [completion] = evaluateCode("const value = input[1];",
      setVariablesInScope(nodeInitialExecutionContext, { input }));
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(invoked).toBe(0);
  } finally {
    hook.read = originalRead;
  }
  const restored = symbolicNumberArray({ minimumLength: 1,
    maximumLength: 2, element: ESNumber(7) });
  expect(normal("const value = input[1];", { input: restored }).value).not.toBe(Undefined);
});

test("safe affine symbolic positions alias slice offsets and subtraction", () => {
  const input = symbolicNumberArray({ minimumLength: 12, element: finiteElement() });
  const i = integerIndex(2, 8);
  const result = normal(`
    const tail = input.slice(2);
    const forward = tail[i] === input[i + 2];
    const reversed = tail[i] === input[2 + i];
    const backward = input[i + 2 - 2] === input[i];
    const shiftedBack = tail[i - 2] === input[i];
  `, { input, i });
  for (const name of ["forward", "reversed", "backward", "shiftedBack"])
    expect(result[name]).toMatchObject({ value: true });
});

test("affine normalization declines fractional, maybe-NaN and unsafe arithmetic", () => {
  const integer = integerIndex(1, 8);
  expect(exactIntegerEndpoint(arithmeticNumber("+", integer, ESNumber(0.5)))).toBeUndefined();
  expect(exactIntegerEndpoint(arithmeticNumber("-", integer, ESNumber(0.5)))).toBeUndefined();
  expect(exactIntegerEndpoint(arithmeticNumber("+", ESNumber(), ESNumber(2)))).toBeUndefined();
  const nearLimit = integerIndex(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER);
  const overflow = arithmeticNumber("+", nearLimit, ESNumber(2));
  expect(exactIntegerEndpoint(overflow)).toBeUndefined();
  expect(exactIntegerEndpoint(arithmeticNumber("-", overflow, ESNumber(2)))).toBeUndefined();
  const input = symbolicNumberArray({ minimumLength: 12, element: finiteElement() });
  for (const key of [arithmeticNumber("+", integer, ESNumber(0.5)),
    arithmeticNumber("+", ESNumber(), ESNumber(2))]) {
    const [completion] = evaluateCode("const value = input[key];",
      setVariablesInScope(nodeInitialExecutionContext, { input, key }));
    expect(isExecutionBoundary(completion)).toBe(true);
  }
});

test("a narrowed earlier read does not cache a later branch's selected position", () => {
  const input = symbolicNumberArray({ minimumLength: 12, element: finiteElement() });
  const i = integerIndex(1, 10);
  const result = normal(`
    let earlier = 0;
    if (i < 3) earlier = input[i];
    const later = input[i];
    const narrowed = later === input[1] || later === input[2];
    const repeated = later === input[i];
  `, { input, i });
  expect((result.narrowed as TESBoolean).value).toBeUndefined();
  expect(result.repeated).toMatchObject({ value: true });
  const two = integerIndex(1, 2);
  const narrowed = normal(`
    let earlier = 0;
    if (i === 1) earlier = input[i];
    const later = input[i];
    const forced = later === input[1];
  `, { input: symbolicNumberArray({ minimumLength: 12,
    element: finiteElement() }), i: two });
  expect((narrowed.forced as TESBoolean).value).toBeUndefined();
});

test("quantified order cannot establish its own endpoint containment", () => {
  const id = {}, x = integerIndex(1, 10), y = integerIndex(1, 10);
  const knowledge: Fact[] = [
    { kind: "every-element-order", collection: { id, start: 0,
      end: { base: x, offset: 0 } }, bound: x, direction: "upper" },
    { kind: "member", collection: { id, start: 0,
      end: { base: y, offset: 0 } }, element: y }
  ];
  expect(compareNumbers(y, x, "<=", knowledge).value).toBeUndefined();
});
