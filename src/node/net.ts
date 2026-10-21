import { invoke, readMember } from "../ASTResolvers";
import { isESFunction } from "../Function/Function";
import { ESObject, TESObject, isESObject } from "../Object";
import { withKeyOrder } from "../Object/enumeration";
import { getObjectPrototype, prototypeOf } from "../Object/prototype";
import { ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal, mapCompletions } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { captureExecutionBoundary, markUnsupportedBoundaryObject, UnsupportedAnalysisError } from "../execution-context/analysis-failure";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getProperties, getPropertyKeys, ownPropertyPresence, writeProperty } from "../execution-context/Heap";
import { JobQueue } from "../jobs";
import { ExternalEvents } from "../external-events";
import { strictEquality } from "../symbolic";
import { ESString } from "../string/String";
import { Any, ESNumber, TESBoolean, isESBoolean, isESNull, isESNumber, isESString, isUndefined, ThrownValue, Undefined } from "../types";
import { createEventEmitterModel } from "./events";

export type NetModelOptions = {
  nextTick: JobQueue;
  submit?: HostModel;
  externalEvents?: ExternalEvents;
  completion?: HostModel;
};
// Fresh at the reached submission, never at API entry or mere observation.
export const symbolicTCPSubmission: HostModel = (_call, context) => [ESBoolean(), context];
// Callback flags are conservative independent facts, not an assertion that
// every combination is physically reachable on the admitted POSIX transport.
export const symbolicTCPCompletion: HostModel = (_call, context) =>
  [ESObject({ success: ESBoolean(), readable: ESBoolean(), writable: ESBoolean() }), context];

function unsupported(detail: string): never {
  throw new UnsupportedAnalysisError(`Node net analysis is not yet supported: ${detail}`);
}
function operation(name: string, model: HostModel) {
  return markUnsupportedBoundaryObject(Object.assign(createHostFunction(name, (call, context) =>
    captureExecutionBoundary(context, () => model(call, context))), {
    nonConstructible: false, unmodeledConstruct: "Node net operation construction",
    unknownProperties: "Node net function metadata", modeledInheritedProperties: ["call"],
    unmodeledPropertyWrites: ["call"], unmodeledOwnPropertyInspection: "Node net function descriptors"
  }));
}
function change(object: TESObject, fields: { [name: string]: Any }, context: TExecutionContext) {
  for (const name of Object.keys(fields)) context = writeProperty(object, name, fields[name], context);
  return context;
}
function canonicalIPv4(host: string) {
  return host.length <= 15 && /^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(host) &&
    host.split(".").every(part => Number(part) <= 255);
}

function requirePristineDefaults(context: TExecutionContext) {
  // Conditional intrinsic changes are conservatively outside this host domain.
  if (context.value.heap && context.value.heap.has(getObjectPrototype())) {
    unsupported("altered or conditional Object.prototype defaults");
  }
}
function durationErrorText(value: number) {
  const text = String(value);
  if (!Number.isInteger(value) || Math.abs(value) <= 2 ** 32) return text;
  // Node24's ERR_OUT_OF_RANGE groups the number's entire string in threes,
  // including exponent notation. This is error compatibility, not formatting
  // of a mathematical decimal expansion; number strings have bounded length.
  let end = text.length, suffix = "";
  const start = text[0] === "-" ? 1 : 0;
  for (; end >= start + 4; end -= 3) suffix = "_" + text.slice(end - 3, end) + suffix;
  return text.slice(0, end) + suffix;
}

