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
import { ESString } from "../string/String";
import { Any, ESNumber, isESBoolean, isESNull, isESNumber, isESString, isUndefined, ThrownValue, Undefined } from "../types";
import { createEventEmitterModel } from "./events";

export type NetModelOptions = { nextTick: JobQueue; submit?: HostModel };
// Fresh at the reached submission, never at API entry or mere observation.
export const symbolicTCPSubmission: HostModel = (_call, context) => [ESBoolean(), context];

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

/** A pending POSIX IPv4 socket prefix; no native transport or completion provider. */
export function createNetModel(events: ReturnType<typeof createEventEmitterModel>, options: NetModelOptions): { module: TESObject } {
  if (!options || !options.nextTick || typeof options.nextTick.enqueue !== "function") {
    throw new Error("Net next-tick environment must supply a job queue");
  }
  if (options.submit !== undefined && typeof options.submit !== "function") throw new Error("Net submission environment must be a model function");
  const nextTick = options.nextTick, submitModel = options.submit || symbolicTCPSubmission;
  const sockets = new WeakMap<object, TESObject>();
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
            accepted => [Undefined, change(state, { phase: ESString("submitted"), completionPending: ESBoolean(true) }, accepted)],
            rejected => {
              const stopped = writeProperty(state, "phase", ESString("submission-failed"), rejected);
              return captureExecutionBoundary(stopped, () => unsupported("immediate submission failure cleanup/error lifecycle"));
            });
        }));
    });
  });
  const destroy = operation("net.socket.destroy", (call, context) => {
    if (call.args.length !== 0) return unsupported("destroy requires no arguments");
    const state = socketState(call.receiver);
    return withValue(getProperties(state, context).phase, context, (phase, branch) => {
      if (!isESString(phase) || phase.value !== "queued") return unsupported("destroy requires a queued socket before initiation");
      const closing = change(state, { phase: ESString("closing"), completionPending: ESBoolean(false), closePending: ESBoolean(true) }, branch);
      return [call.receiver, change(call.receiver as TESObject, { connecting: ESBoolean(false), destroyed: ESBoolean(true) }, closing)];
    });
  });
  const create = (address: Any, port: Any, callback: Any, context: TExecutionContext): BranchResult => {
    const socket = markUnsupportedBoundaryObject(Object.assign(ESObject({ connecting: ESBoolean(true), destroyed: ESBoolean(false), destroy }), {
      unknownProperties: "Node net Socket API", unmodeledOwnPropertyInspection: "Node net Socket descriptors",
      unmodeledPropertyWrites: ["connecting", "destroyed", "destroy"]
    }));
    const state = ESObject();
    sockets.set(socket, state);
    socket.hostSlots = Object.freeze({ "node.net.socket": state });
    const attached = events.attach(socket, context, { allowedRegistrations: lifecycle, restrictedEvents: lifecycle });
    const initialized = change(state, { phase: ESString("queued"), address, port, submissionAccepted: Undefined,
      completionPending: ESBoolean(false), closePending: ESBoolean(false) }, attached);
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
  const connect = operation("net.connect", (call, context) => {
    if (call.args.length < 1 || call.args.length > 2) return unsupported("connect requires options and an optional callback");
    return withValue(call.args[1] || Undefined, context, (callback, afterCallback) => {
      if (!isUndefined(callback) && !isESFunction(callback)) return unsupported("connect callback requires a function");
      return withValue(call.args[0], afterCallback, (value, branch) => {
        if (!isESObject(value) || value.ownPropertyModel !== "enumerable-data" || value.unknownProperties ||
            value.unmodeledOwnPropertyInspection || value.unmodeledPrototype || value.propertyAccess ||
            (value.unmodeledPropertyReads && value.unmodeledPropertyReads.length) || value.wellKnownSymbols ||
            Object.getOwnPropertySymbols(value.properties).length) return unsupported("options require closed enumerable data properties");
        const intrinsic = getObjectPrototype();
        // Conservatively reject the entire conditional prototype domain too:
        // a joined heap record is not evidence that inherited defaults are absent.
        if (branch.value.heap && branch.value.heap.has(intrinsic)) return unsupported("altered or conditional Object.prototype defaults");
        return withValue(prototypeOf(value), branch, (prototype, afterPrototype) => {
          if (!isESNull(prototype) && prototype !== intrinsic) return unsupported("options prototype requires ordinary or null prototype");
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
      });
    });
  });
  return { module: markUnsupportedBoundaryObject(Object.assign(ESObject({ connect, createConnection: connect }, "unmodeled"), {
    unknownProperties: "Node net module API", unmodeledOwnPropertyInspection: "Node net module descriptors"
  })) };
}
