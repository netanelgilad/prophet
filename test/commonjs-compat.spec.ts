import { evaluateCommonJS, nodeInitialExecutionContext } from "../src";
import {
  ExecutionContext, setVariablesInScope
} from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { ESNumber, isThrownValue } from "../src/types";
import {
  assertPinnedNode, compareModule, nodeModuleObservation, withModuleFixture
} from "./commonjs/oracle";

beforeAll(assertPinnedNode);

describe("CommonJS source execution agrees with Node 24.21.0", () => {
  test("an empty module starts with a fresh exports object", () => {
    compareModule("");
  });

  test("BOM and hashbang acceptance matches the pinned Node parser", () => {
    for (const prefix of ["\ufeff", "#!/usr/bin/env node\n", "\ufeff#!/usr/bin/env node\n"]) {
      compareModule(prefix + "module.exports = 42;");
    }
  });

  test("exports initially aliases module.exports and the wrapper receiver", () => {
    compareModule(`
      exports.alias = exports === module.exports;
      exports.receiver = this === exports;
      exports.answer = 42;
    `);
  });

  test("replacing module.exports leaves exports and this on the initial object", () => {
    compareModule(`
      const initial = exports;
      module.exports = { answer: 42 };
      exports.ignored = true;
      module.exports.oldAlias = exports === initial;
      module.exports.oldReceiver = this === initial;
      module.exports.newAlias = exports === module.exports;
      module.exports.ignored = typeof module.exports.ignored;
    `);
  });

  test("reassigning exports does not replace module.exports", () => {
    compareModule(`
      exports.saved = 1;
      exports = { replacement: 2 };
      exports.saved = 3;
    `);
  });

  test("exports can be rebound to the replacement object", () => {
    compareModule(`
      module.exports = { value: 1 };
      exports = module.exports;
      exports.value = 2;
    `);
  });

  test("reassigning the module parameter does not replace the loader's module object", () => {
    compareModule(`
      exports.saved = 1;
      module = { exports: { replacement: 2 } };
      module.exports.saved = 3;
    `);
  });

  for (const value of ["undefined", "null", "false", "0", "-0", '"exported"', "(0 / 0)"]) {
    test(`module.exports may be ${value}`, () => {
      compareModule(`module.exports = ${value};`);
    });
  }

  test("wrapper parameters and receiver are available in sloppy and strict modules", () => {
    for (const directive of ["", '"use strict";']) {
      compareModule(`${directive}
        module.exports = {
          exports: typeof exports,
          require: typeof require,
          module: typeof module,
          filename: __filename,
          dirname: __dirname,
          receiver: this === exports
        };
      `);
    }
  });

  test("a strict caller does not impose strict mode on a sloppy module", () => {
    const callerThis = ESObject({ caller: ESNumber(1) });
    const initial = ExecutionContext({
      ...nodeInitialExecutionContext.value, strict: true, thisValue: callerThis
    });
    const result = compareModule(`
      commonjsSloppyAssignment = 7;
      module.exports = commonjsSloppyAssignment;
    `, "", initial);
    expect(result.context.value.strict).toBe(true);
    expect(result.context.value.thisValue).toBe(callerThis);
    expect(result.context.value.environment).toBe(initial.value.environment);
  });

  test("a strict module restores its sloppy caller's mode and receiver after return or throw", () => {
    const callerThis = ESObject({ caller: ESNumber(2) });
    const initial = ExecutionContext({
      ...nodeInitialExecutionContext.value, strict: false, thisValue: callerThis
    });
    for (const source of [
      '"use strict"; module.exports = 42;',
      '"use strict"; commonjsStrictAssignment = 7;'
    ]) {
      const result = compareModule(source, "", initial);
      expect(result.context.value.strict).toBe(false);
      expect(result.context.value.thisValue).toBe(callerThis);
      expect(result.context.value.environment).toBe(initial.value.environment);
    }
  });

  test("var declarations of wrapper parameters preserve their supplied values", () => {
    compareModule(`
      var exports, require, module, __filename, __dirname;
      exports.observation = typeof require + ":" + typeof __filename + ":" + typeof __dirname;
    `);
  });

  test("direct eval sees the module's own parameters and private locals", () => {
    compareModule(`
      const privateValue = 7;
      eval("exports.answer = privateValue; exports.alias = exports === module.exports;");
    `);
  });

  test("indirect eval reads and writes the modeled global object", () => {
    compareModule(`
      const indirect = eval;
      indirect("commonjsGlobalValue = 7;");
      module.exports = {
        binding: commonjsGlobalValue,
        property: indirect("this.commonjsGlobalValue;")
      };
    `);
  });

  test("strict indirect eval keeps its var declarations local", () => {
    compareModule(`
      const indirect = eval;
      module.exports = {
        result: indirect('"use strict"; var commonjsStrictLocal = 7; commonjsStrictLocal;'),
        outside: typeof commonjsStrictLocal,
        property: indirect("typeof this.commonjsStrictLocal;")
      };
    `);
  });

  test("a hoisted function declaration may replace a wrapper parameter", () => {
    compareModule(`
      module.exports = require();
      function require() { return "local require"; }
    `);
  });

  test("nested block lexical declarations can shadow wrapper parameters", () => {
    compareModule(`
      {
        const require = 42;
        exports.value = require;
      }
      exports.outer = typeof require;
    `);
  });

  test("private declarations are hoisted and do not leak to the caller", () => {
    const initial = setVariablesInScope(nodeInitialExecutionContext, { privateValue: ESNumber(99) });
    const result = compareModule(`
      exports.before = typeof privateValue;
      exports.called = helper();
      var privateValue = 7;
      let lexicalValue = 8;
      const constantValue = 9;
      function helper() { return 6; }
      exports.after = privateValue + lexicalValue + constantValue;
    `, "", initial);
    expect(result.context.value.scope.privateValue).toMatchObject({ value: 99 });
    expect(result.context.value.scope.lexicalValue).toBeUndefined();
    expect(result.context.value.scope.constantValue).toBeUndefined();
    expect(result.context.value.scope.helper).toBeUndefined();
    expect(result.context.value.environment).toBe(initial.value.environment);
  });

  test("a module cannot see caller lexical variables", () => {
    const initial = setVariablesInScope(nodeInitialExecutionContext, {
      callerOnly: ESNumber(99), arguments: ESNumber(123)
    });
    compareModule('module.exports = typeof callerOnly;', "", initial);
    compareModule('module.exports = callerOnly;', "", initial);
  });

  test("an exported closure keeps private module state after its body finishes", () => {
    compareModule(`
      let total = 4;
      module.exports = function (value) {
        total = total + value;
        return total;
      };
    `, "loaded(3) + loaded(5)");
  });

  test("top-level return stops the module but does not become its export", () => {
    compareModule(`
      exports.before = 1;
      return 99;
      exports.after = 2;
    `);
  });

  test("the final expression statement does not become the export", () => {
    compareModule("exports.value = 1; 99;");
  });

  test("a finally block can replace exports while returning", () => {
    compareModule(`
      try { exports.before = 1; return 99; }
      finally { module.exports = { final: 2 }; }
    `);
  });

  test("throws propagate and finally keeps its earlier object mutations", () => {
    compareModule(`
      exports.value = 1;
      try { throw exports; }
      finally { exports.value = 2; }
    `);
  });

  test("primitive throws stay primitive", () => {
    compareModule('throw "module failure";');
  });

  for (const source of [
    "const exports = 1;",
    '"use strict"; let module = 1;',
    "const broken = ;",
    "}); module.exports = 42; (function () {",
    "/*"
  ]) {
    test(`wrapper compilation rejects invalid source: ${source}`, () => {
      const result = compareModule(source);
      expect(isThrownValue(result.loaded)).toBe(true);
      expect(result.actual).toEqual({ kind: "throw", error: "SyntaxError" });
    });
  }
});