/** A POSIX IPv4 socket prefix with optional bounded completion exploration; no native transport. */
export function createNetModel(events: ReturnType<typeof createEventEmitterModel>, options: NetModelOptions): { module: TESObject } {
  if (!options || !options.nextTick || typeof options.nextTick.enqueue !== "function") {
    throw new Error("Net next-tick environment must supply a job queue");
  }
  if (options.submit !== undefined && typeof options.submit !== "function") throw new Error("Net submission environment must be a model function");
  if (options.externalEvents !== undefined && (!options.externalEvents || typeof options.externalEvents.register !== "function")) {
    throw new Error("Net completion environment must supply an external-event registry");
  }
  if (options.completion !== undefined && typeof options.completion !== "function") throw new Error("Net completion environment must be a model function");
  if (options.completion !== undefined && !options.externalEvents) throw new Error("Net completion model requires an external-event registry");
  const nextTick = options.nextTick, submitModel = options.submit || symbolicTCPSubmission;
  const externalEvents = options.externalEvents, completionModel = options.completion || symbolicTCPCompletion;
  const sockets = new WeakMap<object, TESObject>();
  const timers = new WeakMap<object, TESObject>();
  const lifecycle = ["connectionAttempt", "connect", "ready", "error", "close", "connectionAttemptFailed"];
  const socketState = (socket: Any) => sockets.get(socket) || unsupported("receiver is not a socket from this environment");
  const submit = operation("net.socket.submit", (call, context) =>
    mapCompletions(submitModel(call, context), (result, after) => withValue(result, after, (selected, branch) => {
      if (!isESBoolean(selected)) throw new Error("Net submission model must return a Boolean value");
      return [selected, branch];
    })));
  const initiate = operation("net.socket.initiate", (call, context) => {
    const state = socketState(call.receiver);
    return withValue(getProperties(state, context).phase, context, (phase, branch) => {
      if (isESString(phase) && phase.value === "closing") return [Undefined, branch];
      if (!isESString(phase) || phase.value !== "queued") return unsupported("initiation requires queued state");
      const fields = getProperties(state, branch), args = [fields.address, fields.port, ESNumber(4)];
      const entering = writeProperty(state, "phase", ESString("initiating"), branch);
      return bindNormal(events.emit(call.receiver, "connectionAttempt", args, entering), (_ignored, emitted) =>
        bindNormal(invoke(submit, args, emitted, call.receiver), (outcome, after) => {
          if (!isESBoolean(outcome)) throw new Error("Net submission model must return a Boolean value");
          const retained = writeProperty(state, "submissionAccepted", outcome, after);
          return evaluateBranches(outcome, retained,
            accepted => {
              const pending = change(state, { phase: ESString("submitted"), completionPending: ESBoolean(true) }, accepted);
              return externalEvents ? externalEvents.register(ESObject({ eligible: completionEligible,
                deliver: complete, receiver: call.receiver }), pending) : [Undefined, pending];
            },
            rejected => {
              const stopped = writeProperty(state, "phase", ESString("submission-failed"), rejected);
              return captureExecutionBoundary(stopped, () => unsupported("immediate submission failure cleanup/error lifecycle"));
            });
        }));
    });
  });
  const cancelArm = (timer: TESObject, context: TExecutionContext): BranchResult =>
    withValue(getProperties(timer, context).arm, context, (arm, branch) => {
      if (isUndefined(arm)) return [Undefined, branch];
      if (!isESObject(arm)) throw new Error("Invalid internal net timeout arm");
      return [Undefined, writeProperty(arm, "active", ESBoolean(false), branch)];
    });
  const completionError = (): never => { throw new Error("Net completion model must return a closed Boolean record {success, readable, writable}"); };
  const completion = operation("net.socket.completion", (call, context) =>
    mapCompletions(completionModel(call, context), (result, after) => withValue(result, after, (record, branch) => {
      if (!isESObject(record) || record.ownPropertyModel !== "enumerable-data" || record.unknownProperties ||
          record.unmodeledOwnPropertyInspection || record.unmodeledPrototype || record.propertyAccess || record.wellKnownSymbols ||
          (record.unmodeledPropertyReads && record.unmodeledPropertyReads.length) || Object.getOwnPropertySymbols(record.properties).length) return completionError();
      const prototype = prototypeOf(record);
      if (prototype !== getObjectPrototype() && !isESNull(prototype)) return completionError();
      const properties = getProperties(record, branch);
      // Trusted model records still must honor their declared data-property
      // domain. Inspect descriptors without executing native getter values.
      for (const key of Reflect.ownKeys(properties)) {
        const descriptor = Object.getOwnPropertyDescriptor(properties, key)!;
        if (typeof key !== "string" || !descriptor.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value")) return completionError();
      }
      return withKeyOrder(getPropertyKeys(record, branch), branch, (orderedKeys, selected) => {
        const keys = Array.from(new Set([...orderedKeys, ...Object.keys(properties)]));
        const names = ["success", "readable", "writable"];
        const checkExtras = (index: number, current: TExecutionContext): BranchResult => {
          if (index === keys.length) return checkFields(0, current);
          return names.includes(keys[index]) ? checkExtras(index + 1, current) :
            evaluateBranches(ownPropertyPresence(record, keys[index], current), current,
              completionError, absent => checkExtras(index + 1, absent));
        };
        const checkFields = (index: number, current: TExecutionContext): BranchResult => {
          if (index === names.length) {
            const fields = getProperties(record, current);
            // Snapshot the three VM facts in a model-owned record. Boolean
            // identities remain shared with the returned environment record.
            return [ESObject({ success: fields.success, readable: fields.readable, writable: fields.writable }), current];
          }
          const name = names[index];
          return evaluateBranches(ownPropertyPresence(record, name, current), current, present => {
            const descriptor = Object.getOwnPropertyDescriptor(getProperties(record, present), name);
            if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value") || !descriptor.enumerable ||
                !isESBoolean(descriptor.value)) return completionError();
            return checkFields(index + 1, present);
          }, completionError);
        };
        return checkExtras(0, selected);
      });
    })));
  const eligibleCompletion = (socket: Any, context: TExecutionContext): BranchResult => {
    const fields = getProperties(socketState(socket), context);
    const checks = [strictEquality(fields.phase, ESString("submitted"), context.value.knowledge),
      strictEquality(fields.submissionAccepted, ESBoolean(true), context.value.knowledge),
      strictEquality(fields.completionPending, ESBoolean(true), context.value.knowledge),
      strictEquality(getProperties(socket as TESObject, context).destroyed, ESBoolean(false), context.value.knowledge)];
    const check = (index: number, current: TExecutionContext): BranchResult => index === checks.length
      ? [ESBoolean(true), current] : evaluateBranches(checks[index], current,
        yes => check(index + 1, yes), no => [ESBoolean(false), no]);
    return check(0, context);
  };
  const completionEligible = operation("net.socket.completionEligible", (call, context) => eligibleCompletion(call.receiver, context));
  const refreshTimer = (socket: Any, context: TExecutionContext): BranchResult => {
    const timer = timers.get(socket)!;
    return withValue(getProperties(timer, context).arm, context, (arm, branch) => {
      if (isUndefined(arm)) return [Undefined, branch];
      if (!isESObject(arm)) throw new Error("Invalid internal net timeout arm");
      const fields = getProperties(arm, branch);
      return evaluateBranches(fields.active as TESBoolean, branch, active => {
        const canceled = writeProperty(arm, "active", ESBoolean(false), active);
        const refreshed = ESObject({ active: ESBoolean(true), delay: fields.delay, refed: ESBoolean(false) });
        return [Undefined, writeProperty(timer, "arm", refreshed, canceled)];
      }, inactive => [Undefined, inactive]);
    });
  };
  const complete = operation("net.socket.complete", (call, context) =>
    bindNormal(eligibleCompletion(call.receiver, context), (eligible, checked) => evaluateBranches(eligible as TESBoolean, checked, pending => {
      const socket = call.receiver as TESObject, state = socketState(socket);
      requirePristineDefaults(pending);
      if (prototypeOf(socket) !== getObjectPrototype() || socket.propertyAccess || socket.unmodeledPrototype || socket.wellKnownSymbols) {
        return unsupported("completion requires the original socket property domain");
      }
      const endpoint = getProperties(state, pending);
      return bindNormal(invoke(completion, [endpoint.address, endpoint.port, ESNumber(4)], pending, socket), (outcome, delivered) => {
        const fields = getProperties(outcome as TESObject, delivered);
        const consumed = change(state, { completion: outcome, completionPending: ESBoolean(false) },
          writeProperty(socket, "connecting", ESBoolean(false), delivered));
        return evaluateBranches(fields.success as TESBoolean, consumed, success => {
          const connected = writeProperty(state, "phase", ESString("connected"), success);
          return evaluateBranches(fields.readable as TESBoolean, connected, readable =>
            evaluateBranches(fields.writable as TESBoolean, readable, writable =>
              bindNormal(refreshTimer(socket, writable), (_refreshed, refreshed) =>
                bindNormal(events.emit(socket, "connect", [], refreshed), (_connected, afterConnect) =>
                  bindNormal(events.emit(socket, "ready", [], afterConnect), (_ready, afterReady) =>
                    captureExecutionBoundary(afterReady, () => unsupported("socket read(0), pause inspection and read initiation after connection"))))),
              () => unsupported("partial writable completion requires socket end")),
            () => unsupported("partial readable completion requires socket push(null)/read"));
        }, failed => {
          const stopped = writeProperty(state, "phase", ESString("connection-failed"), failed);
          return captureExecutionBoundary(stopped, () => unsupported("connection completion failure Error construction and lifecycle"));
        });
      });
    }, () => unsupported("completion requires an admitted pending socket"))));
  const setTimeout = operation("net.socket.setTimeout", (call, context) => {
    if (call.args.length !== 1) return unsupported("setTimeout requires exactly one duration argument");
    const state = socketState(call.receiver), socket = call.receiver as TESObject;
    requirePristineDefaults(context);
    if (prototypeOf(socket) !== getObjectPrototype() || socket.propertyAccess || socket.unmodeledPrototype || socket.wellKnownSymbols) {
      return unsupported("setTimeout requires the original socket property domain");
    }
    return withValue(getProperties(state, context).phase, context, (phase, branch) => {
      if (!isESString(phase) || phase.value !== "queued") return unsupported("setTimeout requires a queued socket before initiation");
      return withValue(call.args[0], branch, (duration, selected) => {
        if (!isESNumber(duration) || typeof duration.value !== "number") return unsupported("setTimeout requires a concrete numeric duration");
        const number = duration.value;
        const invalid = number < 0 || !Number.isFinite(number);
        if (!invalid && (!Number.isInteger(number) || number > 2147483647)) {
          return unsupported("fractional and overflow timeout scheduling");
        }
        // Native setStreamTimeout assigns the public property before numeric
        // validation. A caught invalid duration must leave the old arm active.
        const assigned = writeProperty(socket, "timeout", duration, selected);
        if (invalid) {
          const error = createError("RangeError", ESString(`The value of "msecs" is out of range. It must be a non-negative finite number. Received ${durationErrorText(number)}`));
          error.properties.code = ESString("ERR_OUT_OF_RANGE");
          return [ThrownValue(error), assigned];
        }
        const timer = timers.get(socket)!;
        return bindNormal(cancelArm(timer, assigned), (_ignored, cleared) => {
          if (number === 0) return [socket, cleared];
          // Each arm is an abstract scheduling occurrence. Native Timeout
          // objects may be reused; no timestamp or elapsed time is inferred.
          const arm = ESObject({ active: ESBoolean(true), delay: duration, refed: ESBoolean(false) });
          return [socket, writeProperty(timer, "arm", arm, cleared)];
        });
      });
    });
  });
  const destroy = operation("net.socket.destroy", (call, context) => {
    if (call.args.length !== 0) return unsupported("destroy requires no arguments");
    const state = socketState(call.receiver);
    return withValue(getProperties(state, context).phase, context, (phase, branch) => {
      if (!isESString(phase) || phase.value !== "queued") return unsupported("destroy requires a queued socket before initiation");
      return bindNormal(cancelArm(timers.get(call.receiver)!, branch), (_ignored, cleared) => {
        const closing = change(state, { phase: ESString("closing"), completionPending: ESBoolean(false), closePending: ESBoolean(true) }, cleared);
        return [call.receiver, change(call.receiver as TESObject, { connecting: ESBoolean(false), destroyed: ESBoolean(true) }, closing)];
      });
    });
  });
  const create = (address: Any, port: Any, callback: Any, context: TExecutionContext): BranchResult => {
    const socket = markUnsupportedBoundaryObject(Object.assign(ESObject({ connecting: ESBoolean(true), destroyed: ESBoolean(false), destroy, setTimeout, timeout: Undefined }), {
      unknownProperties: "Node net Socket API", unmodeledOwnPropertyInspection: "Node net Socket descriptors",
      unmodeledPropertyWrites: ["connecting", "destroyed", "destroy", "setTimeout", "timeout"]
    }));
    const state = ESObject(), timer = ESObject({ arm: Undefined });
    sockets.set(socket, state);
    timers.set(socket, timer);
    socket.hostSlots = Object.freeze({ "node.net.socket": state, "node.net.timeout": timer });
    const attached = events.attach(socket, context, { allowedRegistrations: lifecycle, restrictedEvents: lifecycle });
    const initialized = change(state, { phase: ESString("queued"), address, port, submissionAccepted: Undefined,
      completionPending: ESBoolean(false), closePending: ESBoolean(false), completion: Undefined }, attached);
    const registered: BranchResult = isUndefined(callback) ? [socket, initialized] : events.register(socket, "connect", callback, true, initialized);
    return bindNormal(registered, (_ignored, ready) => bindNormal(nextTick.enqueue(initiate, [], ready, socket), (_job, queued) => [socket, queued]));
  };
  const endpoint = (object: TESObject, callback: Any, context: TExecutionContext): BranchResult =>
    bindNormal(readMember(object, "host", context), (host, afterHost) => withValue(host, afterHost, (address, branch) => {
      // Node validates a nonempty host string before the numeric port, but
      // routes a hostname through DNS only after valid port admission.
      if (!isESString(address) || typeof address.value !== "string" || !address.value || address.value.includes("\0")) {
        return unsupported("host requires a concrete nonempty non-NUL string");
      }
      return bindNormal(readMember(object, "port", branch), (port, afterPort) => withValue(port, afterPort, (number, selected) => {
        if (!isESNumber(number) || typeof number.value !== "number") return unsupported("port requires a concrete number");
        if (!Number.isInteger(number.value) || number.value < 0 || number.value > 65535) {
          const error = createError("RangeError", ESString(`Port should be >= 0 and < 65536. Received type number (${number.value}).`));
          error.properties.code = ESString("ERR_SOCKET_BAD_PORT");
          return [ThrownValue(error), selected];
        }
        if (!canonicalIPv4(address.value as string)) return unsupported("only canonical IPv4 endpoints are modeled");
        return create(address, ESNumber(number.value === 0 ? 0 : number.value), callback, selected);
      }));
    }));
  const admitOptions = (value: Any, callback: Any, branch: TExecutionContext): BranchResult => {
    if (!isESObject(value) || value.ownPropertyModel !== "enumerable-data" || value.unknownProperties ||
        value.unmodeledOwnPropertyInspection || value.unmodeledPrototype || value.propertyAccess ||
        (value.unmodeledPropertyReads && value.unmodeledPropertyReads.length) || value.wellKnownSymbols ||
        Object.getOwnPropertySymbols(value.properties).length) return unsupported("options require closed enumerable data properties");
    requirePristineDefaults(branch);
    return withValue(prototypeOf(value), branch, (prototype, afterPrototype) => {
      if (!isESNull(prototype) && prototype !== getObjectPrototype()) return unsupported("options prototype requires ordinary or null prototype");
      return withKeyOrder(getPropertyKeys(value, afterPrototype), afterPrototype, (keys, afterKeys) => {
        const inspect = (index: number, current: TExecutionContext): BranchResult => {
          if (index === keys.length) return evaluateBranches(ownPropertyPresence(value, "host", current), current,
            hostPresent => evaluateBranches(ownPropertyPresence(value, "port", hostPresent), hostPresent,
              ready => endpoint(value, callback, ready), () => unsupported("missing own port")), () => unsupported("missing own host"));
          const key = keys[index];
          if (key === "host" || key === "port") return inspect(index + 1, current);
          return evaluateBranches(ownPropertyPresence(value, key, current), current,
            () => unsupported("additional connect options"), absent => inspect(index + 1, absent));
        };
        return inspect(0, afterKeys);
      });
    });
  };
  const connect = operation("net.connect", (call, context) => {
    if (call.args.length < 1 || call.args.length > 3) return unsupported("connect requires options or an explicit port and host");
    return withValue(call.args[0], context, (first, branch) => {
      const positional = isESNumber(first);
      if (positional ? call.args.length < 2 : call.args.length > 2) return unsupported("connect requires options or an explicit port and host");
      return withValue(call.args[positional ? 2 : 1] || Undefined, branch, (callback, ready) => {
        if (!isUndefined(callback) && !isESFunction(callback)) return unsupported("connect callback requires a function");
        // Normalize only inside this model; the public call retains its original
        // arguments/origin and creates no synthetic second net.connect effect.
        return admitOptions(positional ? ESObject({ port: first, host: call.args[1] }) : first, callback, ready);
      });
    });
  });
  return { module: markUnsupportedBoundaryObject(Object.assign(ESObject({ connect, createConnection: connect }, "unmodeled"), {
    unknownProperties: "Node net module API", unmodeledOwnPropertyInspection: "Node net module descriptors"
  })) };
}
