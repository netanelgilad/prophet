import { join } from "path";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { assertPinnedNode, compareModuleGraph, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

describe("package lookup agrees with Node 24.21.0", () => {
  test("a bare package loads its main from the nearest node_modules directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget/package.json": '{"main":"./lib/start.cjs"}',
      "node_modules/widget/lib/start.cjs": "module.exports = 7;"
    });
  });

  test("a scoped package loads its main", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("@example/widget");',
      "node_modules/@example/widget/package.json": '{"main":"./start.cjs"}',
      "node_modules/@example/widget/start.cjs": "module.exports = 8;"
    });
  });

  test("a nested importer searches ancestor node_modules directories", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/deep/importer.cjs");',
      "app/deep/importer.cjs": 'module.exports = require("widget");',
      "node_modules/widget/index.js": "module.exports = 9;"
    });
  });

  test("the nearest dependency copy wins and each resolved copy has its own cache", () => {
    compareModuleGraph({
      "entry.cjs": `
        packageRuns = 0;
        const outer = require("widget");
        const one = require("./app/one.cjs");
        const two = require("./app/deep/two.cjs");
        module.exports = {
          separate: outer !== one, shared: one === two, runs: packageRuns,
          outer: outer.value, inner: one.value
        };
      `,
      "app/one.cjs": 'module.exports = require("widget");',
      "app/deep/two.cjs": 'module.exports = require("widget");',
      "node_modules/widget/index.js": 'packageRuns = packageRuns + 1; exports.value = "outer";',
      "app/node_modules/widget/index.js": 'packageRuns = packageRuns + 1; exports.value = "inner";'
    });
  });

  test("a dependency's escaped require keeps that dependency's lookup origin", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("factory");',
      "node_modules/factory/index.js": 'module.exports = function () { return require("widget").value; };',
      "node_modules/factory/node_modules/widget/index.js": 'exports.value = "nested";',
      "node_modules/widget/index.js": 'exports.value = "outer";'
    }, "entry.cjs", "loaded()");
  });

  test("lookup skips a redundant node_modules/node_modules search directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("factory");',
      "node_modules/factory/index.js": 'module.exports = require("widget");',
      "node_modules/node_modules/widget/index.js": 'module.exports = "redundant";',
      "node_modules/widget/index.js": 'module.exports = "outer";'
    });
  });

  test("an unscoped package can be a JavaScript file directly inside node_modules", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget.js": "module.exports = 10;"
    });
  });

  test("a scoped package can be a JSON file directly inside its scope directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("@example/widget");',
      "node_modules/@example/widget.json": '{"value":11}'
    });
  });

  test("a package file wins over a legacy package directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget.js": 'module.exports = "file";',
      "node_modules/widget/package.json": '{"main":"./main.cjs"}',
      "node_modules/widget/main.cjs": 'module.exports = "directory";'
    });
  });

  test("a trailing slash on a legacy package request selects its directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget/");',
      "node_modules/widget.js": 'module.exports = "file";',
      "node_modules/widget/index.js": 'module.exports = "directory";'
    });
  });

  test("a legacy package can fall back from a missing main to its root index", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget/package.json": '{"main":"./missing"}',
      "node_modules/widget/index.json": '{"value":12}'
    });
  });

  test("an empty nearer package directory allows searching farther ancestors", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget");',
      "app/node_modules/widget/package.json": '{}',
      "app/node_modules/widget/unused.cjs": "module.exports = 1;",
      "node_modules/widget/index.js": 'module.exports = "farther";'
    });
  });

  test("a nearer nonempty main with no viable target or index stops ancestor lookup", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget");',
      "app/node_modules/widget/package.json": '{"main":"./missing"}',
      "node_modules/widget/index.cjs": 'module.exports = "not an automatic index";',
      "node_modules/widget/index.js": 'module.exports = "farther";'
    });
  });

  test("legacy package subpaths use ordinary file and directory resolution", () => {
    compareModuleGraph({
      "entry.cjs": `
        module.exports = {
          file: require("widget/lib/value"),
          directory: require("widget/lib/folder"),
          exact: require("@example/widget/lib/value.cjs")
        };
      `,
      "node_modules/widget/package.json": '{"main":"./unused.cjs"}',
      "node_modules/widget/lib/value.js": "module.exports = 1;",
      "node_modules/widget/lib/folder/index.json": "2",
      "node_modules/@example/widget/lib/value.cjs": "module.exports = 3;"
    });
  });

  test("a legacy subpath may load even when the package root main is broken", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget/lib/value.cjs");',
      "node_modules/widget/package.json": '{"main":"./missing"}',
      "node_modules/widget/lib/value.cjs": "module.exports = 4;"
    });
  });

  test("a missing legacy subpath can continue to a farther copy of the package", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget/lib/value.cjs");',
      "app/node_modules/widget/package.json": '{}',
      "app/node_modules/widget/lib/other.cjs": "module.exports = 1;",
      "node_modules/widget/lib/value.cjs": "module.exports = 2;"
    });
  });

  test("bare and explicit local aliases use one cache entry for the resolved file", () => {
    compareModuleGraph({
      "entry.cjs": `
        const bare = require("widget");
        const subpath = require("widget/index.js");
        const local = require("./node_modules/widget/index.js");
        module.exports = { same: bare === subpath && subpath === local };
      `,
      "node_modules/widget/index.js": "module.exports = {};"
    });
  });

  test("a found package's initialization failure does not try an ancestor copy", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget");',
      "app/node_modules/widget/index.js": 'throw "nearest failed";',
      "node_modules/widget/index.js": 'module.exports = "farther";'
    });
  });

  test("missing package roots and subpaths have MODULE_NOT_FOUND", () => {
    compareModuleGraph({
      "entry.cjs": `
        function attempt(path) {
          try { require(path); }
          catch (error) { return { name: error.name, code: error.code }; }
        }
        module.exports = {
          bare: attempt("missing-widget"), scoped: attempt("@example/missing-widget"),
          subpath: attempt("widget/missing")
        };
      `,
      "node_modules/widget/index.js": "module.exports = 1;"
    });
  });
});

