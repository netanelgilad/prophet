// Use the public bootstrap order before individual VM constructors.
import "../index";
import { createHash } from "crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "fs";
import { resolve, sep } from "path";
import { ESBoolean } from "../boolean/ESBoolean";
import { ESString, TESString } from "../string/String";
import { selectValue } from "../symbolic";
import { Any, TESBoolean } from "../types";

// Bounded authoring limits. These are rejected input domains, not execution
// budgets and not a narrowing of an accepted environment.
const MAX_FILE_BYTES = 262144;
const MAX_JSON_DEPTH = 32;
const MAX_VALUE_NODES = 4096;
const MAX_REF_EDGES = 4096;
const MAX_NAMED = 256;
const MAX_LITERAL_BYTES = 65536;
const MAX_STRING_BYTES = 16384;
const MAX_HEADERS = 64;
const MAX_HEADER_NAME_BYTES = 255;
const MAX_HEADER_VALUE_BYTES = 8192;
const MAX_TOTAL_WORK = 4096;
const MAX_ROOT_DEPTH = 32;
const MAX_METHOD_URL_WORK = 1024;
const SATURATE = 1e9;
const RESERVED_NAMES = ["__proto__", "constructor", "prototype"];

export type IncomingRequestInput = {
  method: TESString;
  url: TESString;
  headers?: Record<string, string>;
};

export type EnvironmentState = {
  values: ReadonlyMap<string, Any>;
  requests: Record<string, unknown> | undefined;
  provenance: { path: string; version: number; sha256: string };
};

export type Environment = {
  state: EnvironmentState;
  filesystem: { descriptorAvailable?: TESBoolean; emptyPathBeforeOpenDescriptorCheck?: TESBoolean };
  requestInput?: () => IncomingRequestInput;
};

type ValueKind = "boolean" | "string";
type Expr =
  | { kind: "literal"; type: "boolean" | "string"; value: boolean | string }
  | { kind: "symbolic"; type: "boolean" | "string" }
  | { kind: "ref"; name: string }
  | { kind: "select"; type?: ValueKind; condition: Expr; then: Expr; else: Expr };

