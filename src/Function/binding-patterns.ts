import { ESTree } from "cherow";
import { Any, Undefined, isUndefined, isESNull, ThrownValue } from "../types";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { bindNormal, evaluate } from "../evaluate";
import { propertyName, readMember } from "../ASTResolvers";
import { isObjectValue, withValue } from "../conversion/toString";
import { BranchResult } from "../execution-context/branches";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { assignBinding, bindingReference, BindingReference, initializeBinding } from "../execution-context/bindings";

/** BoundNames for the supported declaration patterns. Walk only binding targets,
 * never property names or initializer expressions. Validate unsupported forms
 * during instantiation, before any declaration initializer executes. */
export function boundNames(pattern: ESTree.Pattern): string[] {
  if (pattern.type === "Identifier") return [pattern.name];
  if (pattern.type === "AssignmentPattern") return boundNames(pattern.left);
  if (pattern.type === "ObjectPattern") {
    let names: string[] = [];
    for (const property of pattern.properties) {
      if (property.type !== "Property") throw new Error("Object binding rest properties are not yet supported");
      names = names.concat(boundNames(property.value as ESTree.Pattern));
    }
    return names;
  }
  throw new Error("Array and rest binding patterns are not yet supported");
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
  if (pattern.type !== "ObjectPattern") throw new Error("Array and rest binding patterns are not yet supported");
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
        read(property.key.type === "Identifier" ? property.key.name : String((property.key as ESTree.Literal).value), current);
    };
    return initialize(0, branch);
  });
}
