import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { createHostFunction, effectContext, effectPaths } from "../src/effects";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { evaluateBranches } from "../src/execution-context/branches";
import { getProperties, writeProperty } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { ESString } from "../src/string/String";
import { compareNumbers, resolveBoolean, selectValue, strictEquality } from "../src/symbolic";
import {
  Any, ESNull, ESNumber, isESNumber, isESString, isThrownValue, isUndefined, TESBoolean,
  ThrownValue, Undefined
} from "../src/types";
import { Array as ESArray } from "../src/array/Array";
import { assertPinnedNode } from "./commonjs/oracle";

// This exact handler is exercised through real Express below and directly in
// Prophet as a stepping stone. Direct execution is not Express analysis.
const discountHandlerSource = `
  function saveDiscount(req, res) {
    const percentage = req.body.percentage;
    if (!(typeof percentage === "number" && percentage >= 0 && percentage <= 100)) {
      res.statusCode = 400;
      res.end("Invalid discount");
      return;
    }
    const normalized = percentage / 100;
    fs.writeFileSync(discountPath, String(normalized), "utf8");
    res.statusCode = 204;
    res.end();
  }
`;

const discountAppSource = `
  ${discountHandlerSource}
  const app = express();
  app.use(express.json());
  app.post("/discount", saveDiscount);
  app.use(function(error, req, res, next) {
    res.statusCode = error.status === 400 ? 400 : 500;
    res.end(error.status === 400 ? "Invalid JSON" : "Unable to save discount");
  });
`;

// This reference runs the published Express package and Node's real HTTP/fs
// implementations in an isolated temporary directory. The write observer is a
// passthrough: errors, file changes, and return values come from actual Node.
const nodeServerReference = `
  const fs = require("fs");
  const http = require("http");
  const os = require("os");
  const path = require("path");
  const express = require(process.argv[1]);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prophet-discount-"));
  const failWrite = process.argv[3] === "fail";
  const discountPath = path.join(directory, failWrite ? "missing/discount.txt" : "discount.txt");
  const trace = [];
  const originalWriteFileSync = fs.writeFileSync;
  let server;

  (async function() {
    try {
      if (!failWrite) fs.writeFileSync(discountPath, "previous discount", "utf8");
      fs.writeFileSync = function(filename, data, options) {
        if (filename === discountPath) trace.push({ kind: "write", data: data, encoding: options });
        try {
          const result = originalWriteFileSync.apply(this, arguments);
          if (filename === discountPath) trace.push({ kind: "write-return" });
          return result;
        } catch (error) {
          if (filename === discountPath) trace.push({ kind: "write-throw", code: error.code });
          throw error;
        }
      };
      ${discountAppSource}
      server = http.createServer(function(req, res) {
        res.once("finish", function() { trace.push({ kind: "response", status: res.statusCode }); });
        app(req, res);
      });
      await new Promise(function(resolve, reject) {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const response = await new Promise(function(resolve, reject) {
        const body = process.argv[2];
        const request = http.request({
          hostname: "127.0.0.1", port: server.address().port, path: "/discount", method: "POST",
          headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
        }, function(response) {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", function(chunk) { body += chunk; });
          response.on("end", function() { resolve({ status: response.statusCode, body: body }); });
          response.on("error", reject);
        });
        request.on("error", reject);
        request.end(body);
      });
      const contents = fs.existsSync(discountPath) ? fs.readFileSync(discountPath, "utf8") : null;
      process.stdout.write(JSON.stringify({ response: response, trace: trace, contents: contents }));
    } finally {
      fs.writeFileSync = originalWriteFileSync;
      if (server) await new Promise(function(resolve) { server.close(resolve); });
      fs.rmSync(directory, { recursive: true, force: true });
    }
  })().catch(function(error) { console.error(error); process.exitCode = 1; });
`;

interface ServerObservation {
  response: { status: number; body: string };
  trace: Array<{ kind: string; data?: string; encoding?: string; code?: string; status?: number }>;
  contents: string | null;
}

function runRealServer(body: string, failWrite = false): ServerObservation {
  assertPinnedNode();
  expect(require("express/package.json").version).toBe("4.22.1");
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath, [
    "--no-global-search-paths", "-e", nodeServerReference, require.resolve("express"), body,
    failWrite ? "fail" : "success"
  ], {
    encoding: "utf8", timeout: 10000,
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"]
  }));
}