function fail(detail: string): never {
  throw new Error(`Environment input is not supported: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value);
}

function validName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && RESERVED_NAMES.indexOf(name) === -1;
}

/** Bounded, strict JSON parse with duplicate-key and nesting limits. */
function parseJson(text: string): unknown {
  let index = 0;
  let depth = 0;
  const failJson = (message: string): never => fail(`JSON ${message}`);
  const skipWhitespace = () => {
    while (index < text.length) {
      const ch = text[index];
      if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") index += 1;
      else break;
    }
  };
  const parseValue = (): unknown => {
    skipWhitespace();
    if (index >= text.length) failJson("unexpected end");
    const ch = text[index];
    if (ch === "{") return parseObject();
    if (ch === "[") return parseArray();
    if (ch === '"') return parseString();
    if (text.startsWith("true", index)) { index += 4; return true; }
    if (text.startsWith("false", index)) { index += 5; return false; }
    if (text.startsWith("null", index)) { index += 4; return null; }
    return parseNumber();
  };
  const enter = () => { if (++depth > MAX_JSON_DEPTH) failJson("nesting too deep"); };
  const leave = () => { depth -= 1; };
  const parseObject = (): Record<string, unknown> => {
    enter();
    index += 1;
    const result: Record<string, unknown> = Object.create(null);
    skipWhitespace();
    if (text[index] === "}") { index += 1; leave(); return result; }
    for (;;) {
      skipWhitespace();
      if (text[index] !== '"') failJson("expected object key");
      const key = parseString();
      skipWhitespace();
      if (text[index] !== ":") failJson("expected colon");
      index += 1;
      const value = parseValue();
      if (Object.prototype.hasOwnProperty.call(result, key)) failJson(`duplicate key ${JSON.stringify(key)}`);
      result[key] = value;
      skipWhitespace();
      if (text[index] === ",") { index += 1; continue; }
      if (text[index] === "}") { index += 1; break; }
      failJson("expected , or }");
    }
    leave();
    return result;
  };
  const parseArray = (): unknown[] => {
    enter();
    index += 1;
    const result: unknown[] = [];
    skipWhitespace();
    if (text[index] === "]") { index += 1; leave(); return result; }
    for (;;) {
      result.push(parseValue());
      skipWhitespace();
      if (text[index] === ",") { index += 1; continue; }
      if (text[index] === "]") { index += 1; break; }
      failJson("expected , or ]");
    }
    leave();
    return result;
  };
  const parseString = (): string => {
    index += 1;
    let result = "";
    for (;;) {
      if (index >= text.length) failJson("unterminated string");
      const ch = text[index];
      if (ch === '"') { index += 1; break; }
      if (ch === "\\") {
        index += 1;
        if (index >= text.length) failJson("unterminated escape");
        const escape = text[index];
        index += 1;
        switch (escape) {
          case '"': result += '"'; break;
          case "\\": result += "\\"; break;
          case "/": result += "/"; break;
          case "b": result += "\b"; break;
          case "f": result += "\f"; break;
          case "n": result += "\n"; break;
          case "r": result += "\r"; break;
          case "t": result += "\t"; break;
          case "u": {
            if (index + 4 > text.length) failJson("invalid unicode escape");
            const hex = text.slice(index, index + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) failJson("invalid unicode escape");
            result += String.fromCharCode(parseInt(hex, 16));
            index += 4;
            break;
          }
          default: failJson("invalid escape");
        }
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) failJson("unescaped control character");
      result += ch;
      index += 1;
    }
    if (Buffer.byteLength(result, "utf8") > MAX_STRING_BYTES) failJson("string too long");
    return result;
  };
  const parseNumber = (): number => {
    const rest = text.slice(index);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(rest);
    if (!match || match[0].length === 0) return failJson("invalid number");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) failJson("invalid number");
    return value;
  };
  const value = parseValue();
  skipWhitespace();
  if (index !== text.length) failJson("trailing content");
  return value;
}

/** Bounded read: lstat gate, opening fstat allocation gate, capped reads, close. */
function readEnvironmentFile(path: string): { bytes: Buffer; sha256: string } {
  if (sep !== "/") fail("platform");
  let stat;
  try { stat = lstatSync(path); } catch (_error) { fail(`cannot read ${path}`); }
  if (!stat.isFile()) fail("not a regular file");
  if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > MAX_FILE_BYTES) fail("size");
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  } catch (_error) { fail(`cannot open ${path}`); }
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile()) fail("not a regular file after open");
    if (!Number.isSafeInteger(opened.size) || opened.size < 0 || opened.size > MAX_FILE_BYTES) fail("size after open");
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size ||
        opened.mtimeMs !== stat.mtimeMs || opened.mode !== stat.mode) fail("metadata changed before read");
    const capacity = opened.size + 1;
    const buffer = Buffer.alloc(capacity);
    let used = 0;
    while (used < capacity) {
      const count = readSync(fd, buffer, used, capacity - used, used);
      if (count === 0) break;
      used += count;
    }
    if (used !== opened.size) fail("short or long read");
    const closed = fstatSync(fd);
    if (closed.dev !== stat.dev || closed.ino !== stat.ino || closed.size !== stat.size ||
        closed.mtimeMs !== stat.mtimeMs || closed.mode !== stat.mode) fail("metadata changed during read");
    const bytes = buffer.slice(0, used);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) fail("invalid UTF-8");
    return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  } finally {
    closeSync(fd);
  }
}

function parseExpr(value: unknown, label: string): Expr {
  if (typeof value === "boolean") return { kind: "literal", type: "boolean", value };
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES) fail(`${label} string too long`);
    return { kind: "literal", type: "string", value };
  }
  if (!isRecord(value)) fail(`${label} must be a Boolean, string or expression object`);
  const keys = ownKeys(value);
  if (keys.length !== 1) fail(`${label} expression must have exactly one key`);
  const kind = keys[0];
  const body = value[kind];
  if (kind === "symbolic") {
    if (body !== "boolean" && body !== "string") fail(`${label} symbolic type`);
    return { kind: "symbolic", type: body };
  }
  if (kind === "ref") {
    if (typeof body !== "string") fail(`${label} ref name must be a string`);
    return { kind: "ref", name: body };
  }
  if (kind === "select") {
    if (!isRecord(body)) fail(`${label} select body`);
    const bodyKeys = ownKeys(body);
    if (bodyKeys.length !== 3 || bodyKeys.indexOf("condition") === -1 ||
        bodyKeys.indexOf("then") === -1 || bodyKeys.indexOf("else") === -1) fail(`${label} select keys`);
    const condition = parseExpr(body.condition, `${label} select condition`);
    const then = parseExpr(body.then, `${label} select then`);
    const alternate = parseExpr(body.else, `${label} select else`);
    // Reference types are resolved only after all definitions are collected.
    return { kind: "select", condition, then, else: alternate };
  }
  fail(`${label} unknown expression kind`);
}

function countExpr(expr: Expr): { nodes: number; refs: number; literalBytes: number } {
  if (expr.kind === "literal") {
    return { nodes: 1, refs: 0, literalBytes: expr.type === "string" ? Buffer.byteLength(expr.value as string, "utf8") : 0 };
  }
  if (expr.kind === "symbolic") return { nodes: 1, refs: 0, literalBytes: 0 };
  if (expr.kind === "ref") return { nodes: 1, refs: 1, literalBytes: 0 };
  const condition = countExpr(expr.condition);
  const then = countExpr(expr.then);
  const alternate = countExpr(expr.else);
  return {
    nodes: 1 + condition.nodes + then.nodes + alternate.nodes,
    refs: condition.refs + then.refs + alternate.refs,
    literalBytes: condition.literalBytes + then.literalBytes + alternate.literalBytes
  };
}

const saturating = (value: number): number => Math.min(value, SATURATE);

/**
 * Parse and validate one environment file. Validation and materialization
 * complete before the target is observed. Every named definition and both
 * select branches are validated even when a guard is concrete.
 */
export function parseEnvironment(options: { path: string; cwd: string }): Environment {
  const resolved = resolve(options.cwd, options.path);
  const { bytes, sha256 } = readEnvironmentFile(resolved);
  const root = parseJson(bytes.toString("utf8"));
  if (!isRecord(root)) fail("root must be an object");
  if (!Object.prototype.hasOwnProperty.call(root, "version")) fail("version required");
  if (root.version !== 1) fail("unsupported version");
  const topKeys = ownKeys(root);
  for (const key of topKeys) {
    if (["version", "values", "filesystem", "http"].indexOf(key) === -1) fail(`unknown top-level key ${key}`);
  }

  // Collect and validate all named definitions first so forward refs resolve.
  const names = new Map<string, Expr>();
  const valuesSection = root.values === undefined ? undefined : root.values;
  if (valuesSection !== undefined) {
    if (!isRecord(valuesSection)) fail("values must be an object");
    const keys = ownKeys(valuesSection);
    if (keys.length > MAX_NAMED) fail("too many named values");
    for (const name of keys) {
      if (!validName(name)) fail(`invalid value name ${JSON.stringify(name)}`);
      names.set(name, parseExpr(valuesSection[name], `values.${name}`));
    }
  }

  const filesystemSection = root.filesystem === undefined ? undefined : root.filesystem;
  let descriptorAvailable: Expr | undefined;
  let emptyPathBeforeOpenDescriptorCheck: Expr | undefined;
  if (filesystemSection !== undefined) {
    if (!isRecord(filesystemSection)) fail("filesystem must be an object");
    const keys = ownKeys(filesystemSection);
    for (const key of keys) {
      if (key !== "descriptorAvailable" && key !== "emptyPathBeforeOpenDescriptorCheck") {
        fail(`unknown filesystem key ${key}`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(filesystemSection, "descriptorAvailable")) {
      descriptorAvailable = parseExpr(filesystemSection.descriptorAvailable, "filesystem.descriptorAvailable");
    }
    if (Object.prototype.hasOwnProperty.call(filesystemSection, "emptyPathBeforeOpenDescriptorCheck")) {
      emptyPathBeforeOpenDescriptorCheck = parseExpr(filesystemSection.emptyPathBeforeOpenDescriptorCheck, "filesystem.emptyPathBeforeOpenDescriptorCheck");
    }
  }

  const httpSection = root.http === undefined ? undefined : root.http;
  let requestTemplate: { method: Expr; url: Expr; headers: Record<string, string> } | undefined;
  if (httpSection !== undefined) {
    if (!isRecord(httpSection)) fail("http must be an object");
    const keys = ownKeys(httpSection);
    for (const key of keys) if (key !== "requests") fail(`unknown http key ${key}`);
    const requests = httpSection.requests;
    if (requests !== undefined) {
      if (!isRecord(requests)) fail("http.requests must be an object");
      const requestKeys = ownKeys(requests);
      for (const key of requestKeys) {
        if (key !== "method" && key !== "url" && key !== "headers") fail(`unknown http.requests key ${key}`);
      }
      if (!Object.prototype.hasOwnProperty.call(requests, "method")) fail("http.requests.method required");
      if (!Object.prototype.hasOwnProperty.call(requests, "url")) fail("http.requests.url required");
      const headers: Record<string, string> = Object.create(null);
      const headerSection = requests.headers;
      if (headerSection !== undefined) {
        if (!isRecord(headerSection)) fail("http.requests.headers must be an object");
        const headerNames = ownKeys(headerSection);
        if (headerNames.length > MAX_HEADERS) fail("too many headers");
        for (const name of headerNames) {
          if (name !== name.toLowerCase() || !/^[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(name)) fail(`invalid header name ${JSON.stringify(name)}`);
          if (Buffer.byteLength(name, "utf8") > MAX_HEADER_NAME_BYTES) fail("header name too long");
          const value = headerSection[name];
          if (typeof value !== "string") fail("header value must be a string");
          if (Buffer.byteLength(value, "utf8") > MAX_HEADER_VALUE_BYTES) fail("header value too long");
          headers[name] = value;
        }
      }
      requestTemplate = {
        method: parseExpr(requests.method, "http.requests.method"),
        url: parseExpr(requests.url, "http.requests.url"),
        headers
      };
    }
  }

  // Validate every definition and both select branches, then bound syntactic
  // size and expanded weight/depth before constructing any VM value.
  const roots: Array<{ label: string; expr: Expr; expected?: ValueKind }> = [];
  for (const name of names.keys()) roots.push({ label: `values.${name}`, expr: names.get(name)! });
  if (descriptorAvailable !== undefined) roots.push({ label: "filesystem.descriptorAvailable", expr: descriptorAvailable, expected: "boolean" });
  if (emptyPathBeforeOpenDescriptorCheck !== undefined) roots.push({ label: "filesystem.emptyPathBeforeOpenDescriptorCheck", expr: emptyPathBeforeOpenDescriptorCheck, expected: "boolean" });
  if (requestTemplate !== undefined) {
    roots.push({ label: "http.requests.method", expr: requestTemplate.method, expected: "string" });
    roots.push({ label: "http.requests.url", expr: requestTemplate.url, expected: "string" });
  }

  let totalNodes = 0;
  let totalRefs = 0;
  let totalLiteralBytes = requestTemplate === undefined ? 0 :
    Object.values(requestTemplate.headers).reduce((sum, value) => sum + Buffer.byteLength(value, "utf8"), 0);
  for (const root of roots) {
    const counted = countExpr(root.expr);
    totalNodes += counted.nodes;
    totalRefs += counted.refs;
    totalLiteralBytes += counted.literalBytes;
  }
  if (totalNodes > MAX_VALUE_NODES) fail("too many expression nodes");
  if (totalRefs > MAX_REF_EDGES) fail("too many references");
  if (totalLiteralBytes > MAX_LITERAL_BYTES) fail("too many literal bytes");

  // Expanded weight/depth: memoized per named definition; a reused ref adds its
  // full weight at each occurrence. This bounds reasoning that traverses the DAG.
  type Measure = { weight: number; depth: number; type: ValueKind };
  const measureCache = new Map<string, Measure>();
  const visiting = new Set<string>();
  const measureDefinition = (name: string): Measure => {
    const cached = measureCache.get(name);
    if (cached) return cached;
    if (visiting.has(name)) fail(`reference cycle at ${name}`);
    const definition = names.get(name);
    if (definition === undefined) fail(`unknown reference ${name}`);
    visiting.add(name);
    const measured = measureExpr(definition);
    visiting.delete(name);
    measureCache.set(name, measured);
    return measured;
  };
  const measureExpr = (expr: Expr): Measure => {
    if (expr.kind === "literal" || expr.kind === "symbolic") return { weight: 1, depth: 0, type: expr.type };
    if (expr.kind === "ref") {
      const definition = measureDefinition(expr.name);
      return { weight: saturating(1 + definition.weight), depth: saturating(1 + definition.depth), type: definition.type };
    }
    const condition = measureExpr(expr.condition);
    const then = measureExpr(expr.then);
    const alternate = measureExpr(expr.else);
    if (condition.type !== "boolean") fail("select condition must be Boolean");
    if (then.type !== alternate.type) fail("select branches must have the same kind");
    expr.type = then.type;
    return {
      weight: saturating(1 + condition.weight + then.weight + alternate.weight),
      depth: saturating(1 + Math.max(condition.depth, then.depth, alternate.depth)),
      type: then.type
    };
  };

  let totalWork = 0;
  let methodUrlWork = 0;
  for (const root of roots) {
    const measured = measureExpr(root.expr);
    if (root.expected !== undefined && root.expected !== measured.type) {
      fail(`${root.label} must be ${root.expected === "boolean" ? "Boolean" : "a string"}`);
    }
    if (measured.depth > MAX_ROOT_DEPTH) fail(`${root.label} expanded depth too deep`);
    totalWork = saturating(totalWork + measured.weight);
    if (root.label === "http.requests.method" || root.label === "http.requests.url") {
      methodUrlWork = saturating(methodUrlWork + measured.weight);
    }
  }
  if (totalWork > MAX_TOTAL_WORK) fail("expanded work too large");
  if (methodUrlWork > MAX_METHOD_URL_WORK) fail("request method/url work too large");

  // Materialize. Named values are built once and shared; refs alias them.
  const compiled = new Map<string, Any>();
  const compileDefinition = (name: string): Any => {
    const cached = compiled.get(name);
    if (cached !== undefined) return cached;
    const value = compileExpr(names.get(name)!);
    compiled.set(name, value);
    return value;
  };
  const compileExpr = (expr: Expr): Any => {
    if (expr.kind === "literal") {
      return expr.type === "boolean" ? ESBoolean(expr.value as boolean) : ESString(expr.value as string);
    }
    if (expr.kind === "symbolic") return expr.type === "boolean" ? ESBoolean() : ESString();
    if (expr.kind === "ref") return compileDefinition(expr.name);
    return selectValue(compileExpr(expr.condition) as TESBoolean, compileExpr(expr.then), compileExpr(expr.else));
  };
  for (const name of names.keys()) compileDefinition(name);

  const filesystem: Environment["filesystem"] = {};
  if (descriptorAvailable !== undefined) filesystem.descriptorAvailable = compileExpr(descriptorAvailable) as TESBoolean;
  if (emptyPathBeforeOpenDescriptorCheck !== undefined) {
    filesystem.emptyPathBeforeOpenDescriptorCheck = compileExpr(emptyPathBeforeOpenDescriptorCheck) as TESBoolean;
  }

  let requestInput: Environment["requestInput"];
  let requestsState: Record<string, unknown> | undefined;
  if (requestTemplate !== undefined) {
    const template = requestTemplate;
    const freshExpr = (expr: Expr): Any => {
      if (expr.kind === "literal") {
        return expr.type === "boolean" ? ESBoolean(expr.value as boolean) : ESString(expr.value as string);
      }
      if (expr.kind === "symbolic") return expr.type === "boolean" ? ESBoolean() : ESString();
      if (expr.kind === "ref") return compiled.get(expr.name)!;
      return selectValue(freshExpr(expr.condition) as TESBoolean, freshExpr(expr.then), freshExpr(expr.else));
    };
    requestInput = () => {
      const headers = template.headers;
      const input: IncomingRequestInput = {
        method: freshExpr(template.method) as TESString,
        url: freshExpr(template.url) as TESString
      };
      if (ownKeys(headers).length > 0) input.headers = headers;
      return input;
    };
    const freezeExpr = (expr: Expr): Expr => {
      if (expr.kind === "select") {
        freezeExpr(expr.condition); freezeExpr(expr.then); freezeExpr(expr.else);
      }
      return Object.freeze(expr);
    };
    freezeExpr(template.method); freezeExpr(template.url);
    Object.freeze(template.headers);
    Object.freeze(template);
    requestsState = Object.freeze({ method: template.method, url: template.url, headers: template.headers });
  }

  // Object.freeze alone does not protect Map entries. Shadow its ordinary
  // mutators before exposing it; all compilation finished before publication.
  const rejectMutation = (): never => { throw new TypeError("Environment values are immutable"); };
  Object.defineProperties(compiled, {
    set: { value: rejectMutation }, delete: { value: rejectMutation }, clear: { value: rejectMutation }
  });
  Object.freeze(compiled);
  const state: EnvironmentState = Object.freeze({
    values: compiled,
    requests: requestsState,
    provenance: Object.freeze({ path: resolved, version: 1, sha256 })
  });

  return { state, filesystem, requestInput };
}
