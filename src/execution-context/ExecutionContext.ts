import { Any, Undefined, TESBoolean } from "../types";
import { TESObject } from "../Object";
import { Knowledge } from "../symbolic";
import { Heap } from "./Heap";
import { EffectTrace } from "../effects/model";

// Environment identities never contain mutable values. Every execution path
// owns a persistent version of the records, just as it does for object state.
export type Environment = {
  parent?: Environment;
  kind: "global" | "function" | "parameters" | "block" | "named-function";
  // Some host environments expose a global object without yet modeling the
  // object-backed var/function declaration record. Never create private vars
  // there that falsely appear to be shared host globals.
  unmodeledGlobalDeclarations?: string;
};
export type BindingKind = "var" | "let" | "const" | "parameter" | "function" | "catch" | "name" | "host";
export type Binding = {
  kind: BindingKind;
  mutable: boolean;
  initialized: boolean | TESBoolean;
  value: Any;
  // A real implicit binding may exist before its value is modeled. Keep the
  // boundary in the persistent record, including after a closure escapes.
  unmodeled?: string;
};
export type EnvironmentStore = Map<Environment, Map<string, Binding>>;

export type TExecutionContext = {
  value: {
    thisValue: Any;
    scope: {
      [identifier: string]: Any;
    };
    global: TESObject;
    stderr: string;
    uncaught?: Any;
    knowledge?: Knowledge;
    heap?: Heap;
    effects?: EffectTrace;
    environment: Environment;
    environments: EnvironmentStore;
    strict?: boolean;
    // Temporary proof-session hooks, never installed for ordinary execution.
    interceptCall?: (
      callee: Any, args: Any[], context: TExecutionContext, receiver?: Any
    ) => [Any, TExecutionContext] | undefined;
    validateRead?: (object: Any, name: string, context: TExecutionContext) => void;
    validateBinding?: (
      environment: Environment, name: string, context: TExecutionContext,
      access: "read" | "write"
    ) => void;
    evaluationBudget?: { remaining: number };
  };
};

export function ExecutionContext(value: any): TExecutionContext & { type: "ExecutionContext" } {
  const environment: Environment = value.environment || { kind: "global" };
  const environments: EnvironmentStore = value.environments || new Map([
    [environment, new Map(Object.keys(value.scope || {}).map(name => [name, {
      kind: "host" as BindingKind, mutable: true, initialized: true, value: value.scope[name]
    }] as [string, Binding]))]
  ]);
  // Compatibility view for consumers inspecting results. Name lookup and
  // assignment use the environment records, never this flattened projection.
  const scope: { [name: string]: Any } = Object.create(null);
  const seen = new Set<string>();
  for (let current: Environment | undefined = environment; current; current = current.parent) {
    const record = environments.get(current);
    if (record) record.forEach((binding, name) => {
      if (!seen.has(name)) {
        seen.add(name);
        if (binding.initialized === true && !binding.unmodeled) scope[name] = binding.value;
      }
    });
  }
  return {
    type: "ExecutionContext",
    value: { stderr: "", ...value, environment, environments, scope }
  };
}

export function resolveBinding(
  context: TExecutionContext, name: string, start = context.value.environment
): { environment: Environment; binding: Binding } | undefined {
  for (let environment: Environment | undefined = start; environment; environment = environment.parent) {
    const binding = context.value.environments.get(environment)!.get(name);
    if (binding) return { environment, binding };
  }
  return undefined;
}

export function setEnvironment(context: TExecutionContext, environment: Environment): TExecutionContext {
  return ExecutionContext({ ...context.value, environment });
}

export function enterEnvironment(
  context: TExecutionContext, kind: Environment["kind"], parent = context.value.environment
): TExecutionContext {
  const environment = { kind, parent };
  const environments = new Map(context.value.environments);
  environments.set(environment, new Map());
  return ExecutionContext({ ...context.value, environment, environments });
}

export function putBinding(
  context: TExecutionContext, environment: Environment, name: string, binding: Binding
): TExecutionContext {
  const record = new Map(context.value.environments.get(environment)!);
  record.set(name, binding);
  const environments = new Map(context.value.environments);
  environments.set(environment, record);
  return ExecutionContext({ ...context.value, environments });
}

export function declareBinding(
  context: TExecutionContext, name: string, kind: BindingKind,
  initialized = false, value: Any = Undefined
): TExecutionContext {
  return putBinding(context, context.value.environment, name, {
    kind, mutable: kind !== "const" && kind !== "name", initialized, value
  });
}

export function setCurrentThisValue(
  execContext: TExecutionContext,
  val: Any
): TExecutionContext {
  return ExecutionContext({ ...execContext.value, thisValue: val });
}

export function setVariableInScope(
  execContext: TExecutionContext,
  name: string,
  val: Any
) {
  // Host input setup deliberately bypasses language assignment restrictions.
  // Interpreted writes use assignBinding instead.
  const resolved = resolveBinding(execContext, name);
  return resolved
    ? putBinding(execContext, resolved.environment, name,
      { ...resolved.binding, initialized: true, value: val, unmodeled: undefined })
    : declareBinding(execContext, name, "host", true, val);
}

export function setVariablesInScope(
  execContext: TExecutionContext,
  variables: {
    [name: string]: Any;
  }
) {
  let result = execContext;
  for (const [name, type] of Object.entries(variables)) {
    result = setVariableInScope(result, name, type);
  }

  return result;
}