describe("later integration reference: the actual Express discount endpoint on pinned Node", () => {
  beforeAll(assertPinnedNode);

  for (const percentage of [0, 5e-324, 25, 100]) {
    test(`saves ${percentage}% once before sending its 204 response`, () => {
      const saved = String(percentage / 100);
      const actual = runRealServer(JSON.stringify({ percentage }));
      expect(actual).toEqual({
        response: { status: 204, body: "" }, contents: saved,
        trace: [
          { kind: "write", data: saved, encoding: "utf8" },
          { kind: "write-return" },
          { kind: "response", status: 204 }
        ]
      });
      expect(concreteHandlerObservation(ESNumber(percentage))).toEqual(actual);
    });
  }

  // HTTP JSON inputs include non-numbers. NaN/infinities are tested by direct
  // symbolic handler execution because they have no JSON number representation.
  for (const percentage of [-1, 100.00000000000001, "25", null, false, {}, []]) {
    test(`rejects ${JSON.stringify(percentage)} without attempting a write`, () => {
      const actual = runRealServer(JSON.stringify({ percentage }));
      expect(actual).toEqual({
        response: { status: 400, body: "Invalid discount" }, contents: "previous discount",
        trace: [{ kind: "response", status: 400 }]
      });
      const value = typeof percentage === "number" ? ESNumber(percentage)
        : typeof percentage === "string" ? ESString(percentage)
        : typeof percentage === "boolean" ? ESBoolean(percentage)
        : percentage === null ? ESNull : Array.isArray(percentage) ? ESArray([]) : ESObject();
      expect(concreteHandlerObservation(value)).toEqual(actual);
    });
  }

  test("rejects a missing percentage without attempting a write", () => {
    const actual = runRealServer("{}");
    expect(actual).toEqual({
      response: { status: 400, body: "Invalid discount" }, contents: "previous discount",
      trace: [{ kind: "response", status: 400 }]
    });
    expect(concreteHandlerObservation(Undefined)).toEqual(actual);
  });

  test("Express rejects malformed JSON before the handler can write", () => {
    expect(runRealServer('{"percentage":')).toEqual({
      response: { status: 400, body: "Invalid JSON" }, contents: "previous discount",
      trace: [{ kind: "response", status: 400 }]
    });
  });

  test("a real ENOENT write failure becomes 500 without a success response", () => {
    const actual = runRealServer('{"percentage":25}', true);
    expect(actual).toEqual({
      response: { status: 500, body: "Unable to save discount" }, contents: null,
      trace: [
        { kind: "write", data: "0.25", encoding: "utf8" },
        { kind: "write-throw", code: "ENOENT" },
        { kind: "response", status: 500 }
      ]
    });
    const direct = concreteHandlerObservation(ESNumber(25), true);
    expect(direct.contents).toEqual(actual.contents);
    // Prophet runs the handler directly. Express's subsequent 500 response is
    // concrete reference coverage only; the interpreted handler stops at throw.
    expect(direct.trace).toEqual(actual.trace.slice(0, -1));
    expect(direct.response).toEqual({ status: 200, body: "" });
  });
});

