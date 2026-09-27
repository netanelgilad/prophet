import { join } from "path";
import { createCommonJSLoader, isThrownValue, nodeInitialExecutionContext } from "../src";
import { getProperties } from "../src/execution-context/Heap";
import { WithProperties } from "../src/types";
import {
  assertPinnedNode, compareModuleGraph, nodeModuleObservation, withModuleGraphFixture
} from "./commonjs/oracle";

beforeAll(assertPinnedNode);

describe("CommonJS source-graph loading agrees with Node 24.21.0", () => {
  test("a dependency initializes once and repeated require preserves its object identity", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsRuns = 0;
        const first = require("./counter.cjs");
        const second = require("./counter.cjs");
        module.exports = { same: first === second, runs: commonjsRuns, value: second.value };
      `,
      "counter.cjs": "commonjsRuns = commonjsRuns + 1; exports.value = commonjsRuns;"
    });
  });

  test("different importers share the same live exported object", () => {
    compareModuleGraph({
      "entry.cjs": `
        const left = require("./left.cjs");
        const right = require("./nested/right.cjs");
        left.value = 7;
        module.exports = { same: left === right, value: right.value };
      `,
      "left.cjs": 'module.exports = require("./state.cjs");',
      "nested/right.cjs": 'module.exports = require("../state.cjs");',
      "state.cjs": "exports.value = 1;"
    });
  });

  test("each cached require reads the module object's current exports", () => {
    compareModuleGraph({
      "entry.cjs": `
        const original = require("./replace.cjs");
        original.replace();
        const current = require("./replace.cjs");
        module.exports = { same: original === current, old: original.value, current: current.value };
      `,
      "replace.cjs": `
        exports.value = 1;
        exports.replace = function () { module.exports = { value: 2 }; };
      `
    });
  });

  for (const value of ["undefined", "null", "false", "0", "-0", '""', "(0 / 0)"]) {
    test(`a cached ${value} export does not cause another initialization`, () => {
      compareModuleGraph({
        "entry.cjs": `
          commonjsRuns = 0;
          const first = require("./value.cjs");
          const second = require("./value.cjs");
          module.exports = { first: first, second: second, runs: commonjsRuns };
        `,
        "value.cjs": `commonjsRuns = commonjsRuns + 1; module.exports = ${value};`
      });
    });
  }

  test("an escaped require resolves from the module that created it", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./nested/factory.cjs");',
      "nested/factory.cjs": `
        const saved = require;
        module.exports = function () {
          return saved("./value.cjs").value + saved("../value.cjs").value;
        };
      `,
      "nested/value.cjs": "exports.value = 3;",
      "value.cjs": "exports.value = 7;"
    }, "entry.cjs", "loaded()");
  });

  test("absolute and normalized relative paths reach the same cached module", () => {
    compareModuleGraph({
      "entry.cjs": `
        const relative = require("./nested/../value.cjs");
        const absolute = require(__dirname + "/value.cjs");
        module.exports = { same: relative === absolute, value: absolute.value };
      `,
      "nested/unused.cjs": "",
      "value.cjs": "exports.value = 9;"
    });
  });

  test("dependency wrappers keep declarations private from their importer", () => {
    compareModuleGraph({
      "entry.cjs": `
        const privateValue = 1;
        const dependency = require("./private.cjs");
        module.exports = { own: privateValue, other: dependency(), leaked: typeof dependencyOnly };
      `,
      "private.cjs": `
        const privateValue = 2;
        const dependencyOnly = 3;
        module.exports = function () { return privateValue + dependencyOnly; };
      `
    });
  });

  test("a cycle observes partial exports and retains their object identity", () => {
    compareModuleGraph({
      "entry.cjs": `
        const a = require("./a.cjs");
        const b = require("./b.cjs");
        module.exports = { during: b.during, after: b.a.phase, same: b.a === a };
      `,
      "a.cjs": 'exports.phase = "starting"; require("./b.cjs"); exports.phase = "finished";',
      "b.cjs": 'exports.a = require("./a.cjs"); exports.during = exports.a.phase;'
    });
  });

  test("replacing exports during a cycle does not replace an already shared partial object", () => {
    compareModuleGraph({
      "entry.cjs": `
        const a = require("./a.cjs");
        const b = require("./b.cjs");
        module.exports = { current: a.phase, partial: b.a.phase, same: a === b.a };
      `,
      "a.cjs": `
        exports.phase = "partial";
        require("./b.cjs");
        module.exports = { phase: "replacement" };
      `,
      "b.cjs": 'exports.a = require("./a.cjs");'
    });
  });

  test("loaded is false inside initialization and true in an escaped closure afterward", () => {
    compareModuleGraph({
      "entry.cjs": `
        const during = module.loaded;
        module.exports = function () {
          return {
            during: during, after: module.loaded,
            id: module.id === __filename, filename: module.filename === __filename,
            path: module.path === __dirname
          };
        };
      `
    }, "entry.cjs", "loaded()");
  });

  test("top-level return still marks the module loaded and retains its cache entry", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsRuns = 0;
        const first = require("./return.cjs");
        const second = require("./return.cjs");
        module.exports = { same: first === second, loaded: first(), runs: commonjsRuns };
      `,
      "return.cjs": `
        commonjsRuns = commonjsRuns + 1;
        module.exports = function () { return module.loaded; };
        return 99;
        commonjsRuns = 100;
      `
    });
  });

  test("failed initialization retries its body but keeps effects and successful dependencies", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsAttempts = 0;
        commonjsChildRuns = 0;
        commonjsTrace = "";
        function attempt() {
          try { require("./failure.cjs"); } catch (error) { return error; }
        }
        const first = attempt();
        const second = attempt();
        module.exports = {
          first: first, second: second, attempts: commonjsAttempts,
          children: commonjsChildRuns, child: require("./child.cjs").value, trace: commonjsTrace
        };
      `,
      "failure.cjs": `
        commonjsAttempts = commonjsAttempts + 1;
        commonjsTrace = commonjsTrace + "P";
        require("./child.cjs");
        try { throw "failed"; } finally { commonjsTrace = commonjsTrace + "F"; }
      `,
      "child.cjs": `
        commonjsChildRuns = commonjsChildRuns + 1;
        commonjsTrace = commonjsTrace + "C";
        exports.value = 7;
      `
    });
  });

  test("a retry gets fresh exports and a successful retry is then cached", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsAttempts = 0;
        commonjsPartial = null;
        try { require("./retry.cjs"); } catch (error) {}
        const second = require("./retry.cjs");
        const third = require("./retry.cjs");
        module.exports = { fresh: second.fresh, attempts: commonjsAttempts, same: second === third };
      `,
      "retry.cjs": `
        commonjsAttempts = commonjsAttempts + 1;
        if (commonjsAttempts === 1) { commonjsPartial = exports; throw "retry"; }
        exports.fresh = exports !== commonjsPartial;
      `
    });
  });

  test("a failed module remains unloaded even when its partial state escapes", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsFailedState = null;
        try { require("./failure.cjs"); } catch (error) {}
        module.exports = commonjsFailedState();
      `,
      "failure.cjs": `
        commonjsFailedState = function () { return module.loaded; };
        throw "failed";
      `
    });
  });

  test("a completed cyclic dependency keeps the old partial exports after its parent retries", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsAttempts = 0;
        try { require("./parent.cjs"); } catch (error) {}
        const current = require("./parent.cjs");
        const child = require("./child.cjs");
        module.exports = {
          current: current.attempt, retained: child.parent.attempt,
          same: current === child.parent, attempts: commonjsAttempts
        };
      `,
      "parent.cjs": `
        commonjsAttempts = commonjsAttempts + 1;
        exports.attempt = commonjsAttempts;
        require("./child.cjs");
        if (commonjsAttempts === 1) throw "failed";
      `,
      "child.cjs": 'exports.parent = require("./parent.cjs");'
    });
  });

  test("syntax failures can be caught repeatedly as JavaScript SyntaxError values", () => {
    compareModuleGraph({
      "entry.cjs": `
        function attempt() {
          try { require("./invalid.cjs"); } catch (error) { return error.name; }
        }
        module.exports = { first: attempt(), second: attempt() };
      `,
      "invalid.cjs": "const broken = ;"
    });
  });

  test("a missing exact filename throws MODULE_NOT_FOUND and execution may continue", () => {
    compareModuleGraph({
      "entry.cjs": `
        try { require("./missing.cjs"); }
        catch (error) { exports.name = error.name; exports.code = error.code; }
        exports.after = require("./value.cjs");
      `,
      "value.cjs": "module.exports = 42;"
    });
  });

  test("invalid concrete requests have Node's argument-error names and codes", () => {
    compareModuleGraph({
      "entry.cjs": `
        function attempt(value) {
          try { require(value); }
          catch (error) { return { name: error.name, code: error.code }; }
        }
        module.exports = {
          empty: attempt(""), number: attempt(1), nil: attempt(null),
          absent: attempt(undefined), boolean: attempt(false), object: attempt({})
        };
      `
    });
  });

  test("the loader captures supplied source instead of retaining the caller's mutable map", () => {
    withModuleGraphFixture({ "entry.cjs": "module.exports = 7;" }, (files, directory) => {
      const filename = join(directory, "entry.cjs");
      const loader = createCommonJSLoader(files);
      files[filename] = "module.exports = 99;";
      const [loaded] = loader.load(filename, nodeInitialExecutionContext);
      expect(loaded).toMatchObject({ type: "number", value: 7 });
      expect(nodeModuleObservation(filename)).toEqual({
        kind: "return", value: { type: "number", value: "7" }
      });
    });
  });
});