describe("explicit first-layer analysis gaps", () => {
  test("indirect eval global declarations require global object-backed bindings", () => {
    for (const definition of [
      { source: "var commonjsGlobalValue = 7;", read: "commonjsGlobalValue" },
      {
        source: "function commonjsGlobalValue() { return 7; }",
        read: "commonjsGlobalValue()"
      }
    ]) {
      const source = `
        const indirect = eval;
        indirect(${JSON.stringify(definition.source)});
        module.exports = {
          binding: ${definition.read},
          property: indirect("this.${definition.read};")
        };
      `;
      withModuleFixture(source, filename => {
        // Node exposes the same value through a global binding and property.
        // A private module-root binding would silently invent different behavior.
        expect(nodeModuleObservation(filename)).toEqual({
          kind: "return", value: {
            type: "object", entries: [
              ["binding", { type: "number", value: "7" }],
              ["property", { type: "number", value: "7" }]
            ]
          }
        });
        expect(() => evaluateCommonJS(source, filename, nodeInitialExecutionContext))
          .toThrow(/global.*declaration/i);
      });
    }
  });

  test("the source execution API requires an already resolved absolute filename", () => {
    expect(() => evaluateCommonJS("", "relative.cjs", nodeInitialExecutionContext))
      .toThrow(/absolute filename/);
  });

  test("require calls are unsupported until module loading is implemented", () => {
    withModuleFixture('module.exports = require("./other");', filename => {
      expect(() => evaluateCommonJS(
        'module.exports = require("./other");', filename, nodeInitialExecutionContext
      )).toThrow(/CommonJS require loading is not yet supported/);
    });
  });

  test("implicit arguments access cannot accidentally read the caller's binding", () => {
    const initial = setVariablesInScope(nodeInitialExecutionContext, { arguments: ESNumber(123) });
    for (const source of [
      "module.exports = arguments;",
      "module.exports = typeof arguments;",
      'module.exports = eval("arguments");'
    ]) {
      withModuleFixture(source, filename => {
        expect(() => evaluateCommonJS(source, filename, initial)).toThrow(/arguments/i);
      });
    }
  });

  test("unmodeled loader metadata is rejected instead of becoming undefined", () => {
    for (const source of [
      "module.exports = module.loaded;",
      "module.exports = module.filename;",
      "module.exports = module.id;",
      "module.loaded = true;",
      "module.exports = require.resolve;",
      "module.exports = require.cache;",
      "module.exports = require.main;"
    ]) {
      withModuleFixture(source, filename => {
        expect(() => evaluateCommonJS(source, filename, nodeInitialExecutionContext))
          .toThrow(/Unmodeled host property.*CommonJS (module metadata|require API)/);
      });
    }
  });
});
