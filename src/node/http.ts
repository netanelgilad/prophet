import { invoke } from "../ASTResolvers";
import { isESFunction } from "../Function/Function";
import { ESObject, TESObject } from "../Object";
import { ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction, HostModel } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult } from "../execution-context/branches";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { ESString, TESString } from "../string/String";
import { resolveBoolean, selectValue, strictEquality } from "../symbolic";
import { Any, ESNumber, isESNumber, isESNull, isESString, isUndefined,
  ThrownValue, Undefined } from "../types";

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
 * The embedding chooses when listening and response completion succeed and when
 * a parsed request arrives. Other outcomes need additional compatible models.
 */
export function createHTTPModel() {
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

  const listen = operation("http.server.listen", (call, context) => {
    const state = serverState(call.receiver);
    // This overload does deferred host lookup before binding even for loopback.
    // Port assignment/address and the other overloads remain explicit gaps.
    if (call.args.length < 2 || call.args.length > 3 ||
        !isESNumber(call.args[0]) || call.args[0].value !== 0 ||
        !isESString(call.args[1]) || call.args[1].value !== "127.0.0.1" ||
        (call.args.length === 3 && !isESFunction(call.args[2]))) {
      unsupported("listen requires (0, '127.0.0.1'[, callback])");
    }
    requireState(state, "created", context);
    return [call.receiver, change(state, {
      phase: ESString("starting"), onListening: call.args[2] || Undefined
    }, context)];
  });

  const end = operation("http.response.end", (call, context) => {
    const state = responseState(call.receiver);
    requireState(state, "open", context);
    if (call.args.length > 1) unsupported("end encoding/callback overloads");
    return withValue(call.args[0] || Undefined, context, (data, branch) => {
      if (!isESString(data) && !isUndefined(data) && !isESNull(data)) {
        return unsupported("end requires a string, null, or undefined");
      }
      return withValue(getProperties(call.receiver as TESObject, branch).statusCode, branch, (status, afterStatus) => {
        if (!isESNumber(status) || typeof status.value !== "number") {
          return unsupported("symbolic or nonnumeric statusCode conversion");
        }
        // Node writeHead applies ToInt32 before validating the status range.
        const code = status.value | 0;
        if (code < 100 || code > 999) {
          const error = createError("RangeError", ESString(`Invalid status code: ${status.value}`));
          error.properties.code = ESString("ERR_HTTP_INVALID_STATUS_CODE");
          return [ThrownValue(error), afterStatus];
        }
        if (code < 200) return unsupported("informational response completion");
        const head = getProperties(state, afterStatus).head;
        // Inspect decoded UTF-8 output, not the original JS code units. In
        // particular a lone surrogate is replaced on the wire. An unknown
        // string stays unknown without the unsound claim that it is unchanged.
        const payload = !isESString(data) ? ESString("") : typeof data.value === "string"
          ? ESString(Buffer.from(data.value, "utf8").toString("utf8")) : ESString();
        const wireStatus = ESNumber(code);
        const body = code === 204 || code === 304 ? ESString("") :
          selectValue(head as ReturnType<typeof ESBoolean>, ESString(""), payload, afterStatus.value.knowledge);
        const written = change(state, {
          phase: ESString("ended"), body, statusCode: wireStatus
        }, afterStatus);
        return [call.receiver, change(call.receiver as TESObject, {
          statusCode: wireStatus, headersSent: ESBoolean(true), writableEnded: ESBoolean(true)
        }, written)];
      });
    });
  });

  const createServer = operation("http.createServer", (call, context) => {
    if (call.args.length !== 1) return unsupported("createServer requires one request listener");
    return withValue(call.args[0], context, (listener, branch) => {
      if (!isESFunction(listener)) return unsupported("createServer options and non-function listeners");
      const server = Object.assign(ESObject({ listening: ESBoolean(false), listen }), {
        unknownProperties: "Node HTTP server API",
        unmodeledOwnPropertyInspection: "Node HTTP server descriptors",
        unmodeledPropertyWrites: ["listening"]
      });
      const state = ESObject();
      servers.set(server, state);
      return [server, change(state, { phase: ESString("created"), listener }, branch)];
    });
  });

  // Event delivery is also an explicit traced host transition. It goes through
  // the same invocation/completion machinery as calls made by application code.
  const listening = operation("http.server.listening", (call, context) => withValue(call.args[0], context, (server, branch) => {
    const state = serverState(server);
    requireState(state, "starting", branch);
    const callback = getProperties(state, branch).onListening;
    const ready = change(server as TESObject, { listening: ESBoolean(true) },
      change(state, { phase: ESString("listening") }, branch));
    return isUndefined(callback) ? [server, ready] :
      bindNormal(invoke(callback, [], ready, server), (_value, after) => [server, after]);
  }));

  const requestEvent = operation("http.server.request", (call, context) => withValue(call.args[0], context, (server, branch) => {
    const state = serverState(server);
    requireState(state, "listening", branch);
    const response = call.args[2] as TESObject;
    const current = change(responseState(response), { phase: ESString("open") }, branch);
    // The listener retains its normal lexical environment identity. Invocation
    // uses THIS context, including changes since it was registered.
    return bindNormal(invoke(getProperties(state, current).listener,
      [call.args[1], response], current, server), (_ignored, after) => [Undefined, after]);
  }));

  const finish = operation("http.response.finish", (call, context) => withValue(call.args[0], context, (response, branch) => {
    const state = responseState(response);
    requireState(state, "ended", branch);
    return [response, change(response as TESObject, { writableFinished: ESBoolean(true) },
      change(state, { phase: ESString("finished") }, branch))];
  }));

  return {
    module: Object.assign(ESObject({ createServer }), { unknownProperties: "Node HTTP module API" }),
    completeListen(server: Any, context: TExecutionContext): BranchResult {
      return invoke(listening, [server], context);
    },
    deliverRequest(server: Any, input: { method: TESString; url: TESString }, context: TExecutionContext) {
      if (!isESString(input.method) || !isESString(input.url)) unsupported("request method and URL must be strings");
      const request = Object.assign(ESObject({ method: input.method, url: input.url }), {
        unknownProperties: "Node HTTP incoming request API"
      });
      const response = Object.assign(ESObject({ statusCode: ESNumber(200),
        writableEnded: ESBoolean(false), writableFinished: ESBoolean(false),
        headersSent: ESBoolean(false), end
      }), {
        unknownProperties: "Node HTTP response API",
        unmodeledOwnPropertyInspection: "Node HTTP response descriptors",
        unmodeledPropertyWrites: ["writableEnded", "writableFinished", "headersSent"]
      });
      const state = ESObject({ head: strictEquality(input.method, ESString("HEAD"), context.value.knowledge),
        body: Undefined, statusCode: Undefined });
      responses.set(response, state);
      return { request, response, result: invoke(requestEvent, [server, request, response], context) };
    },
    completeResponse(response: Any, context: TExecutionContext): BranchResult {
      return invoke(finish, [response], context);
    },
    inspectResponse(response: Any, context: TExecutionContext): { body: Any; statusCode: Any } {
      const properties = getProperties(responseState(response), context);
      return { body: properties.body, statusCode: properties.statusCode };
    }
  };
}