describe("explicit source-graph loader boundaries", () => {
  test("loader errors expose name and code while unmodeled error fields stop analysis", () => {
    for (const request of ['"./missing.cjs"', '""', "1"]) {
      for (const field of ["message", "stack", "requireStack"]) {
        withModuleGraphFixture({
          "entry.cjs": `try { require(${request}); } catch (error) { module.exports = error.${field}; }`
        }, (files, directory) => {
          expect(() => createCommonJSLoader(files).load(
            join(directory, "entry.cjs"), nodeInitialExecutionContext
          )).toThrow(/Unmodeled host property/);
        });
      }
    }
  });

  test("a file on disk is unavailable until its source is explicitly supplied", () => {
    withModuleGraphFixture({
      "entry.cjs": 'module.exports = require("./disk-only.cjs");',
      "disk-only.cjs": "module.exports = 42;"
    }, (files, directory) => {
      const filename = join(directory, "entry.cjs");
      delete files[join(directory, "disk-only.cjs")];
      const [loaded, context] = createCommonJSLoader(files).load(filename, nodeInitialExecutionContext);
      expect(isThrownValue(loaded)).toBe(true);
      if (!isThrownValue(loaded)) throw new Error("Expected an interpreted missing-source error");
      expect(getProperties(loaded.value as WithProperties, context).code)
        .toMatchObject({ type: "string", value: "MODULE_NOT_FOUND" });
      // The oracle can read the actual file. Prophet intentionally has only the
      // supplied snapshot, so disk contents never become an execution fallback.
      expect(nodeModuleObservation(filename)).toEqual({
        kind: "return", value: { type: "number", value: "42" }
      });
    });
  });

  test("builtin requests remain explicit analysis gaps", () => {
    for (const request of ["fs", "node:fs"]) {
      withModuleGraphFixture({
        "entry.cjs": `module.exports = require(${JSON.stringify(request)});`,
        "value.cjs": "module.exports = 1;",
        "folder/index.cjs": "module.exports = 4;"
      }, (files, directory) => {
        const loader = createCommonJSLoader(files);
        expect(() => loader.load(join(directory, "entry.cjs"), nodeInitialExecutionContext))
          .toThrow(/unsupported|not yet supported|exact.*\.cjs/i);
      });
    }
  });

  test("unmodeled metadata and require interfaces fail explicitly", () => {
    for (const expression of [
      "module.require", "module.children", "module.parent", "module.paths",
      "require.resolve", "require.cache", "require.main", "require.extensions"
    ]) {
      withModuleGraphFixture({ "entry.cjs": `module.exports = ${expression};` }, (files, directory) => {
        expect(() => createCommonJSLoader(files).load(
          join(directory, "entry.cjs"), nodeInitialExecutionContext
        )).toThrow(/Unmodeled host property/);
      });
    }
  });

  test("metadata writes are rejected until their loader effects are modeled", () => {
    for (const property of ["id", "filename", "path", "loaded"]) {
      withModuleGraphFixture({ "entry.cjs": `module.${property} = "changed";` }, (files, directory) => {
        expect(() => createCommonJSLoader(files).load(
          join(directory, "entry.cjs"), nodeInitialExecutionContext
        )).toThrow(/Unmodeled|unsupported|not yet supported/i);
      });
    }
  });
});
