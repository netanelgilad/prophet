import { join } from "path";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { InvalidPackageConfig, readPackageConfig } from "../src/require/package-config";
import {
  assertPinnedNode, compareModuleGraph, nodeModuleObservation, withModuleGraphFixture
} from "./commonjs/oracle";

beforeAll(assertPinnedNode);

describe("CommonJS package metadata", () => {
  test("reads supported fields without imposing requirements on ordinary package metadata", () => {
    expect(readPackageConfig('\uFEFF{"name":"example","main":"./entry.cjs","type":"commonjs",' +
      '"exports":{".":"./other.cjs"},"description":"braces } and escaped quote \\\"",' +
      '"nested":{"same":1,"same":2}}')).toEqual({ name: "example", main: "./entry.cjs", type: "commonjs",
        exports: { ".": "./other.cjs" } });
    expect(readPackageConfig('{"main":"","type":"module"}')).toEqual({ main: "", type: "module" });
    expect(readPackageConfig('{"main":false,"type":"future-format"}')).toEqual({});
    expect(readPackageConfig('{"__proto__":{"main":"bad.cjs"}}')).toEqual({});
  });

  for (const main of ["null", "false", "42", "[]", "{}", '""']) {
    test(`Node ignores a main field of ${main} and loads index`, () => {
      const metadata = `{"main":${main},"type":"commonjs"}`;
      expect(readPackageConfig(metadata).main).toBe(main === '""' ? "" : undefined);
      compareModuleGraph({
        "entry.cjs": 'module.exports = require("./package");',
        "package/package.json": metadata,
        "package/index.js": "module.exports = 7;"
      });
    });
  }

  test("a BOM and unrelated exports metadata preserve local directory main resolution", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./package");',
      "package/package.json": '\uFEFF{"main":"./entry.cjs","exports":"./absent.cjs"}',
      "package/entry.cjs": "module.exports = 11;"
    });
  });

  for (const metadata of ["null", "[]", "42", '"package"', '{"name":false}', '{"type":null}']) {
    test(`Node rejects the supported invalid metadata shape ${metadata}`, () => {
      expect(() => readPackageConfig(metadata)).toThrow(InvalidPackageConfig);
      const { actual } = compareModuleGraph({
        "entry.cjs": 'module.exports = require("./package");',
        "package/package.json": metadata,
        "package/index.js": "module.exports = 7;"
      });
      expect(actual).toEqual({ kind: "throw", error: "Error", code: "ERR_INVALID_PACKAGE_CONFIG" });
    });
  }

  for (const [description, metadata, value] of [
    ["escaped top-level keys", '{"m\\u0061in":"./entry.cjs"}', "7"],
    ["duplicated top-level keys", '{"main":"./entry.cjs","main":null}', "11"],
    ["invalid escapes in unused fields", '{"main":"./entry.cjs","unused":"\\uZZZZ"}', "11"]
  ]) {
    test(`${description} remain explicit gaps instead of assuming JSON.parse matches Node`, () => {
      const sources = {
        "entry.cjs": 'module.exports = require("./package");',
        "package/package.json": metadata,
        "package/index.js": "module.exports = 7;",
        "package/entry.cjs": "module.exports = 11;"
      };
      expect(() => readPackageConfig(metadata)).toThrow(/CommonJS package metadata .*not yet supported/);
      withModuleGraphFixture(sources, (files, directory) => {
        const filename = join(directory, "entry.cjs");
        expect(nodeModuleObservation(filename)).toEqual({
          kind: "return", value: { type: "number", value }
        });
        expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
          .toThrow(/CommonJS package metadata .*not yet supported/);
      });
    });
  }

  test("unclassified JSON syntax failures stop analysis rather than inventing a Node failure", () => {
    expect(() => readPackageConfig("{")).toThrow(/CommonJS package metadata syntax .*not yet supported/);
  });

  test("a null byte in main stays explicit instead of loading a truncated filename or index", () => {
    const metadata = '{"main":"entry.cjs\\u0000ignored"}';
    expect(readPackageConfig(metadata)).toEqual({ main: "entry.cjs\u0000ignored" });
    withModuleGraphFixture({
      "entry.cjs": 'module.exports = require("./package");',
      "package/package.json": metadata,
      "package/entry.cjs": "module.exports = 11;",
      "package/index.js": "module.exports = 7;"
    }, (files, directory) => {
      const filename = join(directory, "entry.cjs");
      expect(nodeModuleObservation(filename)).toEqual({
        kind: "throw", error: "TypeError", code: "ERR_INVALID_ARG_VALUE"
      });
      expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
        .toThrow("CommonJS package main with null bytes is not yet supported");
    });
  });

  for (const field of ["name", "type", "main"]) {
    test(`a lone surrogate in ${field} stays explicit until native metadata string decoding is modeled`, () => {
      const metadata = `{"${field}":"\\ud800"}`;
      expect(() => readPackageConfig(metadata)).toThrow(/CommonJS package metadata string decoding .*not yet supported/);
      withModuleGraphFixture({
        "entry.cjs": 'module.exports = require("./package");',
        "package/package.json": metadata,
        "package/index.js": "module.exports = 7;"
      }, (files, directory) => {
        const filename = join(directory, "entry.cjs");
        expect(nodeModuleObservation(filename)).toEqual(field === "main"
          ? { kind: "return", value: { type: "number", value: "7" } }
          : { kind: "throw", error: "Error", code: "ERR_INVALID_PACKAGE_CONFIG" });
        expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
          .toThrow(/CommonJS package metadata string decoding .*not yet supported/);
      });
    });
  }
});
