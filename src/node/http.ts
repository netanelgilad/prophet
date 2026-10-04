import { invoke, readMember } from "../ASTResolvers";
import { isESFunction } from "../Function/Function";
import { getFunctionPrototype } from "../Function/prototype";
import { ESObject, TESObject } from "../Object";
import { getObjectPrototype } from "../Object/prototype";
import { coerceToBoolean, ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { ESString, TESString } from "../string/String";
import { resolveBoolean, strictEquality } from "../symbolic";
import { Any, ESNumber, ESNull, TESBoolean, isESNumber, isESNull, isESString, isUndefined,
  ThrownValue, Undefined } from "../types";
import { createEventEmitterModel } from "./events";
import { withHTTPChunk, appendHTTPChunk, consumeHTTPBody } from "./http-body";
import { createHTTPStatusCodes } from "./http-status-codes";
import { headerError, invalidHeaderText, serializeResponseHeaders, withHeaderText } from "./http-headers";

export type HTTPModelOptions = {
  // A bind attempt returns null on success or the Error later emitted by Node.
  // The supplied transition must model the environment, never bind a real port.
  bind?: HostModel;
};

function unsupported(detail: string): never {
  throw new Error(`HTTP analysis is not yet supported: ${detail}`);
}

function operation(name: string, model: HostModel) {
  return Object.assign(createHostFunction(name, model), {
    // Node's JS methods have their own construction/metadata semantics. Do not
    // accidentally inherit our generic builtin's non-constructor TypeError.
    nonConstructible: false,
    unmodeledConstruct: "HTTP operation construction is not yet supported",
    unknownProperties: "Node HTTP function metadata",
    unmodeledOwnPropertyInspection: "Node HTTP function descriptors"
  });
}

function change(object: TESObject, properties: { [name: string]: Any }, context: TExecutionContext) {
  let result = context;
  for (const name of Object.keys(properties)) result = writeProperty(object, name, properties[name], result);
  return result;
}

/**
 * Explicit Node HTTP boundary for one declared successful transport schedule.
 * No native HTTP object, socket, timer, or callback queue runs during analysis.
 * In the primary process, omitted-host binding is attempted during listen;
 * success/error notification is deferred. Explicit-host binding runs on delivery.
 * The embedding chooses when those events and already-dispatched request events
 * arrive. Wire dispatch (for example CONNECT/upgrade) is not modeled. Binding
 * outcomes come from the supplied environment. Cluster workers, overlapping
 * pending retries and other schedules need compatible models.
 * The body schedule queues writes until synchronous end consumes all bytes;
 * Buffer mutations before end remain visible, and finish is delivered later.
 * Other flush times, partial transport/failure and callbacks are not modeled.
 * A normal write's Boolean result stays unknown without socket capacity facts.
 */
export function createHTTPModel(events = createEventEmitterModel(), options: HTTPModelOptions = {}) {
  if (options.bind !== undefined && typeof options.bind !== "function") {
    throw new Error("HTTP bind environment must be a model function");
  }
  // Omission preserves the explicitly successful-bind domain of older embeddings.
  // The CLI supplies a symbolic transition instead of assuming availability.
  const bind = operation("http.server.bind", options.bind === undefined
    ? ((_call, context) => [ESNull, context]) : options.bind);
  // Node's default-reason lookup closes over this original table. Entry writes
  // remain visible, while replacing the module export does not replace it.
  const statusCodes = createHTTPStatusCodes();
  const unsupportedServerEvents = ["connection", "close", "drop", "checkContinue",
    "checkExpectation", "clientError", "connect", "upgrade", "timeout"];
  const serverEvents = { restrictedEvents: ["listening", "request", "error", ...unsupportedServerEvents],
    unsupportedRegistrations: unsupportedServerEvents, internalListenerCounts: { listening: 1 } };
  const unsupportedResponseEvents = ["prefinish", "close", "error", "drain", "pipe", "unpipe", "timeout"];
  const responseEvents = { restrictedEvents: ["finish", ...unsupportedResponseEvents],
    unsupportedRegistrations: unsupportedResponseEvents, internalListenerCounts: { finish: 1 } };
  // These maps contain immutable resource identities only. All registration and
  // lifecycle state is in the persistent VM heap, never mutable host closures.
  const servers = new WeakMap<object, TESObject>();
  const responses = new WeakMap<object, TESObject>();

  const serverState = (server: Any) => {
    const state = servers.get(server);
    if (!state) return unsupported("receiver is not a server from this HTTP environment");
    return state;
  };
  const responseState = (response: Any) => {
    const state = responses.get(response);
    if (!state) return unsupported("receiver is not a response from this HTTP environment");
    return state;
  };
  const requireState = (state: TESObject, expected: string, context: TExecutionContext) => {
    if (resolveBoolean(strictEquality(getProperties(state, context).phase || Undefined,
      ESString(expected), context.value.knowledge), context.value.knowledge) !== true) {
      unsupported(`delivery requires the known '${expected}' state`);
    }
  };

  const retainOutcome = (server: Any, pending: TESObject, outcome: Any, context: TExecutionContext): BranchResult =>
    withValue(outcome, context, (selected, branch) => {
      if (!isESNull(selected) && !(selected as { errorData?: boolean }).errorData) {
        return unsupported("bind environment must return null or an Error value");
      }
      const bound = ESBoolean(isESNull(selected));
      const retained = writeProperty(pending, "outcome", selected, branch);
      const current = writeProperty(serverState(server), "bound", bound, retained);
      return [server, writeProperty(server as TESObject, "listening", bound, current)];
    });

  const listen = operation("http.server.listen", (call, context) => {
    const state = serverState(call.receiver);
    const failure = (name: "Error" | "RangeError", code: string, message: string,
      branch: TExecutionContext): BranchResult => {
      const error = createError(name, ESString(message));
      error.properties.code = ESString(code);
      return [ThrownValue(error), branch];
    };
    const start = (args: Any[], branch: TExecutionContext): BranchResult => {
      const port = args[0];
      const explicitHost = args.length >= 2 && isESString(args[1]) && args[1].value === "127.0.0.1";
      const callback = args[explicitHost ? 2 : 1] || Undefined;
      if (!port || !isESNumber(port) || typeof port.value !== "number") {
        return unsupported("listen requires a concrete numeric port; unknown numbers and other port forms");
      }
      const portNumber = port.value;
      if (args.length > (explicitHost ? 3 : 2) ||
          (!isUndefined(callback) && !isESFunction(callback)) ||
          (!explicitHost && args.length > 1 && !isESFunction(args[1]))) {
        return unsupported("listen overloads other than (port[, callback]) or (port, '127.0.0.1'[, callback])");
      }
      // Node builds ordinary normalized options. Inherited options can alter
      // binding, even when this public call supplies only a numeric port.
      const defaults = getProperties(getObjectPrototype(), branch);
      if (["host", "_handle", "handle", "fd", "backlog", "reusePort", "exclusive", "ipv6Only", "signal", "blockList"]
        .some(name => Object.prototype.hasOwnProperty.call(defaults, name))) {
        return unsupported("inherited listen options on Object.prototype");
      }
      const validate = (after: TExecutionContext): BranchResult => {
        if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) {
          return failure("RangeError", "ERR_SOCKET_BAD_PORT",
            `options.port should be >= 0 and < 65536. Received type number (${portNumber}).`, after);
        }
        const port = ESNumber(portNumber | 0), host = explicitHost ? args[1] : Undefined;
        const pending = ESObject({ port, host, outcome: Undefined, delivered: ESBoolean(false) });
        const starting = change(state, { phase: ESString("starting"), bound: ESBoolean(false),
          port, host, pending }, after);
        // Hostless Node attempts binding inline; explicit-host lookup is deferred.
        if (explicitHost) return [call.receiver, starting];
        return bindNormal(invoke(bind, [port, host], starting, call.receiver), (outcome, current) =>
          retainOutcome(call.receiver, pending, outcome, current));
      };
      const afterRegistration = (after: TExecutionContext): BranchResult => {
        if (isUndefined(callback)) return validate(after);
        // net.listen also attempts Number(callback) as a possible backlog.
        // Ordinary functions convert to NaN. Custom conversion can execute
        // arbitrary code; do not erase those effects until it is modeled.
        return bindNormal(readMember(callback, "valueOf", after), (valueOf, afterValueOf) =>
          bindNormal(readMember(callback, "toString", afterValueOf), (toString, afterToString) => {
            if (valueOf !== getObjectPrototype().properties.valueOf ||
                toString !== getFunctionPrototype().properties.toString) {
              return unsupported("custom listen callback backlog conversion");
            }
            return validate(afterToString);
          }));
      };
      // Registration precedes port validation. A callback from a failed call
      // stays registered and can run after a later successful retry.
      return isUndefined(callback) ? afterRegistration(branch) :
        bindNormal(events.register(call.receiver, "listening", callback, true, branch),
          (_value, after) => afterRegistration(after));
    };
    // Node checks an existing handle before registering another callback or
    // validating its port. Pending explicit-host lookup has no handle yet.
    const bound = getProperties(state, context).bound;
    if (!bound) return unsupported("server state is not initialized in this context");
    return evaluateBranches(bound as TESBoolean, context,
      branch => failure("Error", "ERR_SERVER_ALREADY_LISTEN", "Listen method has been called more than once without closing.", branch),
      branch => {
        requireState(state, "created", branch);
        const select = (index: number, args: Any[], current: TExecutionContext): BranchResult =>
          index === call.args.length ? start(args, current) :
            withValue(call.args[index], current, (value, after) => select(index + 1, args.concat(value), after));
        return select(0, [], branch);
      });
  });

  const writeHead = operation("http.response.writeHead", (call, context) => {
    const state = responseState(call.receiver);
    return evaluateBranches(getProperties(state, context).headerStored as TESBoolean, context,
      branch => {
        const error = createError("Error", ESString("Cannot write headers after they are sent to the client"));
        error.properties.code = ESString("ERR_HTTP_HEADERS_SENT");
        return [ThrownValue(error), branch];
      }, branch => {
        requireState(state, "open", branch);
        return withValue(call.args[0] || Undefined, branch, (status, afterStatus) => {
          if (!isESNumber(status) || typeof status.value !== "number") {
            return unsupported("symbolic or nonnumeric statusCode conversion");
          }
          const code = status.value | 0;
          if (code < 100 || code > 999) {
            const error = createError("RangeError", ESString(`Invalid status code: ${status.value}`));
            error.properties.code = ESString("ERR_HTTP_INVALID_STATUS_CODE");
            return [ThrownValue(error), afterStatus];
          }
          if (code < 200) return unsupported("informational response completion");
          const commit = (message: Any, headers: Any, current: TExecutionContext): BranchResult => {
            // These public assignments precede reason/header validation and
            // must survive a catchable error even though no header is stored.
            const assigned = change(call.receiver as TESObject, {
              statusCode: ESNumber(code), statusMessage: message
            }, current);
            return withHeaderText(message, assigned, (text, afterMessage) => {
              if (invalidHeaderText(text)) return headerError("ERR_INVALID_CHAR", "Invalid character in statusMessage", afterMessage);
              // Node only ever clears _hasBody; a 204/304 header failure still
              // suppresses a later retry's body. Invalid reason fails earlier.
              const beforeHeaders = code === 204 || code === 304
                ? change(state, { bodySuppressed: ESBoolean(true) }, afterMessage) : afterMessage;
              return bindNormal(serializeResponseHeaders(headers, beforeHeaders), (serialized, afterHeaders) => {
                const committed = change(state, { headerStored: ESBoolean(true), statusCode: ESNumber(code),
                  statusMessage: ESString(text), headers: serialized }, afterHeaders);
                return [call.receiver, change(call.receiver as TESObject, { headersSent: ESBoolean(true) }, committed)];
              });
            });
          };
          return withValue(call.args[1] || Undefined, afterStatus, (reason, afterReason) => {
            const third = call.args[2] || Undefined;
            if (isESString(reason)) return commit(reason, third, afterReason);
            return withValue(third, afterReason, (last, afterThird) => {
              const headers = isUndefined(last) || isESNull(last) ? reason : last;
              return bindNormal(readMember(call.receiver, "statusMessage", afterThird), (existing, afterExisting) =>
                evaluateBranches(coerceToBoolean(existing, afterExisting.value.knowledge), afterExisting,
                  leaf => commit(existing, headers, leaf),
                  leaf => bindNormal(readMember(statusCodes, String(code), leaf), (fallback, afterFallback) =>
                    evaluateBranches(coerceToBoolean(fallback, afterFallback.value.knowledge), afterFallback,
                      found => commit(fallback, headers, found),
                      missing => commit(ESString("unknown"), headers, missing)))));
            });
          });
        });
      });
  });

  const withHeaders = (response: TESObject, context: TExecutionContext,
    continuation: (context: TExecutionContext) => BranchResult): BranchResult =>
    evaluateBranches(getProperties(responseState(response), context).headerStored as TESBoolean, context,
      continuation, branch => bindNormal(invoke(writeHead,
        [getProperties(response, branch).statusCode], branch, response), (_value, after) => continuation(after)));

  const queueChunk = (response: TESObject, chunk: Any, context: TExecutionContext,
    continuation: (suppressed: boolean, context: TExecutionContext) => BranchResult): BranchResult => {
    const state = responseState(response);
    const properties = getProperties(state, context);
    const ignored = (branch: TExecutionContext) => continuation(true, branch);
    return evaluateBranches(properties.bodySuppressed as TESBoolean, context, ignored,
      branch => evaluateBranches(properties.head as TESBoolean, branch, ignored,
        after => continuation(false, change(state, {
          chunks: appendHTTPChunk(getProperties(state, after).chunks, chunk)
        }, after))));
  };

  const write = operation("http.response.write", (call, context) => {
    const response = call.receiver as TESObject;
    const state = responseState(response);
    if (call.args.length > 1) return unsupported("write encoding/callback overloads");
    // Invalid chunks synchronously throw even after end. A valid post-end
    // write instead schedules an error, which requires a later queue model.
    return withHTTPChunk(call.args[0] || Undefined, context, (chunk, branch) => {
      requireState(state, "open", branch);
      return withHeaders(response, branch, after => queueChunk(response, chunk, after,
        (suppressed, queued) => [suppressed ? ESBoolean(true) : ESBoolean(), queued]));
    });
  });

  const end = operation("http.response.end", (call, context) => {
    const response = call.receiver as TESObject;
    const state = responseState(response);
    if (call.args.length > 1) return unsupported("end encoding/callback overloads");
    const finishBody = (current: TExecutionContext): BranchResult =>
      consumeHTTPBody(getProperties(state, current).chunks, current, (body, bodyBytes, consumed) => {
        const ended = change(state, { phase: ESString("ended"), body, bodyBytes }, consumed);
        return [response, change(response, { writableEnded: ESBoolean(true) }, ended)];
      });
    return withValue(call.args[0] || Undefined, context, (data, branch) => {
      if (isESFunction(data)) return unsupported("end callback overload");
      // Node only validates a truthy payload. Empty repeated end returns the
      // response, while truthy repeated end needs deferred error delivery.
      return evaluateBranches(coerceToBoolean(data, branch.value.knowledge), branch,
        present => {
          requireState(state, "open", present);
          return withHTTPChunk(data, present, (chunk, valid) => withHeaders(response, valid,
            after => queueChunk(response, chunk, after, (_suppressed, queued) => finishBody(queued))));
        }, absent => withValue(getProperties(state, absent).phase, absent, (phase, selected) => {
          if (isESString(phase) && ["ended", "finished"].includes(phase.value as string)) return [response, selected];
          requireState(state, "open", selected);
          return withHeaders(response, selected, finishBody);
        }));
    });
  });

  const createServer = operation("http.createServer", (call, context) => {
    if (call.args.length > 1) return unsupported("createServer options overloads");
    return withValue(call.args[0] || Undefined, context, (listener, branch) => {
      if (!isESFunction(listener) && !isUndefined(listener)) return unsupported("createServer options and non-function listeners");
      const server = Object.assign(ESObject({ listening: ESBoolean(false), listen }), {
        unknownProperties: "Node HTTP server API",
        unmodeledOwnPropertyInspection: "Node HTTP server descriptors",
        unmodeledPropertyWrites: ["listening"]
      });
      const state = ESObject();
      servers.set(server, state);
      server.hostSlots = Object.freeze({ "node.http.server": state });
      const created = change(state, { phase: ESString("created"), bound: ESBoolean(false), pending: Undefined }, events.attach(server, branch, serverEvents));
      return isUndefined(listener) ? [server, created] : events.register(server, "request", listener, false, created);
    });
  });

  // Event delivery is also an explicit traced host transition. It goes through
  // the same invocation/completion machinery as calls made by application code.
  const listening = operation("http.server.listening", (call, context) => withValue(call.args[0], context, (server, branch) => {
    const state = serverState(server);
    requireState(state, "starting", branch);
    const pending = call.args[1] as TESObject;
    const consumed = writeProperty(pending, "delivered", ESBoolean(true), branch);
    const ready = change(server as TESObject, { listening: ESBoolean(true) },
      change(state, { phase: ESString("listening"), bound: ESBoolean(true), pending: Undefined }, consumed));
    return bindNormal(events.emit(server, "listening", [], ready), (_value, after) => [server, after]);
  }));

  const listenError = operation("http.server.error", (call, context) => withValue(call.args[0], context, (server, branch) => {
    const state = serverState(server);
    requireState(state, "starting", branch);
    const pending = call.args[2] as TESObject;
    const consumed = writeProperty(pending, "delivered", ESBoolean(true), branch);
    // A failed handle is gone before error notification. A listener may retry;
    // earlier once-listening callbacks remain registered for that later success.
    const failed = change(server as TESObject, { listening: ESBoolean(false) },
      change(state, { phase: ESString("created"), bound: ESBoolean(false), pending: Undefined }, consumed));
    return bindNormal(events.emit(server, "error", [call.args[1]], failed), (_value, after) => [server, after]);
  }));

  const completeListen = (server: Any, context: TExecutionContext): BranchResult =>
    withValue(server, context, (target, branch) => {
      const state = serverState(target);
      requireState(state, "starting", branch);
      return withValue(getProperties(state, branch).pending, branch, (pendingValue, current) => {
        const pending = pendingValue as TESObject;
        const deliver = (ready: TExecutionContext): BranchResult =>
          withValue(getProperties(pending, ready).outcome, ready, (outcome, leaf) =>
            isESNull(outcome) ? invoke(listening, [target, pending], leaf) : invoke(listenError, [target, outcome, pending], leaf));
        return withValue(getProperties(pending, current).outcome, current, (outcome, selected) => {
          if (!isUndefined(outcome)) return deliver(selected);
          const fields = getProperties(pending, selected);
          return bindNormal(invoke(bind, [fields.port, fields.host], selected, target), (value, afterBind) =>
            bindNormal(retainOutcome(target, pending, value, afterBind), (_value, retained) => deliver(retained)));
        });
      });
    });

  const requestEvent = operation("http.server.request", (call, context) => withValue(call.args[0], context, (server, branch) => {
    const state = serverState(server);
    requireState(state, "listening", branch);
    const response = call.args[2] as TESObject;
    const current = change(responseState(response), { phase: ESString("open") }, branch);
    // The listener retains its normal lexical environment identity. Invocation
    // uses THIS context, including changes since it was registered.
    return bindNormal(events.emit(server, "request", [call.args[1], response], current), (_ignored, after) => [Undefined, after]);
  }));

  const finish = operation("http.response.finish", (call, context) => withValue(call.args[0], context, (response, branch) => {
    const state = responseState(response);
    requireState(state, "ended", branch);
    const completed = change(response as TESObject, { writableFinished: ESBoolean(true) },
      change(state, { phase: ESString("finished") }, branch));
    return bindNormal(events.emit(response, "finish", [], completed), (_ignored, after) => [response, after]);
  }));

  return {
    module: Object.assign(ESObject({ createServer, STATUS_CODES: statusCodes }), { unknownProperties: "Node HTTP module API" }),
    eventsModule: events.module,
    completeListen,
    deliverRequest(server: Any, input: { method: TESString; url: TESString }, context: TExecutionContext) {
      if (!isESString(input.method) || !isESString(input.url)) unsupported("request method and URL must be strings");
      const request = Object.assign(ESObject({ method: input.method, url: input.url }), {
        unknownProperties: "Node HTTP incoming request API"
      });
      const response = Object.assign(ESObject({ statusCode: ESNumber(200), statusMessage: Undefined,
        writableEnded: ESBoolean(false), writableFinished: ESBoolean(false),
        headersSent: ESBoolean(false), writeHead, write, end
      }), {
        unknownProperties: "Node HTTP response API",
        unmodeledOwnPropertyInspection: "Node HTTP response descriptors",
        unmodeledPropertyWrites: ["writableEnded", "writableFinished", "headersSent", "writeHead"]
      });
      const state = ESObject({ head: strictEquality(input.method, ESString("HEAD"), context.value.knowledge),
        body: Undefined, bodyBytes: Undefined, chunks: ESNull, statusCode: Undefined, statusMessage: Undefined, headers: Undefined,
        headerStored: ESBoolean(false), bodySuppressed: ESBoolean(false) });
      responses.set(response, state);
      const initialized = events.attach(response, context, responseEvents);
      return { request, response, result: invoke(requestEvent, [server, request, response], initialized) };
    },
    completeResponse(response: Any, context: TExecutionContext): BranchResult {
      return invoke(finish, [response], context);
    },
    // Read-only embedding projection of consumed bytes; Undefined before end,
    // an unknown array for open text, or a conditional/concrete numeric array.
    inspectResponseBytes(response: Any, context: TExecutionContext): Any {
      return getProperties(responseState(response), context).bodyBytes;
    },
    inspectResponse(response: Any, context: TExecutionContext): { body: Any; statusCode: Any; statusMessage: Any; headers: Any } {
      const properties = getProperties(responseState(response), context);
      return { body: properties.body, statusCode: properties.statusCode,
        statusMessage: properties.statusMessage, headers: properties.headers };
    }
  };
}