describe("package exports and self-reference integrate with package lookup", () => {
  test("package exports selects an entry before main and a neighboring package file", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget.js": 'module.exports = "neighbor";',
      "node_modules/widget/package.json": '{"main":"./main.cjs","exports":"./public.cjs"}',
      "node_modules/widget/main.cjs": 'module.exports = "main";',
      "node_modules/widget/public.cjs": 'module.exports = "exports";'
    });
  });

  test("a require condition chooses CommonJS code from an exported package", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget/package.json": '{"exports":{"import":"./module.mjs","require":"./common.cjs"}}',
      "node_modules/widget/module.mjs": 'export default "import";',
      "node_modules/widget/common.cjs": 'module.exports = "require";'
    });
  });

  test("an exported package root does not implicitly export its trailing-slash subpath", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget/");',
      "node_modules/widget/package.json": '{"exports":"./public.cjs"}',
      "node_modules/widget/public.cjs": "module.exports = 1;"
    });
  });

  test("exported root, subpath, and direct file aliases preserve cache identity", () => {
    compareModuleGraph({
      "entry.cjs": `
        packageRuns = 0;
        const root = require("widget");
        const alias = require("widget/alias");
        const direct = require("./node_modules/widget/shared.cjs");
        module.exports = { same: root === alias && alias === direct, runs: packageRuns };
      `,
      "node_modules/widget/package.json": '{"exports":{".":"./shared.cjs","./alias":"./shared.cjs"}}',
      "node_modules/widget/shared.cjs": "packageRuns = packageRuns + 1; module.exports = {};"
    });
  });

  test("unexported package subpaths are private while explicit local paths can access the file", () => {
    compareModuleGraph({
      "entry.cjs": `
        let code;
        try { require("widget/private.cjs"); } catch (error) { code = error.code; }
        module.exports = { code: code, local: require("./node_modules/widget/private.cjs") };
      `,
      "node_modules/widget/package.json": '{"exports":"./public.cjs"}',
      "node_modules/widget/public.cjs": "module.exports = 1;",
      "node_modules/widget/private.cjs": "module.exports = 2;"
    });
  });

  test("a nearer exports map encapsulates the package even if a farther copy exports that subpath", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget/private");',
      "app/node_modules/widget/package.json": '{"exports":{".":"./public.cjs"}}',
      "app/node_modules/widget/public.cjs": "module.exports = 1;",
      "node_modules/widget/package.json": '{"exports":{"./private":"./private.cjs"}}',
      "node_modules/widget/private.cjs": "module.exports = 2;"
    });
  });

  test("a selected missing export never falls through to a farther package", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./app/importer.cjs");',
      "app/importer.cjs": 'module.exports = require("widget");',
      "app/node_modules/widget/package.json": '{"exports":"./missing.cjs"}',
      "node_modules/widget/index.js": 'module.exports = "farther";'
    });
  });

  test("a package can require its own exported name before searching node_modules", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("self-widget");',
      "package.json": '{"name":"self-widget","exports":"./own.cjs"}',
      "own.cjs": 'module.exports = "self";',
      "node_modules/self-widget/index.js": 'module.exports = "external";'
    });
  });

  test("scoped self-reference resolves exported subpaths", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./lib/importer.cjs");',
      "lib/importer.cjs": 'module.exports = require("@example/self/helper");',
      "package.json": '{"name":"@example/self","exports":{"./helper":"./helper.cjs"}}',
      "helper.cjs": "module.exports = 14;"
    });
  });

  test("a package name without exports does not create a self-reference", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("self-widget");',
      "package.json": '{"name":"self-widget","main":"./own.cjs"}',
      "own.cjs": 'module.exports = "self";',
      "node_modules/self-widget/index.js": 'module.exports = "external";'
    });
  });

  test("null exports disables external encapsulation and uses legacy package main", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("widget");',
      "node_modules/widget/package.json": '{"main":"./main.cjs","exports":null}',
      "node_modules/widget/main.cjs": "module.exports = 15;"
    });
  });

  test("null exports does not create a self-reference and allows an external package", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("self-widget");',
      "package.json": '{"name":"self-widget","exports":null}',
      "node_modules/self-widget/index.js": 'module.exports = "external";'
    });
  });

  test("the nearest package scope shadows an outer self-reference", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./inner/importer.cjs");',
      "package.json": '{"name":"self-widget","exports":"./own.cjs"}',
      "own.cjs": 'module.exports = "self";',
      "inner/package.json": '{}',
      "inner/importer.cjs": 'module.exports = require("self-widget");',
      "node_modules/self-widget/index.js": 'module.exports = "external";'
    });
  });

  test("an unexported self-reference subpath cannot escape to an external copy", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("self-widget/private");',
      "package.json": '{"name":"self-widget","exports":"./own.cjs"}',
      "own.cjs": "module.exports = 1;",
      "node_modules/self-widget/private.js": "module.exports = 2;"
    });
  });

  test("a package name prefix without a slash does not match self-reference", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("self-widget-extra");',
      "package.json": '{"name":"self-widget","exports":"./own.cjs"}',
      "own.cjs": 'module.exports = "self";',
      "node_modules/self-widget-extra/index.js": 'module.exports = "external";'
    });
  });

  test("a relative-looking package name can intercept a matching relative self-reference", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./self");',
      "package.json": '{"name":"./self","exports":"./own.cjs"}',
      "own.cjs": 'module.exports = "self";',
      "self.js": 'module.exports = "local file";'
    });
  });

  for (const request of ['"./dependency.cjs"', '__dirname + "/dependency.cjs"']) {
    test(`local import ${request} validates its caller package before loading a CommonJS file`, () => {
      compareModuleGraph({
        "entry.cjs": `
          try { require(${request}); }
          catch (error) { module.exports = { name: error.name, code: error.code }; }
        `,
        "package.json": '{"name":7}',
        "dependency.cjs": "module.exports = 1;"
      });
    });
  }
});

