import { invoke, readMember } from "../ASTResolvers";
import { coerceToBoolean, ESBoolean } from "../boolean/ESBoolean";
import { withValue } from "../conversion/toString";
import { createHostFunction } from "../effects";
import { createError } from "../error/Error";
import { bindNormal } from "../evaluate";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getProperties, writeProperty } from "../execution-context/Heap";
import { isESFunction } from "../Function/Function";
import { ESObject } from "../Object";
import { hasProperty } from "../Object/prototype";
import { ESString, getStringPrototype } from "../string/String";
import { resolveBoolean, strictEquality } from "../symbolic";
import { Any, ESNull, ESNumber, TESBoolean, ThrownValue, Undefined } from "../types";
import { withStringArgument } from "./arguments";
import { createWarningModel } from "./warnings";

const deprecation = '`url.parse()` behavior is not standardized and prone to ' +
  'errors that have security implications. Use the WHATWG URL API ' +
  'instead. CVEs are not issued for `url.parse()` vulnerabilities.';

function unsupported(detail: string): never {
  throw new Error(`Legacy URL analysis is not yet supported: ${detail}`);
}

const fieldNames = ["protocol", "slashes", "auth", "host", "port", "hostname",
  "hash", "search", "query", "pathname", "path", "href"];

// This is the path-only subset of pinned Node's legacy algorithm, not WHATWG
// URL parsing. In particular its fast path skips escaping, while its slow path
// escapes a fixed ASCII set, preserving percent sequences and UTF-16 units.
function parsePath(input: string, slashesDenoteHost: boolean) {
  const whitespace = (index: number) => input.charCodeAt(index) < 33 ||
    input.charCodeAt(index) === 0xa0 || input.charCodeAt(index) === 0xfeff;
  let first = 0, last = input.length;
  while (first < last && whitespace(first)) first++;
  while (last > first && whitespace(last - 1)) last--;
  let rest = input.slice(first, last);
  const split = rest.search(/[?#]/);
  const before = split < 0 ? rest : rest.slice(0, split);
  const hasAt = before.includes("@");
  rest = before.replace(/\\/g, "/") + (split < 0 ? "" : rest.slice(split));
  const fields: { [name: string]: string | null } = {};
  fieldNames.forEach(name => { fields[name] = null; });

  if (!slashesDenoteHost && !rest.includes("#") && !hasAt) {
    const simple = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/.exec(rest);
    if (simple) {
      fields.path = fields.href = rest;
      fields.pathname = simple[1];
      if (simple[2]) { fields.search = simple[2]; fields.query = simple[2].slice(1); }
      return fields;
    }
  }
  if (/^[a-z0-9.+-]+:/i.test(rest)) return unsupported("protocol URLs");
  if ((slashesDenoteHost || /^\/\/[^@/]+@[^@/]+/.test(rest)) && rest.slice(0, 2) === "//") {
    return unsupported("authority URLs");
  }
  const escapes: { [character: string]: string } = {
    "\t": "%09", "\n": "%0A", "\r": "%0D", " ": "%20", '"': "%22", "'": "%27",
    "<": "%3C", ">": "%3E", "\\": "%5C", "^": "%5E", "`": "%60",
    "{": "%7B", "|": "%7C", "}": "%7D"
  };
  rest = rest.replace(/[\t\n\r "'<>\\^`{|}]/g, character => escapes[character]);
  const hash = rest.indexOf("#");
  if (hash >= 0) { fields.hash = rest.slice(hash); rest = rest.slice(0, hash); }
  const question = rest.indexOf("?");
  if (question >= 0) {
    fields.search = rest.slice(question); fields.query = rest.slice(question + 1);
    rest = rest.slice(0, question);
  }
  if (rest) fields.pathname = rest;
  if (fields.pathname || fields.search) fields.path = (fields.pathname || "") + (fields.search || "");
  fields.href = (fields.path || "") + (fields.hash || "");
  return fields;
}

/** A scoped legacy URL module sharing one process warning environment. */
export function createLegacyURLModel(warnings = createWarningModel()) {
  const state = ESObject({ warned: ESBoolean(false) });
  const instances = new WeakSet<object>();
  const prototype = Object.assign(ESObject(), {
    unknownProperties: "Node Url prototype API",
    unmodeledOwnPropertyInspection: "Node Url prototype descriptors"
  });
  const parseInput = (args: ReadonlyArray<Any>, context: TExecutionContext): BranchResult =>
    withValue(args[0] || Undefined, context, (value, branch) => {
      // Pinned url.parse returns an existing Url before consulting either flag.
      if (instances.has(value)) return [value, branch];
      return withStringArgument("url", value, branch, (input, afterString) =>
        evaluateBranches(coerceToBoolean(args[1] || Undefined, afterString.value.knowledge), afterString,
          () => unsupported("query-string object parsing"), afterQuery =>
            evaluateBranches(coerceToBoolean(args[2] || Undefined, afterQuery.value.knowledge), afterQuery,
              after => parseString(input.value, true, after), after => parseString(input.value, false, after))));
    });
  const parseString = (input: unknown, host: boolean, context: TExecutionContext): BranchResult => {
    if (typeof input !== "string") return unsupported("open symbolic URL string");
    // These methods are dynamic in Node's JS implementation. charCodeAt is
    // still absent from the VM; slice now exists and must retain its intrinsic
    // identity. Never ignore an interpreted replacement's effects.
    if (resolveBoolean(hasProperty(getStringPrototype(), "charCodeAt", context), context.value.knowledge) !== false) {
      return unsupported("modified String.prototype.charCodeAt");
    }
    return bindNormal(readMember(getStringPrototype(), "slice", context), (slice, afterRead) => {
      if (resolveBoolean(strictEquality(slice, getStringPrototype().properties.slice), afterRead.value.knowledge) !== true) {
        return unsupported("modified String.prototype.slice");
      }
      const fields = parsePath(input, host);
      const properties: { [name: string]: Any } = {};
      fieldNames.forEach(name => { properties[name] = fields[name] === null ? ESNull : ESString(fields[name]!); });
      const result = Object.assign(ESObject(properties), { prototype });
      instances.add(result);
      return [result, afterRead];
    });
  };
  const parse = Object.assign(createHostFunction("url.parse", (call, context) =>
    evaluateBranches(getProperties(state, context).warned as TESBoolean, context,
      branch => parseInput(call.args, branch), fresh => {
        const filename = fresh.value.sourceFile;
        if (!filename || filename.startsWith("node:")) return unsupported("warning eligibility requires a known source filename");
        if (/[\\/]node_modules[\\/]/.test(filename)) return parseInput(call.args, fresh);
        // The once flag is consumed before mutable emitWarning is called, even
        // when that replacement throws or input validation later fails.
        const marked = writeProperty(state, "warned", ESBoolean(true), fresh);
        return bindNormal(readMember(warnings.process, "emitWarning", marked), (method, afterRead) =>
          bindNormal(withValue(method, afterRead, (callee, branch) => isESFunction(callee)
            ? invoke(callee, [ESString(deprecation), ESString("DeprecationWarning"), ESString("DEP0169")], branch, warnings.process)
            : [ThrownValue(createError("TypeError", ESString("process.emitWarning is not a function"))), branch]),
          (_ignored, afterWarning) => parseInput(call.args, afterWarning)));
      })), {
    nonConstructible: false,
    unmodeledConstruct: "Legacy url.parse construction is not yet supported",
    unknownProperties: "Node url.parse function API", modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node url.parse descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(parse.properties, { name: ESString("urlParse"), length: ESNumber(3) });
  const module = Object.assign(ESObject({ parse }), {
    unknownProperties: "Node URL module API", unmodeledOwnPropertyInspection: "Node URL module descriptors",
    hostSlots: Object.freeze({ "node.url.deprecation": state })
  });
  return { module, state, process: warnings.process, warnings };
}
