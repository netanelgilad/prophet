import { execFileSync } from "child_process";
import { createCommonJSLoader, createHTTPModel, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { createHTTPStatusCodes } from "../src/node/http-status-codes";
import { TESString } from "../src/string/String";
import { Any, isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function nativeCatalog() {
  assertPinnedNode();
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `
    const codes = require("node:http").STATUS_CODES;
    process.stdout.write(JSON.stringify({
      codes, keys: Object.keys(codes), ordinary: Object.getPrototypeOf(codes) === Object.prototype,
      data: Object.values(Object.getOwnPropertyDescriptors(codes)).every(descriptor =>
        descriptor.enumerable && descriptor.writable && descriptor.configurable && typeof descriptor.value === "string")
    }));
  `], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }));
}

function run(source: string, inputs: { [name: string]: Any } = {}) {
  const codes = createHTTPStatusCodes();
  const initial = setVariablesInScope(nodeInitialExecutionContext, { codes, ...inputs });
  const [completion, context] = evaluateCode(source, initial);
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  return { codes, initial, context };
}

function compare(source: string) {
  const model = createHTTPModel();
  return withModuleFixture(source, filename => {
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
    const [loaded, context] = createCommonJSLoader({ [filename]: source },
      { builtins: { http: model.module } }).load(filename, nodeInitialExecutionContext);
    expect(isThrownValue(loaded)).toBe(false);
    expect(isForkedCompletion(loaded)).toBe(false);
    expect(loaded).toMatchObject({ type: "boolean", value: true });
    return { model, context };
  });
}

test("the complete pinned status catalog has exactly Node's keys, strings, and enumeration order", () => {
  const reference = nativeCatalog();
  expect(reference.keys).toHaveLength(63);
  expect(reference.ordinary).toBe(true);
  expect(reference.data).toBe(true);
  const { codes, context } = run('const keys = Object.keys(codes).join(",");');
  const properties = getProperties(codes, context);
  const actual: { [key: string]: string | undefined } = {};
  for (const key of Object.keys(properties)) {
    expect(properties[key]).toMatchObject({ type: "string" });
    const value = (properties[key] as TESString).value;
    expect(typeof value).toBe("string");
    actual[key] = value as string;
  }
  expect(actual).toEqual(reference.codes);
  expect(Object.keys(properties)).toEqual(reference.keys);
  expect(context.value.scope.keys).toMatchObject({ value: reference.keys.join(",") });
});

test("numeric/string keys, missing entries, and inherited ordinary object methods match Node", () => {
  compare(`
    const codes = require("http").STATUS_CODES;
    module.exports = codes[200] === "OK" && codes["200"] === codes[200]
      && codes["0200"] === undefined && codes[999] === undefined && codes[-1] === undefined
      && codes.toString === Object.prototype.toString && codes.constructor === Object
      && Object.prototype.toString.call(codes) === "[object Object]"
      && Object.prototype.hasOwnProperty.call(codes, 418)
      && !Object.prototype.hasOwnProperty.call(codes, "toString");
  `);
});

test("table mutations and additions are ordinary data, while a spread copy is independent", () => {
  compare(`
    const codes = require("http").STATUS_CODES;
    const copy = { ...codes };
    codes[200] = "Custom OK";
    codes[599] = "Custom failure";
    codes.description = "user data";
    const keys = Object.keys(codes);
    const object = {};
    codes[201] = object;
    module.exports = codes[200] === "Custom OK" && copy[200] === "OK"
      && codes[599] === "Custom failure" && copy[599] === undefined && codes[201] === object
      && keys.length === 65 && keys[63] === "599" && keys[64] === "description"
      && Object.keys(copy).length === 63;
  `);
});

test("both builtin aliases share table identity and observe replacement of the exported property", () => {
  compare(`
    const http = require("http");
    const alias = require("node:http");
    const original = http.STATUS_CODES;
    original[200] = "Changed";
    const shared = original === alias.STATUS_CODES && alias.STATUS_CODES[200] === "Changed";
    const replacement = { 200: "Replacement" };
    http.STATUS_CODES = replacement;
    module.exports = shared && alias.STATUS_CODES === replacement && original !== alias.STATUS_CODES
      && original[200] === "Changed" && alias.STATUS_CODES[200] === "Replacement";
  `);
});

test("separate modeled environments and prior contexts retain independent catalog state", () => {
  const other = createHTTPStatusCodes();
  const { codes, initial, context } = run('codes[200] = "Changed"; const separate = codes !== other;', { other });
  expect(context.value.scope.separate).toMatchObject({ value: true });
  expect(getProperties(codes, context)[200]).toMatchObject({ value: "Changed" });
  expect(getProperties(codes, initial)[200]).toMatchObject({ value: "OK" });
  expect(getProperties(other, context)[200]).toMatchObject({ value: "OK" });
  expect(createHTTPModel().module.properties.STATUS_CODES).not.toBe(createHTTPModel().module.properties.STATUS_CODES);
});

test("conditional mutation and property presence keep their paths and unknown alternatives", () => {
  const { codes, initial, context } = run(`
    if (selected) { codes[200] = "Selected"; codes[599] = "Extra"; }
    const proof = selected
      ? codes[200] === "Selected" && codes[599] === "Extra" && Object.keys(codes).length === 64
      : codes[200] === "OK" && codes[599] === undefined && Object.keys(codes).length === 63;
    const uncertain = codes[200] === "Selected";
    const uncertainPresence = Object.prototype.hasOwnProperty.call(codes, 599);
  `, { selected: ESBoolean() });
  expect(context.value.scope.proof).toMatchObject({ value: true });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
  expect(context.value.scope.uncertainPresence).toMatchObject({ value: undefined });
  expect(getProperties(codes, initial)[200]).toMatchObject({ value: "OK" });
  expect(getProperties(codes, initial)[599]).toBeUndefined();
});

test("branch-selected reason strings preserve the choice instead of becoming one sampled reason", () => {
  const { context } = run(`
    const reason = selected ? codes[200] : codes[405];
    const proof = selected ? reason === "OK" : reason === "Method Not Allowed";
    const uncertain = reason === "OK";
  `, { selected: ESBoolean() });
  expect(context.value.scope.proof).toMatchObject({ value: true });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
});

test("symbolic computed property keys retain the shared VM's explicit lookup gap", () => {
  expect(() => run('const reason = codes[selected ? 200 : 405];', { selected: ESBoolean() }))
    .toThrow("Computed property access requires a concrete number or string");
});