describe("builtin requests remain distinct from installed packages", () => {
  test("package imports requests remain an explicit analysis gap", () => {
    withModuleGraphFixture({
      "entry.cjs": 'module.exports = require("#internal");',
      "package.json": '{"imports":{"#internal":"./internal.cjs"}}',
      "internal.cjs": "module.exports = 1;"
    }, (files, directory) => {
      expect(() => createCommonJSLoader(files).load(
        join(directory, "entry.cjs"), nodeInitialExecutionContext
      )).toThrow(/imports.*(unsupported|not yet supported)|(unsupported|not yet supported).*imports/i);
    });
  });

  for (const name of ["sea", "sqlite", "test"]) {
    test(`the prefix-only builtin name ${name} is an ordinary package without node:`, () => {
      compareModuleGraph({
        "entry.cjs": `module.exports = require("${name}");`,
        [`node_modules/${name}/index.js`]: `module.exports = "${name} package";`
      });
    });
  }

  test("test/reporters without node: is an ordinary package subpath", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("test/reporters");',
      "node_modules/test/reporters.js": 'module.exports = "package reporters";'
    });
  });

  test("an unknown node: request throws ERR_UNKNOWN_BUILTIN_MODULE", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("node:prophet-does-not-exist");'
    });
  });

  for (const request of [
    "fs", "fs/promises", "_http_agent", "assert/strict", "path/posix", "inspector/promises",
    "node:fs", "node:sea", "node:sqlite", "node:test", "node:test/reporters"
  ]) {
    test(`the builtin ${request} stops analysis instead of loading a package with that name`, () => {
      withModuleGraphFixture({
        "entry.cjs": `module.exports = require(${JSON.stringify(request)});`,
        [`node_modules/${request}/index.js`]: 'module.exports = "shadow";'
      }, (files, directory) => {
        expect(() => createCommonJSLoader(files).load(
          join(directory, "entry.cjs"), nodeInitialExecutionContext
        )).toThrow(/builtin.*(unsupported|not yet supported)|(unsupported|not yet supported).*builtin/i);
      });
    });
  }
});
