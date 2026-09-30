import { invoke, readMember } from "../ASTResolvers";
import { Array as ESArray, TArray } from "../array/Array";
import { ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getArrayElements, getProperties, writeProperty } from "../execution-context/Heap";
import { isESFunction } from "../Function/Function";
import { getFunctionPrototype } from "../Function/prototype";
import { ESObject, TESObject } from "../Object";
import { hasProperty } from "../Object/prototype";
import { ESString } from "../string/String";
import { resolveBoolean, strictEquality } from "../symbolic";
import { Any, ESNumber, isArray, isESString, isUndefined, TESBoolean, ThrownValue, Undefined } from "../types";

function unsupported(detail: string): never {
  throw new Error(`EventEmitter analysis is not yet supported: ${detail}`);
}

type EmitterPolicy = {
  // HTTP has additional internal listeners. Public emission/counting cannot
  // bypass its lifecycle or pretend those listeners do not exist.
  restrictedEvents?: ReadonlyArray<string>;
  unsupportedRegistrations?: ReadonlyArray<string>;
  internalListenerCounts?: { readonly [name: string]: number };
};

/** A Node boundary, with listener registration and once state in the VM heap. */
export function createEventEmitterModel() {
  const states = new WeakMap<object, { state: TESObject; policy: EmitterPolicy }>();
  const stateOf = (target: Any, context: TExecutionContext) => {
    const record = states.get(target);
    if (!record || resolveBoolean(getProperties(record.state, context).initialized as TESBoolean ||
      ESBoolean(false), context.value.knowledge) !== true) {
      return unsupported("receiver is not an initialized emitter in this execution state");
    }
    return record;
  };
  const operation = (name: string, model: HostModel) => Object.assign(createHostFunction(`events.${name}`, model), {
    nonConstructible: false,
    unmodeledConstruct: "EventEmitter method construction is not yet supported",
    unknownProperties: "Node EventEmitter function metadata",
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node EventEmitter function descriptors"
  });
  const withName = (name: Any, context: TExecutionContext,
    next: (name: string, context: TExecutionContext) => BranchResult): BranchResult =>
    withValue(name, context, (selected, branch) => {
      if (!isESString(selected) || typeof selected.value !== "string") return unsupported("event names require known strings or finite choices");
      return next(selected.value, branch);
    });
  const withListeners = (target: Any, name: string, context: TExecutionContext,
    next: (entries: TESObject[], context: TExecutionContext) => BranchResult): BranchResult => {
    const state = stateOf(target, context).state;
    const value = getProperties(state, context)[`event:${name}`] || Undefined;
    return withValue(value, context, (selected, branch) => {
      if (isUndefined(selected)) return next([], branch);
      if (!isArray(selected)) throw new Error("Invalid internal listener list");
      const entries = getArrayElements(selected as TArray<Any>, branch);
      if (!entries) throw new Error("Unknown internal listener list");
      return next(entries as TESObject[], branch);
    });
  };
  const save = (target: Any, name: string, entries: TESObject[], context: TExecutionContext) =>
    writeProperty(stateOf(target, context).state, `event:${name}`, ESArray(entries), context);
  const withListener = (listener: Any, context: TExecutionContext,
    next: (listener: Any, context: TExecutionContext) => BranchResult) =>
    withValue(listener, context, (selected, branch) => {
      if (isESFunction(selected)) return next(selected, branch);
      const error = createError("TypeError");
      error.properties.code = ESString("ERR_INVALID_ARG_TYPE");
      error.unmodeledPropertyReads = ["stack", "message"];
      return [ThrownValue(error), branch] as BranchResult;
    });
  const register = (target: Any, name: string, listener: Any, once: boolean,
    context: TExecutionContext): BranchResult => {
    if (name === "newListener" || name === "removeListener") return unsupported("listener meta-events");
    const policy = stateOf(target, context).policy;
    if ((policy.unsupportedRegistrations || []).includes(name)) return unsupported(`host event '${name}' delivery`);
    return withListeners(target, name, context, (entries, branch) => {
      const internal = policy.internalListenerCounts &&
        Object.prototype.hasOwnProperty.call(policy.internalListenerCounts, name) ? policy.internalListenerCounts[name] : 0;
      if (entries.length + internal >= 10) return unsupported("listener-limit warnings");
      const entry = ESObject({ listener, once: ESBoolean(once), fired: ESBoolean(false) });
      return [target, save(target, name, [...entries, entry], branch)];
    });
  };
  const add = (once: boolean) => operation(once ? "once" : "on", (call, context) =>
    withListener(call.args[1] || Undefined, context, (listener, after) =>
      withName(call.args[0] || Undefined, after, (name, branch) =>
        register(call.receiver, name, listener, once, branch))));
  const on = add(false), once = add(true);

  const matches = (entry: TESObject, listener: Any, context: TExecutionContext,
    yes: (context: TExecutionContext) => BranchResult,
    no: (context: TExecutionContext) => BranchResult): BranchResult => {
    const registered = getProperties(entry, context).listener;
    return evaluateBranches(strictEquality(registered, listener, context.value.knowledge), context, yes, branch => {
      // Node also accepts a user function's .listener property, not only its
      // own once wrappers. A once wrapper has exactly the original function.
      if (getProperties(entry, branch).once === undefined) throw new Error("Invalid listener entry");
      if (resolveBoolean(getProperties(entry, branch).once as TESBoolean, branch.value.knowledge)) return no(branch);
      return bindNormal(readMember(registered, "listener", branch), (alias, after) =>
        evaluateBranches(strictEquality(alias, listener, after.value.knowledge), after, yes, no));
    });
  };
  const removeListener = operation("removeListener", (call, context) =>
    withListener(call.args[1] || Undefined, context, (listener, after) =>
      withName(call.args[0] || Undefined, after, (name, branch) =>
        withListeners(call.receiver, name, branch, (entries, current) => {
          const remove = (index: number, leaf: TExecutionContext): BranchResult => index < 0
            ? [call.receiver, leaf]
            : matches(entries[index], listener, leaf,
              matched => [call.receiver, save(call.receiver, name,
                entries.filter((_entry, i) => i !== index), matched)],
              unmatched => remove(index - 1, unmatched));
          return remove(entries.length - 1, current);
        }))));

  const emitEvent = (target: Any, name: string, args: Any[], context: TExecutionContext): BranchResult =>
    withListeners(target, name, context, (snapshot, branch) => {
      if (snapshot.length === 0) {
        if (name !== "error") return [ESBoolean(false), branch];
        return withValue(args[0] || Undefined, branch, (error, after) => {
          if ((error as { errorData?: boolean }).errorData) return [ThrownValue(error), after];
          return unsupported("unhandled error event with a non-Error payload");
        });
      }
      const internalCounts = stateOf(target, branch).policy.internalListenerCounts;
      const internalCount = internalCounts && Object.prototype.hasOwnProperty.call(internalCounts, name)
        ? internalCounts[name] : 0;
      if (snapshot.length + internalCount === 1) {
        // Node uses handler.apply for its single-listener fast path, including
        // the private wrapper used by once. The VM does not implement the
        // intrinsic apply yet; any explicit replacement must remain a gap,
        // never be silently bypassed by direct invocation.
        const only = getProperties(snapshot[0], branch);
        const functionObject = resolveBoolean(only.once as TESBoolean, branch.value.knowledge)
          ? getFunctionPrototype() : only.listener;
        if (resolveBoolean(hasProperty(functionObject, "apply", branch), branch.value.knowledge) !== false) {
          return unsupported("custom listener apply dispatch");
        }
      }
      const visit = (index: number, current: TExecutionContext): BranchResult => {
        if (index === snapshot.length) return [ESBoolean(true), current];
        const entry = snapshot[index];
        const properties = getProperties(entry, current);
        const call = (ready: TExecutionContext) => bindNormal(
          invoke(properties.listener, args, ready, target), (_ignored, after) => visit(index + 1, after));
        if (!resolveBoolean(properties.once as TESBoolean, current.value.knowledge)) return call(current);
        return evaluateBranches(properties.fired as TESBoolean, current,
          fired => visit(index + 1, fired), fresh => {
            const marked = writeProperty(entry, "fired", ESBoolean(true), fresh);
            return bindNormal(withListeners(target, name, marked, (entries, after) =>
              [Undefined, save(target, name, entries.filter(item => item !== entry), after)]),
            (_removed, after) => call(after));
          });
      };
      return visit(0, branch);
    });
  const checkPublicEvent = (target: Any, name: string, context: TExecutionContext) => {
    if ((stateOf(target, context).policy.restrictedEvents || []).includes(name)) {
      unsupported(`public emission or listener counting of host lifecycle event '${name}'`);
    }
  };
  const emit = operation("emit", (call, context) => withName(call.args[0] || Undefined, context, (name, branch) => {
    checkPublicEvent(call.receiver, name, branch);
    return emitEvent(call.receiver, name, call.args.slice(1), branch);
  }));
  const listenerCount = operation("listenerCount", (call, context) => withName(call.args[0] || Undefined, context, (name, branch) => {
    checkPublicEvent(call.receiver, name, branch);
    if (call.args.length > 1 && !isUndefined(call.args[1])) return unsupported("listenerCount's listener argument");
    return withListeners(call.receiver, name, branch, (entries, after) => [ESNumber(entries.length), after]);
  }));
  const methods = { on, addListener: on, once, removeListener, off: removeListener, emit, listenerCount };
  const protectedFields = [...Object.keys(methods), "_events", "_eventsCount", "_maxListeners"];
  const prototype = Object.assign(ESObject(methods), {
    unknownProperties: "Node EventEmitter prototype API",
    unmodeledPropertyWrites: [...protectedFields, "constructor"],
    unmodeledOwnPropertyInspection: "Node EventEmitter prototype descriptors"
  });
  const initialize = (target: TESObject, context: TExecutionContext, policy: EmitterPolicy = {}) => {
    if (states.has(target)) return unsupported("reinitializing an EventEmitter");
    const state = ESObject();
    states.set(target, { state, policy });
    target.unknownProperties = target.unknownProperties || "Node EventEmitter instance API";
    target.unmodeledOwnPropertyInspection = target.unmodeledOwnPropertyInspection || "Node EventEmitter descriptors";
    target.unmodeledPropertyWrites = [...(target.unmodeledPropertyWrites || []), ...protectedFields];
    let initialized = writeProperty(state, "initialized", ESBoolean(true), context);
    // Partial host reads currently resolve only explicitly supplied fields.
    // Ownership remains guarded; these values do not claim own descriptors.
    for (const name of Object.keys(methods)) {
      initialized = writeProperty(target, name, (methods as { [name: string]: Any })[name], initialized);
    }
    return initialized;
  };
  const EventEmitter = Object.assign(createHostFunction("events.EventEmitter", (call, context) => {
    if (call.args.some(argument => !isUndefined(argument))) return unsupported("EventEmitter constructor options");
    const receiver = call.receiver as TESObject;
    if (receiver.type !== "object" || receiver.prototype !== prototype) return unsupported("EventEmitter calls without new or custom receivers");
    return [receiver, initialize(receiver, context)];
  }), {
    nonConstructible: false,
    unknownProperties: "Node EventEmitter static API",
    modeledInheritedProperties: ["call"],
    unmodeledPropertyWrites: ["prototype", "EventEmitter", "defaultMaxListeners", "captureRejections",
      "captureRejectionSymbol", "errorMonitor"],
    unmodeledOwnPropertyInspection: "Node EventEmitter constructor descriptors"
  });
  Object.assign(EventEmitter.properties, { prototype, EventEmitter });
  Object.assign(prototype.properties, { constructor: EventEmitter });
  return {
    module: EventEmitter,
    attach(target: TESObject, context: TExecutionContext, policy: EmitterPolicy = {}) {
      // Existing host objects keep their own partial prototype contract.
      return initialize(target, context, policy);
    },
    register(target: Any, name: string, listener: Any, once: boolean, context: TExecutionContext) {
      return withListener(listener, context, (selected, after) => register(target, name, selected, once, after));
    },
    emit(target: Any, name: string, args: Any[], context: TExecutionContext) {
      return emitEvent(target, name, args, context);
    }
  };
}
