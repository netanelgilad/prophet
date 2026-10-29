import { Any, ESNumber, isESNumber, isESNull, WithProperties } from '../types';
import { ArrayValue } from './Array';
import { TExecutionContext } from '../execution-context/ExecutionContext';
import { BranchResult } from '../execution-context/branches';
import { getProperties, writeJoinedArrayProperty } from '../execution-context/Heap';
import { choiceOf, selectValue } from '../symbolic';
import { Expression } from '../symbolic/model';
import { getObjectPrototype, prototypeOf } from '../Object/prototype';
import { arrayBoundary, getArrayPrototype, hasDefaultArrayPrototypeIndexedLookup,
  hasDefaultArrayPrototypeIndexedWrite } from './prototype';

// Finite ordinary arrays retain complete own storage after a join even when
// their conditional layouts cannot share one elements vector. Work on that
// storage directly; do not enumerate holes or reconstruct the original value.
export function assignJoinedArray(
  array: ArrayValue, name: string, assigned: Any, context: TExecutionContext
): BranchResult {
  if (array.shape.kind !== 'elements' || !context.value.heap || !context.value.heap.has(array) ||
      array === getArrayPrototype() || array.propertyAccess || array.unknownProperties ||
      array.unmodeledPrototype || array.unmodeledOwnPropertyInspection ||
      array.unmodeledPropertyReads && array.unmodeledPropertyReads.length ||
      array.unmodeledPropertyWrites && array.unmodeledPropertyWrites.length ||
      array.prototype !== getArrayPrototype()) {
    return arrayBoundary('joined writes require complete ordinary array storage');
  }
  if (name !== 'length') assertOrdinaryDestination(name);
  if (name === 'length' && !validLength(assigned)) {
    return arrayBoundary('joined array length requires a concrete valid numeric length');
  }
  const length = getProperties(array, context).length;
  // Preflight both branches, independently of their currently known truth, so
  // a cap or malformed choice cannot occur after copying/mutating heap state.
  let visits = 0;
  const active = new Set<Any>();
  const verify = (value: Any, depth: number): void => {
    if (++visits > 256 || depth > 16 || active.has(value)) {
      return arrayBoundary('joined array length choices exceed the supported work limit');
    }
    const choice = choiceOf(value);
    if (!choice) {
      if (!validLength(value)) return arrayBoundary('joined writes require finite concrete length choices');
      return;
    }
    active.add(value); verify(choice.consequent, depth + 1); verify(choice.alternate, depth + 1); active.delete(value);
  };
  verify(length, 0);
  // selectValue consults the guard expression, not just its top-level value.
  // Bound that closure too, including comparison refinements and operands.
  let expressionVisits = 0;
  const expressions = new Set<Any>();
  const verifyExpression = (value: Any, depth: number): void => {
    if (++expressionVisits > 1024 || depth > 32 || expressions.has(value)) {
      return arrayBoundary('joined array length expressions exceed the supported work limit');
    }
    const expression = (value as { expression?: Expression }).expression;
    if (!expression) return;
    expressions.add(value);
    const child = (next: Any): void => verifyExpression(next, depth + 1);
    switch (expression.kind) {
      case 'select': child(expression.condition); child(expression.consequent); child(expression.alternate); break;
      case 'compare': child(expression.left); child(expression.right); if (expression.refinement) child(expression.refinement); break;
      case 'strict-equal': case 'binary': child(expression.left); child(expression.right); break;
      case 'not': case 'typeof': case 'truthy': case 'unary': child(expression.operand); break;
      case 'indexed-element': child(expression.index); break;
      case 'string-slice': child(expression.operand); child(expression.start); if (expression.end) child(expression.end); break;
      default: return arrayBoundary('unmodeled joined array length expression');
    }
    expressions.delete(value);
  };
  verifyExpression(length, 0);
  const nextLength = (value: Any): Any => {
    const choice = choiceOf(value);
    if (choice) return selectValue(choice.condition, nextLength(choice.consequent), nextLength(choice.alternate), context.value.knowledge);
    return ESNumber(Math.max((value as ReturnType<typeof ESNumber>).value!, Number(name) + 1));
  };
  // ArraySetLength normalizes -0 to its uint32 representation, +0; the
  // assignment expression still returns the original assigned value.
  const updatedLength = name === 'length' ? ESNumber(Math.max(0, (assigned as ReturnType<typeof ESNumber>).value!)) : nextLength(length);
  return [assigned, writeJoinedArrayProperty(array, name, assigned, updatedLength, context)];
}

function validLength(value: Any): boolean {
  return isESNumber(value) && typeof value.value === 'number' && Number.isInteger(value.value) &&
    value.value >= 0 && value.value <= 0xffffffff;
}

function assertOrdinaryDestination(name: string): void {
  const arrayPrototype = getArrayPrototype(), objectPrototype = getObjectPrototype();
  if (prototypeOf(arrayPrototype) !== objectPrototype || !isESNull(prototypeOf(objectPrototype)) ||
      !hasDefaultArrayPrototypeIndexedLookup(arrayPrototype) || !hasDefaultArrayPrototypeIndexedWrite(arrayPrototype) ||
      objectPrototype.propertyAccess) return arrayBoundary('custom inherited destination hooks in joined writes');
  for (const link of [arrayPrototype, objectPrototype]) {
    const model = link as WithProperties;
    if (model.unmodeledPropertyWrites && model.unmodeledPropertyWrites.length > 256 ||
        model.unmodeledPropertyReads && model.unmodeledPropertyReads.length > 256) {
      return arrayBoundary('joined destination metadata exceeds the supported work limit');
    }
    if (model.unknownProperties || model.unmodeledPrototype ||
        model.unmodeledPropertyWrites && model.unmodeledPropertyWrites.includes(name) ||
        model.unmodeledPropertyReads && model.unmodeledPropertyReads.includes(name)) {
      return arrayBoundary('unresolved inherited destination state in joined writes');
    }
  }
}