// A deliberately restricted host boundary, not a complete Node fs or HTTP
// implementation. The file model accepts this fixed string path and UTF-8
// string payload. The environment is either an existing file with a successful
// write, or a missing parent/file whose write throws ENOENT before modification.
// Undefined contents represent absence. Other write failures can leave partial
// changes and are not covered by this contract. Response end succeeds here.
function analyzeDiscount(
  input: Any, fails = ESBoolean(),
  previous: Any = selectValue(fails, Undefined, ESString("previous discount"))
) {
  const file = ESObject({ contents: previous });
  const response = { ...ESObject({ statusCode: ESNumber(200), ended: ESBoolean(false) }),
    unknownProperties: "restricted HTTP response API" };
  const writeFailure = { ...ESObject({ code: ESString("ENOENT") }),
    unknownProperties: "restricted fs.writeFileSync error fields" };
  const filesystem = { ...ESObject(), unknownProperties: "restricted Node fs API" };
  filesystem.properties.writeFileSync = createHostFunction("fs.writeFileSync", (call, current) => {
    expect(call.receiver).toBe(filesystem);
    expect(call.args).toHaveLength(3);
    expect(call.args[0]).toMatchObject({ type: "string", value: "/data/discount.txt" });
    expect(call.args[2]).toMatchObject({ type: "string", value: "utf8" });
    expect(isESString(call.args[1])).toBe(true);
    return evaluateBranches(fails, current,
      failed => [ThrownValue(writeFailure), failed],
      saved => [Undefined, writeProperty(file, "contents", call.args[1], saved)]);
  });
  response.properties.end = createHostFunction("http.end", (call, current) => {
    expect(call.receiver).toBe(response);
    expect(resolveBoolean(getProperties(response, current).ended as TESBoolean,
      current.value.knowledge)).toBe(false);
    return [response, writeProperty(response, "ended", ESBoolean(true), current)];
  });
  const [completion, context] = evaluateCode(`
    ${discountHandlerSource}
    let failed = false;
    let correctError = true;
    try { saveDiscount(req, res); }
    catch (error) { failed = true; correctError = error === writeFailure; }
    const accepted = typeof input === "number" && input >= 0 && input <= 100;
    const responseCorrect = accepted
      ? (fails
        ? failed && !res.ended && res.statusCode === 200
        : !failed && res.ended && res.statusCode === 204)
      : !failed && res.ended && res.statusCode === 400;
    const invalidPreservesFile = accepted || file.contents === previous;
    const failurePreservesFile = !failed || file.contents === previous;
  `, setVariablesInScope(nodeInitialExecutionContext, {
    input, fails, file, previous, writeFailure,
    req: { ...ESObject({ body: ESObject({ percentage: input }) }),
      unknownProperties: "restricted HTTP request API" },
    res: response, fs: filesystem, discountPath: ESString("/data/discount.txt")
  }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  for (const proof of ["correctError", "responseCorrect", "invalidPreservesFile", "failurePreservesFile"]) {
    expect(context.value.scope[proof]).toMatchObject({ value: true });
  }
  return { context, input, fails, file, previous, response, writeFailure };
}

function concreteHandlerObservation(input: Any, failWrite = false): ServerObservation {
  const { context, file, response } = analyzeDiscount(input, ESBoolean(failWrite),
    failWrite ? Undefined : ESString("previous discount"));
  const paths = effectPaths(context.value.effects!);
  expect(paths).toHaveLength(1);
  const trace: ServerObservation["trace"] = [];
  let body = "";
  for (const event of paths[0].events) {
    if (event.call.operation === "fs.writeFileSync") {
      if (event.kind === "call") {
        const data = event.call.args[1];
        if (!isESString(data) || typeof data.value !== "string") throw new Error("Expected concrete data");
        const encoding = event.call.args[2];
        if (!isESString(encoding) || typeof encoding.value !== "string") throw new Error("Expected concrete encoding");
        trace.push({ kind: "write", data: data.value, encoding: encoding.value });
      } else if (event.kind === "throw") {
        if (!isESObject(event.value)) throw new Error("Expected modeled filesystem error");
        const code = getProperties(event.value, effectContext(event, context)).code;
        if (!isESString(code) || typeof code.value !== "string") throw new Error("Expected concrete error code");
        trace.push({ kind: "write-throw", code: code.value });
      } else trace.push({ kind: "write-return" });
    } else if (event.kind === "call") {
      const snapshot = effectContext(event, context);
      const status = getProperties(response, snapshot).statusCode;
      if (!isESNumber(status) || status.value === undefined) throw new Error("Expected concrete status");
      trace.push({ kind: "response", status: status.value });
      if (event.call.args.length) {
        const data = event.call.args[0];
        if (!isESString(data) || typeof data.value !== "string") throw new Error("Expected concrete response");
        body = data.value;
      }
    }
  }
  const status = getProperties(response, context).statusCode;
  if (!isESNumber(status) || status.value === undefined) throw new Error("Expected concrete status");
  const contents = getProperties(file, context).contents;
  if (!isUndefined(contents) && (!isESString(contents) || typeof contents.value !== "string")) {
    throw new Error("Expected concrete file contents or absence");
  }
  return {
    response: { status: status.value, body }, trace,
    contents: isESString(contents) && typeof contents.value === "string" ? contents.value : null
  };
}

describe("stepping stone: Prophet evaluates the same handler with explicit host models", () => {
  test("every JavaScript number is rejected without writing, saved before 204, or propagates a write failure", () => {
    // No finite-number assumption: the symbolic input includes NaN, both
    // infinities, and every finite Number. The file may succeed or fail.
    const { context, fails, file, response, previous, writeFailure } = analyzeDiscount(ESNumber());
    expect(context.value.scope.accepted).toMatchObject({ value: undefined });
    expect(context.value.scope.failed).toMatchObject({ value: undefined });
    const outcomes = new Set<string>();
    for (const path of effectPaths(context.value.effects!)) {
      const accepted = resolveBoolean(context.value.scope.accepted as TESBoolean, path.knowledge);
      expect(accepted).not.toBeUndefined();
      const names = path.events.map(event => event.call.operation + ":" + event.kind);
      if (!accepted) {
        outcomes.add("invalid");
        expect(names).toEqual(["http.end:call", "http.end:return"]);
        expect(path.events[0].call.args).toHaveLength(1);
        expect(path.events[0].call.args[0]).toMatchObject({ type: "string", value: "Invalid discount" });
        const beforeResponse = effectContext(path.events[0], context);
        expect(getProperties(response, beforeResponse).statusCode).toMatchObject({ value: 400 });
        expect(getProperties(file, beforeResponse).contents).toBe(previous);
        // A host failure matters only if the handler actually attempts a write.
        expect(resolveBoolean(fails, path.knowledge)).toBeUndefined();
        continue;
      }
      const write = path.events[0];
      const data = write.call.args[1];
      expect(isESString(data)).toBe(true);
      if (!isESString(data)) throw new Error("Expected the actual string passed to fs.writeFileSync");
      const expression = data.expression;
      if (!expression || expression.kind !== "unary" || expression.operator !== "ToString" ||
          !isESNumber(expression.operand)) throw new Error("Expected numeric string conversion");
      // The serialized payload comes from the computed number. Its bounds are
      // established from the executed guard, not assumed by the file model.
      expect(compareNumbers(expression.operand, ESNumber(0), ">=", write.knowledge)).toMatchObject({ value: true });
      expect(compareNumbers(expression.operand, ESNumber(1), "<=", write.knowledge)).toMatchObject({ value: true });
      expect(strictEquality(expression.operand, ESNumber(0.5), write.knowledge)).toMatchObject({ value: undefined });
      if (resolveBoolean(fails, path.knowledge)) {
        outcomes.add("write failure");
        expect(names).toEqual(["fs.writeFileSync:call", "fs.writeFileSync:throw"]);
        const thrown = path.events[1];
        if (thrown.kind !== "throw") throw new Error("Expected a recorded write failure");
        expect(thrown.value).toBe(writeFailure);
        expect(getProperties(file, effectContext(path.events[1], context)).contents).toBe(previous);
        expect(strictEquality(getProperties(file, effectContext(path.events[1], context)).contents,
          Undefined, path.knowledge)).toMatchObject({ value: true });
      } else {
        outcomes.add("saved");
        expect(names).toEqual([
          "fs.writeFileSync:call", "fs.writeFileSync:return", "http.end:call", "http.end:return"
        ]);
        const beforeResponse = effectContext(path.events[2], context);
        expect(getProperties(response, beforeResponse).statusCode).toMatchObject({ value: 204 });
        expect(strictEquality(getProperties(file, beforeResponse).contents, data, path.knowledge))
          .toMatchObject({ value: true });
        expect(path.events[2].call.args).toHaveLength(0);
      }
    }
    expect(Array.from(outcomes).sort()).toEqual(["invalid", "saved", "write failure"]);
  });

  for (const [label, input] of [
    ["unknown string", ESString()], ["unknown Boolean", ESBoolean()], ["null", ESNull],
    ["undefined", Undefined], ["object", ESObject()], ["array", ESArray([])]
  ] as Array<[string, Any]>) {
    test(`rejects ${label} before any filesystem operation`, () => {
      const { context } = analyzeDiscount(input);
      expect(context.value.scope.accepted).toMatchObject({ value: false });
      expect(context.value.scope.failed).toMatchObject({ value: false });
      const paths = effectPaths(context.value.effects!);
      expect(paths).toHaveLength(1);
      expect(paths[0].events.map(event => event.call.operation + ":" + event.kind))
        .toEqual(["http.end:call", "http.end:return"]);
    });
  }
});
