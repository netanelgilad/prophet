import { join } from "path";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { resolvePackageExport } from "../src/require/package-exports";
import { assertPinnedNode, compareModuleGraph, nodeModuleObservation, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

function fixture(exports: unknown, request = "example", extra: { [filename: string]: string } = {}) {
  return {
    "entry.cjs": `module.exports = require(${JSON.stringify(request)});`,
    "node_modules/example/package.json": JSON.stringify({ main: "./legacy.cjs", exports }),
    "node_modules/example/first.cjs": "module.exports = 1;",
    "node_modules/example/second.cjs": "module.exports = 2;",
    "node_modules/example/folder/second.cjs": "module.exports = 2;",
    "node_modules/example/legacy.cjs": "module.exports = 9;",
    ...extra
  };
}

function returns(exports: unknown, value: number, request = "example") {
  expect(compareModuleGraph(fixture(exports, request)).actual).toEqual({
    kind: "return", value: { type: "number", value: String(value) }
  });
}

function fails(exports: unknown, code: string, request = "example") {
  expect(compareModuleGraph(fixture(exports, request)).actual).toEqual({
    kind: "throw", error: code === "ERR_INVALID_MODULE_SPECIFIER" ? "TypeError" : "Error", code
  });
}

describe("CommonJS package exports agrees with Node 24.21.0 default conditions", () => {
  for (const ignored of [false, 0, null]) {
    test(`an external package ignores exports:${JSON.stringify(ignored)} and uses legacy main`, () => {
      returns(ignored, 9);
    });

    test(`exports:${JSON.stringify(ignored)} does not create a self reference`, () => {
      const graph = {
        ...fixture("./first.cjs"),
        "package.json": JSON.stringify({ name: "example", exports: ignored, main: "./self.cjs" }),
        "self.cjs": "module.exports = 8;"
      };
      expect(compareModuleGraph(graph).actual).toEqual({
        kind: "return", value: { type: "number", value: "1" }
      });
    });
  }

  test("main sugar and exact subpaths select their declared files", () => {
    returns("./first.cjs", 1);
    returns({ ".": "./first.cjs", "./feature": "./second.cjs" }, 2, "example/feature");
    returns({ ".": "./first.cjs", "./feature": "./second.cjs" }, 1);
  });

  for (const condition of ["node", "require", "node-addons", "module-sync", "default"]) {
    test(`the default Node runtime activates the ${condition} condition`, () => {
      returns(condition === "default" ? { default: "./first.cjs" }
        : { [condition]: "./first.cjs", default: "./second.cjs" }, 1);
    });
  }

  test("condition object order decides between multiple active conditions", () => {
    returns({ default: "./first.cjs", require: "./second.cjs" }, 1);
    returns({ node: "./first.cjs", require: "./second.cjs" }, 1);
    returns({ require: "./second.cjs", node: "./first.cjs" }, 2);
  });

  test("nested default conditions match the published tiny-invariant export map", () => {
    returns({ ".": {
      import: "./not-supplied.mjs",
      default: { types: "./not-supplied.d.ts", default: "./first.cjs" }
    } }, 1);
  });

  test("a condition with no active nested choice falls through, while null blocks it", () => {
    returns({ require: { browser: "../invalid-but-unselected" }, default: "./first.cjs" }, 1);
    fails({ require: null, default: "./first.cjs" }, "ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("arrays skip invalid targets, inactive conditions, and null until a path is selected", () => {
    returns(["../invalid", { browser: "./first.cjs" }, null, "./second.cjs"], 2);
    returns({ ".": [[], "./first.cjs"] }, 1);
  });

  test("the last null or invalid target determines an exhausted array's result", () => {
    fails(["../invalid", null], "ERR_PACKAGE_PATH_NOT_EXPORTED");
    fails([null, "../invalid"], "ERR_INVALID_PACKAGE_TARGET");
    fails(["../invalid", { browser: "./first.cjs" }], "ERR_INVALID_PACKAGE_TARGET");
    fails([], "ERR_PACKAGE_PATH_NOT_EXPORTED");
  });

  test("array resolution stops before checking whether its selected file exists", () => {
    fails(["./not-supplied.cjs", "./first.cjs"], "MODULE_NOT_FOUND");
  });

  test("exact export targets do not receive extension or directory fallback", () => {
    fails("./first", "MODULE_NOT_FOUND");
    const { actual } = compareModuleGraph(fixture("./folder", "example", {
      "node_modules/example/folder/index.js": "module.exports = 3;"
    }));
    expect(actual).toEqual({ kind: "throw", error: "Error", code: "MODULE_NOT_FOUND" });
  });

  test("numeric condition keys and mixed conditional/subpath maps are configuration errors", () => {
    fails({ ".": "./first.cjs", require: "./second.cjs" }, "ERR_INVALID_PACKAGE_CONFIG");
    fails({ "0": "./first.cjs", default: "./second.cjs" }, "ERR_INVALID_PACKAGE_CONFIG");
    fails({ "1.5": "./first.cjs", default: "./second.cjs" }, "ERR_INVALID_PACKAGE_CONFIG");
    returns({ "01": "./first.cjs", default: "./second.cjs" }, 2);
    returns({ "4294967295": "./first.cjs", default: "./second.cjs" }, 2);
  });

  test("an array cannot hide a configuration error behind a later valid target", () => {
    fails([{ "0": "./first.cjs" }, "./second.cjs"], "ERR_INVALID_PACKAGE_CONFIG");
  });

  test("missing, null, trailing-slash, and non-prefix subpaths remain encapsulated", () => {
    for (const request of ["example/missing", "example/blocked", "example/feature/", "example/feature/child"]) {
      fails({ ".": "./first.cjs", "./blocked": null, "./feature": "./second.cjs" },
        "ERR_PACKAGE_PATH_NOT_EXPORTED", request);
    }
  });

  for (const target of ["", "first.cjs", "../first.cjs", "/first.cjs", "file:///first.cjs", "./a/../first.cjs",
    "././first.cjs", "./node_modules/first.cjs", "./NODE_MODULES/first.cjs", "./%2e%2e/first.cjs", "./%6eode_modules/first.cjs"]) {
    test(`the target ${JSON.stringify(target)} is rejected rather than escaping its package`, () => {
      fails(target, "ERR_INVALID_PACKAGE_TARGET");
    });
  }

  test("invalid target types are errors only when selected", () => {
    fails({ ".": true }, "ERR_INVALID_PACKAGE_TARGET");
    fails({ ".": 42 }, "ERR_INVALID_PACKAGE_TARGET");
    returns({ browser: true, require: "./first.cjs" }, 1);
  });

  test("URL escapes, query strings, fragments, and normalized separators retain file identity", () => {
    returns("./%66irst.cjs", 1);
    returns("./first.cjs?query#fragment", 1);
    returns(".//first.cjs", 1);
    returns("./folder\\second.cjs", 2, "example");
  });

  for (const target of ["./folder%2ffirst.cjs", "./folder%5cfirst.cjs", "./first.cjs?x=%2f"]) {
    test(`encoded separators in ${JSON.stringify(target)} produce the correct module-specifier error`, () => {
      fails(target, "ERR_INVALID_MODULE_SPECIFIER");
    });
  }

  test("a matching exact export wins before an unsupported pattern map", () => {
    returns({ "./*": "./not-supplied/*.cjs", "./feature": "./first.cjs" }, 1, "example/feature");
  });

  test("pattern selection remains an explicit gap", () => {
    withModuleGraphFixture(fixture({ "./*": "./*.cjs" }, "example/first"), (files, directory) => {
      const filename = join(directory, "entry.cjs");
      expect(nodeModuleObservation(filename)).toEqual({ kind: "return", value: { type: "number", value: "1" } });
      expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
        .toThrow(/CommonJS package export patterns .*not yet supported/);
    });
  });

  for (const [target, message, expected] of [
    ["./%ZZ.cjs", /CommonJS package export malformed URL encodings .*not yet supported/,
      { kind: "throw", error: "URIError" }],
    ["./first.cjs%00ignored", /CommonJS package export paths with null bytes .*not yet supported/,
      { kind: "throw", error: "TypeError", code: "ERR_INVALID_ARG_VALUE" }]
  ] as Array<[string, RegExp, object]>) {
    test(`unsupported export URL ${JSON.stringify(target)} stops analysis explicitly`, () => {
      withModuleGraphFixture(fixture(target), (files, directory) => {
        const filename = join(directory, "entry.cjs");
        expect(nodeModuleObservation(filename)).toEqual(expected);
        expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext)).toThrow(message);
      });
    });
  }

  for (const [value, expected] of [
    ['{"require":"./first.cjs"}', { kind: "return", value: { type: "number", value: "1" } }],
    ['["./second.cjs"]', { kind: "return", value: { type: "number", value: "2" } }],
    ["{", { kind: "throw", error: "SyntaxError" }]
  ] as Array<[string, object]>) {
    test(`native reparsing of the string export ${JSON.stringify(value)} remains an explicit gap`, () => {
      withModuleGraphFixture(fixture(value), (files, directory) => {
        const filename = join(directory, "entry.cjs");
        expect(nodeModuleObservation(filename)).toEqual(expected);
        expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
          .toThrow(/CommonJS package metadata JSON-shaped exports strings .*not yet supported/);
      });
    });
  }

  test("native decoding of a top-level lone-surrogate export string stays explicit", () => {
    withModuleGraphFixture(fixture("\ud800"), (files, directory) => {
      const filename = join(directory, "entry.cjs");
      expect(nodeModuleObservation(filename)).toEqual({
        kind: "throw", error: "Error", code: "ERR_INVALID_PACKAGE_CONFIG"
      });
      expect(() => createCommonJSLoader(files).load(filename, nodeInitialExecutionContext))
        .toThrow(/CommonJS package metadata string decoding .*not yet supported/);
    });
  });

  test("the resolver reports no export separately from an invalid target", () => {
    expect(resolvePackageExport(null, ".", "/example")).toBeUndefined();
    expect(resolvePackageExport({ ".": null }, ".", "/example")).toBeUndefined();
    expect(resolvePackageExport({ browser: "./first.cjs" }, ".", "/example")).toBeUndefined();
    expect(resolvePackageExport({ "./other": "./first.cjs" }, ".", "/example")).toBeUndefined();
  });
});
