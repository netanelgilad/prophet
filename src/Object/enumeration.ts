import { unsupportedPropertyError } from "../execution-context/analysis-failure";
import { Any, WithProperties, Undefined, isUndefined, isESNull, isESNumber, isESBoolean, isESString } from "../types";
import { ESObject } from "../Object";
import { ESString } from "../string/String";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { getPropertyKeys, ownPropertyPresence, writeProperty } from "../execution-context/Heap";
import { PropertyKeys } from "../execution-context/PropertyKeys";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { withValue } from "../conversion/toString";
import { bindNormal } from "../evaluate";
import { readMember } from "../ASTResolvers";

type KeyContinuation = (source: WithProperties, keys: ReadonlyArray<string>, context: TExecutionContext) => BranchResult;

function withKeyOrder(order: PropertyKeys, context: TExecutionContext,
  continuation: (keys: ReadonlyArray<string>, context: TExecutionContext) => BranchResult): BranchResult {
  return order.kind === "choice" ? evaluateBranches(order.condition, context,
    branch => withKeyOrder(order.consequent, branch, continuation),
    branch => withKeyOrder(order.alternate, branch, continuation)) : continuation(order.keys, context);
}

// The first own-property domain is complete, enumerable string-keyed data.
// Unknown descriptors or keys are coverage errors, never silently empty sets.
// String boxing is local: only its UTF-16 indexed characters are enumerable.
export function withEnumerableOwnProperties(source: Any, context: TExecutionContext,
  continuation: KeyContinuation): BranchResult {
  return withValue(source, context, (value, branch) => {
    if (isUndefined(value) || isESNull(value) || isESNumber(value) || isESBoolean(value)) {
      return continuation(ESObject(), [], branch);
    }
    if (isESString(value)) {
      if (typeof value.value !== "string") throw new Error("Own property enumeration of an unknown string is not yet supported");
      const properties: { [name: string]: Any } = Object.create(null);
      for (let index = 0; index < value.value.length; index++) properties[index] = ESString(value.value.charAt(index));
      const boxed = ESObject(properties);
      return continuation(boxed, Object.keys(properties), branch);
    }
    const object = value as WithProperties;
    if (object.unknownProperties || object.unmodeledOwnPropertyInspection || object.ownPropertyModel !== "enumerable-data") {
      throw unsupportedPropertyError(object, "Own property enumeration is not yet supported for unmodeled descriptors or keys");
    }
    if (object.unmodeledPropertyReads && object.unmodeledPropertyReads.length) {
      throw unsupportedPropertyError(object, "Own property enumeration cannot assume unmodeled properties are absent");
    }
    return withKeyOrder(getPropertyKeys(object, branch), branch, (keys, after) => continuation(object, keys, after));
  });
}

// CopyDataProperties snapshots keys once, checks current own presence, reads
// through the VM, and creates target data fields without consulting a setter.
export function copyDataProperties(target: WithProperties, source: Any, context: TExecutionContext): BranchResult {
  return withEnumerableOwnProperties(source, context, (object, keys, initial) => {
    const copy = (index: number, current: TExecutionContext): BranchResult => {
      if (index === keys.length) return [Undefined, current];
      const key = keys[index];
      return evaluateBranches(ownPropertyPresence(object, key, current), current,
        branch => bindNormal(readMember(object, key, branch), (value, after) =>
          copy(index + 1, writeProperty(target, key, value, after))),
        branch => copy(index + 1, branch));
    };
    return copy(0, initial);
  });
}
