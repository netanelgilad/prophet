import { Any, ThrownValue, Undefined } from "../types";
import { ESObject } from "../Object";
import { ESString } from "../string/String";
import { getProperties, writeProperty } from "./Heap";
import { TExecutionContext, Environment, resolveBinding, putBinding, declareBinding } from "./ExecutionContext";
import { BranchResult, evaluateBranches } from "./branches";

// These are interpreted abrupt completions, so ordinary JavaScript catch and
// finally can handle them. Unsupported VM operations still use host errors.
export function bindingError(name: "ReferenceError" | "TypeError" | "SyntaxError", message: string) {
  return ThrownValue(ESObject({ name: ESString(name), message: ESString(message) }));
}

export function readBinding(context: TExecutionContext, name: string): BranchResult {
  const resolved = resolveBinding(context, name);
  if (resolved) {
    if (context.value.validateBinding) {
      context.value.validateBinding(resolved.environment, name, context, "read");
    }
    const available = (branch: TExecutionContext): BranchResult => {
      if (resolved.binding.unmodeled) throw new Error(resolved.binding.unmodeled);
      return [resolved.binding.value, branch];
    };
    const unavailable = (branch: TExecutionContext): BranchResult => [
      bindingError("ReferenceError", `Cannot access '${name}' before initialization`), branch
    ];
    return typeof resolved.binding.initialized === "boolean"
      ? (resolved.binding.initialized ? available : unavailable)(context)
      : evaluateBranches(resolved.binding.initialized, context, available, unavailable);
  }
  const properties = getProperties(context.value.global, context);
  return [Object.prototype.hasOwnProperty.call(properties, name) ? properties[name] :
    bindingError("ReferenceError", `${name} is not defined`), context];
}

export function hasBinding(context: TExecutionContext, name: string): boolean {
  return !!resolveBinding(context, name) ||
    Object.prototype.hasOwnProperty.call(getProperties(context.value.global, context), name);
}

export type BindingReference = { environment?: Environment; resolvable: boolean };

export function bindingReference(context: TExecutionContext, name: string): BindingReference {
  const resolved = resolveBinding(context, name);
  return { environment: resolved && resolved.environment, resolvable: hasBinding(context, name) };
}

export function assignBinding(
  context: TExecutionContext, name: string, value: Any,
  reference: BindingReference = bindingReference(context, name)
): BranchResult {
  // Resolve the target before evaluating the RHS, but read its current state
  // when writing. Eval on the RHS can introduce a nearer binding with the same
  // name; that must not redirect an already resolved assignment reference.
  const resolved = reference.environment && {
    environment: reference.environment,
    binding: context.value.environments.get(reference.environment)!.get(name)!
  };
  if (resolved) {
    if (context.value.validateBinding) {
      context.value.validateBinding(resolved.environment, name, context, "write");
    }
    const binding = resolved.binding;
    const unavailable = (branch: TExecutionContext): BranchResult => [
      bindingError("ReferenceError", `Cannot access '${name}' before initialization`), branch
    ];
    const available = (branch: TExecutionContext): BranchResult => {
      if (!binding.mutable) {
        // A named function expression has a private, immutable self name. Its
        // assignment is silent in sloppy code; const assignment always throws.
        if (binding.kind === "name" && !branch.value.strict) return [value, branch];
        return [bindingError("TypeError", `Assignment to constant binding '${name}'`), branch];
      }
      return [value, putBinding(branch, resolved.environment, name, {
        ...binding, initialized: true, value, unmodeled: undefined
      })];
    };
    return typeof binding.initialized === "boolean"
      ? (binding.initialized ? available : unavailable)(context)
      : evaluateBranches(binding.initialized, context, available, unavailable);
  }
  if (context.value.strict && !reference.resolvable) {
    return [bindingError("ReferenceError", `${name} is not defined`), context];
  }
  return [value, writeProperty(context.value.global, name, value, context)];
}

export function initializeBinding(context: TExecutionContext, name: string, value: Any): TExecutionContext {
  const environment = context.value.environment;
  const binding = context.value.environments.get(environment)!.get(name);
  if (!binding || binding.initialized !== false) throw new Error(`Binding '${name}' was not prepared for initialization`);
  return putBinding(context, environment, name, { ...binding, initialized: true, value });
}

export function declareVar(context: TExecutionContext, name: string, kind: "var" | "function" = "var") {
  return context.value.environments.get(context.value.environment)!.has(name)
    ? context : declareBinding(context, name, kind, true, Undefined);
}
