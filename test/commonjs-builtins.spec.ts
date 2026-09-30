import { join } from "path";
import { createCommonJSLoader, evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESObject } from "../src/Object";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESNumber, Any, isThrownValue } from "../src/types";
import { assertPinnedNode, nodeModuleObservation, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function compareBuiltinGraph(sources: { [name: string]: string }, builtins: { [name: string]: Any }) {
  return withModuleGraphFixture(sources, (files, directory) => {
    const filename = join(directory, "entry.cjs");
    expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "boolean", value: true } });
    const [loaded, context] = createCommonJSLoader(files, { builtins }).load(filename, nodeInitialExecutionContext);
    expect(isThrownValue(loaded)).toBe(false);
    expect(isForkedCompletion(loaded)).toBe(false);
    expect(loaded).toMatchObject({ type: "boolean", value: true });
    return context;
  });
}

test("http and node:http expose the same registered VM object across requiring modules", () => {
  compareBuiltinGraph({
    "entry.cjs": `
      const http = require("http");
      module.exports = http === require("node:http") && http === require("./other.cjs");
    `,
    "other.cjs": 'module.exports = require("node:http");'
  }, { http: ESObject() });
});

test("registered builtins take precedence over package self-reference and installed packages", () => {
  compareBuiltinGraph({
    "entry.cjs": 'module.exports = require("http") === require("node:http");',
    "package.json": '{"name":"http","exports":"./shadow.cjs"}',
    "shadow.cjs": 'throw "self-reference loaded";',
    "node_modules/http/index.js": 'throw "installed package loaded";'
  }, { http: ESObject() });
});

test("relative files named like builtins remain distinct modules", () => {
  compareBuiltinGraph({
    "entry.cjs": `
      const http = require("http");
      module.exports = require("./http.cjs") !== http && http === require("node:http");
    `,
    "http.cjs": 'module.exports = {};'
  }, { http: ESObject() });
});

test("builtin property mutations are visible through both require spellings", () => {
  const http = ESObject();
  const context = compareBuiltinGraph({
    "entry.cjs": `
      require("http").prophetFixtureValue = 17;
      module.exports = require("node:http").prophetFixtureValue === 17 && require("./other.cjs") === 17;
    `,
    "other.cjs": 'module.exports = require("http").prophetFixtureValue;'
  }, { http });
  expect(getProperties(http, context).prophetFixtureValue).toMatchObject({ value: 17 });
  expect(http.properties.prophetFixtureValue).toBeUndefined();
});

for (const name of ["sea", "sqlite", "test", "test/reporters"]) {
  test(`registering ${name} models node:${name} while the bare request stays a package`, () => {
    compareBuiltinGraph({
      "entry.cjs": `
        const builtin = require("node:${name}");
        module.exports = builtin === require("node:${name}") && require("${name}") === "package";
      `,
      [name === "test/reporters" ? "node_modules/test/reporters.js" : `node_modules/${name}/index.js`]:
        'module.exports = "package";'
    }, { [name]: ESObject() });
  });
}

for (const request of ["node:prophet-no-such-builtin", "node:node:http", "node:HTTP", "node:http/"]) {
  test(`the unknown builtin request ${request} remains a catchable Node error`, () => {
    compareBuiltinGraph({
      "entry.cjs": `
        let correct = false;
        try { require(${JSON.stringify(request)}); }
        catch (error) { correct = error.name === "Error" && error.code === "ERR_UNKNOWN_BUILTIN_MODULE"; }
        module.exports = correct;
      `
    }, { http: ESObject() });
  });
}

