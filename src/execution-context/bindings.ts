import { Any, ThrownValue, Undefined, TESBoolean } from "../types";
import { createError } from "../error/Error";
import { ESString } from "../string/String";
import { writeProperty } from "./Heap";
import { hasProperty } from "../Object/prototype";
import { readMember } from "../ASTResolvers";
import { ESBoolean } from "../boolean/ESBoolean";
import { TExecutionContext, Environment, resolveBinding, putBinding, declareBinding } from "./ExecutionContext";
import { BranchResult, evaluateBranches } from "./branches";

// These are interpreted abrupt completions, so ordinary JavaScript catch and
// finally can handle them. Unsupported VM operations still use host errors.
export function bindingError(name: "ReferenceError" | "TypeError" | "SyntaxError", message: string) {
  return ThrownValue(createError(name, ESString(message)));
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
  return evaluateBranches(hasProperty(context.value.global, name, context), context,
    branch => readMember(branch.value.global, name, branch),
    branch => [bindingError("ReferenceError", `${name} is not defined`), branch]);
}

export function hasBinding(context: TExecutionContext, name: string): TESBoolean {
  return resolveBinding(context, name) ? ESBoolean(true) : hasProperty(context.value.global, name, context);
}

export type BindingReference = { environment?: Environment; resolvable: TESBoolean };

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
  const write = (branch: TExecutionContext): BranchResult =>
    [value, writeProperty(branch.value.global, name, value, branch)];
  return context.value.strict ? evaluateBranches(reference.resolvable, context, write,
    branch => [bindingError("ReferenceError", `${name} is not defined`), branch]) : write(context);
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
