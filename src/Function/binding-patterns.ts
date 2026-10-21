import { ESTree } from "cherow";
import { Any, Undefined, isUndefined, isESNull, ThrownValue, isArray, isESString, isESNumber } from "../types";
import { assertOrdinaryArrayIterator } from "../array/spread";
import { ExecutionBudgetError, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { bindNormal, evaluate } from "../evaluate";
import { staticPropertyName } from "../Object/static-key";
import { propertyName, readMember } from "../ASTResolvers";
import { getObjectPrototype, prototypeOf } from "../Object/prototype";
import { isObjectValue, withValue } from "../conversion/toString";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { assignBinding, bindingReference, BindingReference, initializeBinding } from "../execution-context/bindings";

/** BoundNames for the supported declaration patterns. Walk only binding targets,
 * never property names or initializer expressions. Validate unsupported forms
 * during instantiation, before any declaration initializer executes. */
export function boundNames(pattern: ESTree.Pattern, depth = 0): string[] {
  if (depth > 32) throw new ExecutionBudgetError("Binding pattern nesting exceeds 32");
  if (pattern.type === "Identifier") return [pattern.name];
  if (pattern.type === "AssignmentPattern") return boundNames(pattern.left, depth + 1);
  if (pattern.type === "ObjectPattern") {
    let names: string[] = [];
    for (const property of pattern.properties) {
      if (property.type !== "Property") throw new Error("Object binding rest properties are not yet supported");
      names = names.concat(boundNames(property.value as ESTree.Pattern, depth + 1));
    }
    return names;
  }
  if (pattern.type === "ArrayPattern") {
    if (pattern.elements.length > 64) throw new ExecutionBudgetError("Array binding exceeds 64 elements");
    let names: string[] = [];
    for (const element of pattern.elements) {
      if (element === null) continue;
      if (element.type === "RestElement") throw new Error("Array binding rest elements are not yet supported");
      names = names.concat(boundNames(element, depth + 1));
    }
    return names;
  }
  throw new Error("Rest binding patterns are not yet supported");
}

/** BindingInitialization for declarations. Ordinary Get is shared with member
 * reads; defaults run only for undefined, with the current lexical environment.
 * Parameters and assignment targets have different instantiation/reference rules
 * and remain separate explicit boundaries. */
export function initializeBindingPattern(pattern: ESTree.Pattern, value: Any,
  kind: "var" | "let" | "const", context: TExecutionContext,
  reference?: BindingReference): BranchResult {
  if (pattern.type === "Identifier") return kind === "var"
    ? assignBinding(context, pattern.name, value, reference)
    : [Undefined, initializeBinding(context, pattern.name, value)];
  if (pattern.type === "AssignmentPattern") {
    const target = pattern.left;
    const resolved = reference || (kind === "var" && target.type === "Identifier"
      ? bindingReference(context, target.name) : undefined);
    return withValue(value, context, (selected, branch) => bindNormal(
      isUndefined(selected) ? evaluate(pattern.right, branch) : [selected, branch],
      (supplied, after) => initializeBindingPattern(target, supplied, kind, after, resolved)));
  }
  if (pattern.type === "ArrayPattern") {
    return withValue(value, context, (source, branch) => {
      // Pinned Node 24.21.0: array binding applies the iterator protocol, but
      // for null/undefined, non-iterable plain objects and non-string
      // primitives the protocol lookup itself throws a TypeError, even for an
      // empty pattern. Ordinary arrays read indices 0..elements.length-1 in
      // order through ordinary Get (a source hole binds undefined) and stop
      // after the last pattern element. Assumption: the ordinary sources
      // modeled here carry no Symbol.iterator override; strings and custom
      // iterables take the real protocol and stay an explicit gap, as do
      // accessor-driven index reads.
      if (isArray(source)) {
        assertOrdinaryArrayIterator(source);
        if (pattern.elements.length > 64) throw new ExecutionBudgetError("Array binding exceeds 64 elements");
        const initializeElement = (index: number, current: TExecutionContext, done = false): BranchResult => {
          if (index >= pattern.elements.length) return [Undefined, current];
          const element = pattern.elements[index];
          if (element && element.type === "RestElement") throw new Error("Array binding rest elements are not yet supported");
          const bindItem = (item: Any, afterRead: TExecutionContext, exhausted: boolean): BranchResult => {
            if (element === null) return initializeElement(index + 1, afterRead, exhausted);
            const target = element.type === "AssignmentPattern" ? element.left : element;
            const resolved = kind === "var" && target.type === "Identifier" ? bindingReference(current, target.name) : undefined;
            return bindNormal(initializeBindingPattern(element, item, kind, afterRead, resolved),
              (_value, afterBinding) => initializeElement(index + 1, afterBinding, exhausted));
          };
          if (done) return bindItem(Undefined, current, true);
          return bindNormal(readMember(source, "length", current), (length, afterLength) =>
            withValue(length, afterLength, (selected, selectedContext) => {
              if (!isESNumber(selected) || typeof selected.value !== "number") {
                throw new UnsupportedAnalysisError("Array binding requires a concrete current iterator length");
              }
              if (index >= selected.value) return bindItem(Undefined, selectedContext, true);
              return bindNormal(readMember(source, String(index), selectedContext), (item, afterRead) => bindItem(item, afterRead, false));
            }));
        };
        return initializeElement(0, branch);
      }
      if (isESString(source)) {
        throw new Error("Array binding pattern sources must be ordinary arrays; the iterator protocol is not yet supported");
      }
      // The TypeError below is only valid for sources PROVABLY lacking a
      // Symbol.iterator. Guest-ordinary objects qualify: Symbol APIs are
      // unmodeled, so no guest source can carry an iterator binding. Host
      // objects (marked with unknown/unmodeled surfaces or a non-ordinary
      // prototype) may be iterable in Node - a modeled Buffer chunk
      // destructures fine natively - so they stop as a typed boundary
      // instead of throwing a wrong catchable TypeError.
      if (isObjectValue(source)) {
        const marked = source as { unknownProperties?: string; unmodeledOwnPropertyInspection?: string;
          unmodeledPropertyReads?: string[]; propertyAccess?: object; unmodeledPrototype?: boolean;
          ownPropertyModel?: string };
        const ownSymbols = (source as {wellKnownSymbols?: Map<object, Any>}).wellKnownSymbols;
        const inheritedSymbols = getObjectPrototype().wellKnownSymbols;
        if ((ownSymbols && ownSymbols.size) || (inheritedSymbols && inheritedSymbols.size) ||
            marked.unknownProperties || marked.unmodeledOwnPropertyInspection ||
            (marked.unmodeledPropertyReads && marked.unmodeledPropertyReads.length) ||
            marked.propertyAccess || marked.unmodeledPrototype ||
            (marked.ownPropertyModel !== undefined && marked.ownPropertyModel !== "enumerable-data") ||
            prototypeOf(source) !== getObjectPrototype()) {
          throw new Error("Array binding pattern host-object sources that may carry an iterator are not yet supported");
        }
      }
      // Preserve the TypeError type without inventing a concrete message.
      return [ThrownValue(createError("TypeError", ESString())), branch];
    });
  }
  if (pattern.type !== "ObjectPattern") throw new Error("Rest binding patterns are not yet supported");
  return withValue(value, context, (source, branch) => {
    // RequireObjectCoercible applies even when there are no bindings.
    if (isUndefined(source) || isESNull(source)) {
      // Native diagnostic wording depends on the exact pattern/source spelling.
      // Preserve its type without inventing a concrete message.
      return [ThrownValue(createError("TypeError", ESString())), branch];
    }
    // Empty patterns do not read/box any property. Nonempty primitive patterns
    // need correct wrapper GetV (not fabricated missing string indices).
    if (pattern.properties.length && !isObjectValue(source)) {
      throw new Error("Object binding property reads on primitive values require unmodeled boxing");
    }
    const initialize = (index: number, current: TExecutionContext): BranchResult => {
      if (index === pattern.properties.length) return [Undefined, current];
      const property = pattern.properties[index];
      if (property.type !== "Property") throw new Error("Object binding rest properties are not yet supported");
      const target = property.value as ESTree.Pattern;
      const read = (name: string, afterKey: TExecutionContext): BranchResult => {
        const identifier = target.type === "AssignmentPattern" ? target.left : target;
        // KeyedBindingInitialization resolves a var target BEFORE reading the
        // property or running its default; a getter/eval must not redirect it.
        const resolved = kind === "var" && identifier.type === "Identifier"
          ? bindingReference(afterKey, identifier.name) : undefined;
        return bindNormal(readMember(source, name, afterKey), (item, afterRead) =>
          bindNormal(initializeBindingPattern(target, item, kind, afterRead, resolved),
            (_value, afterBinding) => initialize(index + 1, afterBinding)));
      };
      return property.computed ? bindNormal(evaluate(property.key, current), (key, afterKey) =>
        withValue(key, afterKey, (selected, afterChoice) => read(propertyName(selected), afterChoice))) :
        read(staticPropertyName(property.key, current), current);
    };
    return initialize(0, branch);
  });
}