test("a finite symbolic choice between builtin aliases preserves identity and conditional mutations", () => {
  const http = ESObject({ count: ESNumber(0) });
  const [api, loaded] = createCommonJSLoader({
    "/app/entry.cjs": 'module.exports = function(request) { return require(request); };'
  }, { builtins: { http } }).load("/app/entry.cjs", nodeInitialExecutionContext);
  const [completion, context] = evaluateCode(`
    const selected = Math.random() < 0.5;
    const loaded = api(selected ? "http" : "node:http");
    const same = loaded === http;
    if (selected) loaded.count = 1;
    const state = selected ? api("node:http").count === 1 : api("http").count === 0;
    const uncertain = api("http").count === 1;
  `, setVariablesInScope(loaded, { api, http }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.same).toMatchObject({ value: true });
  expect(context.value.scope.state).toMatchObject({ value: true });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
  expect(getProperties(http, nodeInitialExecutionContext).count).toMatchObject({ value: 0 });
});

test("a symbolic choice between a builtin and an ordinary file preserves their separate identities", () => {
  const http = ESObject();
  const [api, loaded] = createCommonJSLoader({
    "/app/entry.cjs": 'module.exports = function(request) { return require(request); };',
    "/app/other.cjs": 'module.exports = {};'
  }, { builtins: { http } }).load("/app/entry.cjs", nodeInitialExecutionContext);
  const [completion, context] = evaluateCode(`
    const selected = Math.random() < 0.5;
    const result = api(selected ? "http" : "./other.cjs");
    const classified = selected ? result === http : result !== http;
    const uncertain = result === http;
  `, setVariablesInScope(loaded, { api, http }));
  expect(isThrownValue(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(context.value.scope.classified).toMatchObject({ value: true });
  expect(context.value.scope.uncertain).toMatchObject({ value: undefined });
});

test("a builtin registry is a snapshot, while module state belongs to each execution context", () => {
  const original = ESObject({ count: ESNumber(0) });
  const builtins = { http: original };
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      const http = require("http");
      http.count = http.count + 1;
      module.exports = http;
    `
  }, { builtins });
  builtins.http = ESObject({ count: ESNumber(50) });
  const [first, firstContext] = loader.load("/app/entry.cjs", nodeInitialExecutionContext);
  const [second, secondContext] = loader.load("/app/entry.cjs", nodeInitialExecutionContext);
  expect(first).toBe(original);
  expect(second).toBe(original);
  expect(getProperties(original, firstContext).count).toMatchObject({ value: 1 });
  expect(getProperties(original, secondContext).count).toMatchObject({ value: 1 });
  expect(getProperties(original, nodeInitialExecutionContext).count).toMatchObject({ value: 0 });
});

for (const name of ["node:http", "node:test", "prophet-not-a-builtin", "", "__proto__"]) {
  test(`registry key ${JSON.stringify(name)} is rejected instead of defining a require alias`, () => {
    expect(() => createCommonJSLoader({}, { builtins: { [name]: ESObject() } }))
      .toThrow(/canonical builtin name/);
  });
}

test("conflicting prefixed and unprefixed registry aliases cannot create two versions of a builtin", () => {
  expect(() => createCommonJSLoader({}, { builtins: { http: ESObject(), "node:http": ESObject() } }))
    .toThrow(/canonical builtin name/);
});

test("raw host values cannot stand in for VM builtin modules", () => {
  for (const value of [undefined, null, 17, {}, [], { type: "native-object" },
    function() { throw new Error("must never execute"); }]) {
    expect(() => createCommonJSLoader({}, { builtins: { http: value as any } }))
      .toThrow(/must be a VM value/);
  }
});

test("unregistered builtins remain analysis gaps and cannot fall back to native require or installed packages", () => {
  const loader = createCommonJSLoader({
    "/app/entry.cjs": `
      try { module.exports = require("node:fs"); }
      catch (error) { module.exports = "caught"; }
    `,
    "/app/node_modules/fs/index.js": 'module.exports = "package";'
  }, { builtins: { http: ESObject() } });
  expect(() => loader.load("/app/entry.cjs", nodeInitialExecutionContext))
    .toThrow(/CommonJS builtin loading is not yet supported/);
});

test("inherited registry properties do not silently register host modules", () => {
  const builtins = Object.create({ http: ESObject() });
  const loader = createCommonJSLoader({ "/app/entry.cjs": 'module.exports = require("http");' }, { builtins });
  expect(() => loader.load("/app/entry.cjs", nodeInitialExecutionContext))
    .toThrow(/CommonJS builtin loading is not yet supported/);
});

test("registering a builtin does not change the absolute-entry-path contract", () => {
  const loader = createCommonJSLoader({}, { builtins: { http: ESObject() } });
  expect(() => loader.load("http", nodeInitialExecutionContext)).toThrow(/absolute path/);
});
