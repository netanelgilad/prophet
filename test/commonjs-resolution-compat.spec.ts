import { join } from "path";
import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { assertPinnedNode, compareModuleGraph, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

describe("local CommonJS resolution agrees with Node 24.21.0", () => {
  test("the embedding API can load an explicitly CommonJS .js entry", () => {
    compareModuleGraph({
      "package.json": '{"type":"commonjs"}',
      "entry.js": "module.exports = 6;"
    }, "entry.js");
  });

  test("unambiguous JavaScript sources load through an omitted .js extension", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.js": "module.exports = { value: 7, filename: __filename === module.filename };"
    });
  });

  test("an exact extensionless file wins over .js and ignores the package type", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "package.json": '{"type":"module"}',
      "value": 'module.exports = "extensionless";',
      "value.js": 'export default "module";'
    });
  });

  test("an exact file wins over extension probing", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value.cjs");',
      "value.cjs": 'module.exports = "exact";',
      "value.cjs.js": 'module.exports = "extension";'
    });
  });

  test("the .js probe wins over .json and directory index", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.js": 'module.exports = "javascript";',
      "value.json": '"json"',
      "value/index.js": 'module.exports = "directory";'
    });
  });

  test("the .json probe wins over a directory index", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.json": '{"kind":"json"}',
      "value/index.js": 'module.exports = "directory";'
    });
  });

  test("finding a file does not fall back to later candidates when that file throws", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.js": 'throw "selected file failed";',
      "value.json": '"json"',
      "value/index.js": 'module.exports = "directory";'
    });
  });

  test("invalid JSON selected by an extension probe does not fall back to a directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.json": "{",
      "value/index.js": 'module.exports = "directory";'
    });
  });

  test("a winning file probe never reads the losing directory's malformed metadata", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value");',
      "value.js": 'module.exports = "file";',
      "value/package.json": "{",
      "value/index.js": 'module.exports = "directory";'
    });
  });

  test("a requested extension can itself receive a .js probe", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./missing.cjs");',
      "missing.cjs.js": "module.exports = 9;"
    });
  });

  test(".cjs is not one of the automatic file or index extensions", () => {
    compareModuleGraph({
      "entry.cjs": `
        function attempt(path) {
          try { require(path); }
          catch (error) { return { name: error.name, code: error.code }; }
        }
        module.exports = { file: attempt("./value"), directory: attempt("./folder") };
      `,
      "value.cjs": "module.exports = 1;",
      "folder/index.cjs": "module.exports = 2;"
    });
  });

  test("extension probes, normalized paths, and absolute paths share the resolved file's cache", () => {
    compareModuleGraph({
      "entry.cjs": `
        commonjsResolutionRuns = 0;
        const first = require("./nested/../value");
        const second = require(__dirname + "/value.js");
        const third = require("./value.js");
        module.exports = { same: first === second && second === third, runs: commonjsResolutionRuns };
      `,
      "nested/unused.cjs": "",
      "value.js": "commonjsResolutionRuns = commonjsResolutionRuns + 1; exports.value = 7;"
    });
  });

  test("a directory defaults to index.js before index.json", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/index.js": 'module.exports = "javascript";',
      "folder/index.json": '"json"'
    });
  });

  test("a directory can default to index.json", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder/");',
      "folder/index.json": '{"kind":"json"}'
    });
  });

  for (const request of ["./folder/", "./folder/.", "./folder/unused/.."]) {
    test(`directory intent in ${request} survives path normalization`, () => {
      compareModuleGraph({
        "entry.cjs": `module.exports = require(${JSON.stringify(request)});`,
        "folder.js": 'module.exports = "file";',
        "folder/index.js": 'module.exports = "directory";'
      });
    });
  }

  test("the relative requests dot and dot-dot refer to directories", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder/importer.cjs");',
      "index.js": "module.exports = 2;",
      "folder/index.js": "module.exports = 3;",
      "folder/importer.cjs": 'module.exports = { own: require("."), parent: require("..") };'
    });
  });

  for (const main of ["./lib/value", "./lib/value.js"]) {
    test(`package main ${main} resolves before root index`, () => {
      compareModuleGraph({
        "entry.cjs": 'module.exports = require("./folder");',
        "folder/package.json": JSON.stringify({ main }),
        "folder/lib/value.js": 'module.exports = "main";',
        "folder/index.js": 'module.exports = "index";'
      });
    });
  }

  test("package main may refer to JSON data", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./data"}',
      "folder/data.json": '{"value":8}'
    });
  });

  test("package main drops its trailing slash before exact file and extension probing", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./value/"}',
      "folder/value": 'module.exports = "exact extensionless";',
      "folder/value.js": 'module.exports = "extension";'
    });
  });

  test("package main probes a directory index without following a nested package main", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./lib"}',
      "folder/lib/package.json": '{"main":"./different.cjs"}',
      "folder/lib/different.cjs": 'module.exports = "nested main";',
      "folder/lib/index.js": 'module.exports = "main index";'
    });
  });

  test("an unavailable package main falls back to the package root index", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./missing"}',
      "folder/index.js": 'module.exports = "fallback";'
    });
  });

  test("an unavailable package main and index throw MODULE_NOT_FOUND", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./missing"}'
    });
  });

  for (const main of [undefined, "", null, false, 7, {}]) {
    test(`a missing, empty, or nonstring main ${JSON.stringify(main)} uses the package index`, () => {
      compareModuleGraph({
        "entry.cjs": 'module.exports = require("./folder");',
        "folder/package.json": JSON.stringify({ main }),
        "folder/index.js": "module.exports = 5;"
      });
    });
  }

  test("a package main can resolve outside its own directory", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"../shared.cjs"}',
      "shared.cjs": "module.exports = 12;"
    });
  });

  test("local directory requests ignore package exports", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder");',
      "folder/package.json": '{"main":"./main.cjs","exports":"./exported.cjs"}',
      "folder/main.cjs": 'module.exports = "main";',
      "folder/exported.cjs": 'module.exports = "exports";'
    });
  });

  test("mutating a required package.json object does not rewrite package resolution metadata", () => {
    compareModuleGraph({
      "entry.cjs": `
        const metadata = require("./folder/package.json");
        metadata.main = "./changed.cjs";
        module.exports = require("./folder");
      `,
      "folder/package.json": '{"main":"./original.cjs"}',
      "folder/original.cjs": 'module.exports = "original";',
      "folder/changed.cjs": 'module.exports = "changed";'
    });
  });

  for (const source of ["[]", "null", '"text"', '{"type":7}', '{"name":false}']) {
    test(`invalid package metadata ${source} has Node's error name and code`, () => {
      compareModuleGraph({
        "entry.cjs": 'module.exports = require("./folder");',
        "folder/package.json": source,
        "folder/index.cjs": "module.exports = 1;"
      });
    });
  }

  test("a nearest commonjs package scope permits .js within an outer module scope", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder/value.js");',
      "package.json": '{"type":"module"}',
      "folder/package.json": '{"type":"commonjs"}',
      "folder/value.js": "module.exports = 7;"
    });
  });

  test("a nearest package without type shadows an outer module scope", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./folder/value.js");',
      "package.json": '{"type":"module"}',
      "folder/package.json": '{}',
      "folder/value.js": "module.exports = 8;"
    });
  });

  test("an unknown string package type leaves unambiguous JavaScript as CommonJS", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./value.js");',
      "package.json": '{"type":"custom"}',
      "value.js": "module.exports = 9;"
    });
  });

  test("a relative dependency beneath node_modules does not inherit an outer package type", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./node_modules/dependency/value.js");',
      "package.json": '{"type":"module"}',
      "node_modules/dependency/value.js": "module.exports = 11;"
    });
  });

  test("explicit .cjs and .json files do not use package scope to choose their format", () => {
    compareModuleGraph({
      "entry.cjs": `
        module.exports = { code: require("./folder/value.cjs"), data: require("./folder/data.json") };
      `,
      "folder/package.json": '{"type":"module"}',
      "folder/value.cjs": "module.exports = 3;",
      "folder/data.json": "4"
    });
  });

  test("invalid syntax in an explicitly commonjs .js file is a catchable SyntaxError", () => {
    compareModuleGraph({
      "entry.cjs": 'try { require("./value.js"); } catch (error) { module.exports = error.name; }',
      "package.json": '{"type":"commonjs"}',
      "value.js": "const broken = ;"
    });
  });

  test("an exact hidden .cjs filename is explicitly CommonJS, including syntax errors", () => {
    compareModuleGraph({
      "entry.cjs": 'try { require("./.cjs"); } catch (error) { module.exports = error.name; }',
      "package.json": '{"type":"module"}',
      ".cjs": "const broken = ;"
    });
  });

  test("an exact hidden .json filename uses the default JavaScript handler", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./.json");',
      ".json": "module.exports = 13;"
    });
  });
});

describe("JSON modules agree with Node 24.21.0", () => {
  test("the embedding API can load a JSON entry directly", () => {
    compareModuleGraph({ "entry.json": '{"value":6}' }, "entry.json");
  });

  test("JSON values become normal VM objects, arrays, and primitives", () => {
    compareModuleGraph({
      "entry.cjs": `
        const data = require("./data.json");
        module.exports = {
          string: data.string, number: data.number, boolean: data.boolean, nil: data.nil,
          length: data.array.length, first: data.array[0], nested: data.array[1].value,
          zero: data.zero, large: data.large, duplicate: data.duplicate,
          prototypeKey: data.__proto__.value, constructorKey: data.constructor
        };
      `,
      "data.json": '{"string":"hello","number":2,"boolean":false,"nil":null,' +
        '"array":[1,{"value":3}],"zero":-0,"large":1e400,"duplicate":1,"duplicate":2,' +
        '"__proto__":{"value":4},"constructor":"own"}'
    });
  });

  for (const value of ["null", "false", "0", '""']) {
    test(`a JSON root may be ${value}`, () => {
      compareModuleGraph({
        "entry.cjs": 'module.exports = require("./data.json");',
        "data.json": value
      });
    });
  }

  test("JSON aliases share identity and later reads see object and array mutations", () => {
    compareModuleGraph({
      "entry.cjs": `
        const first = require("./data");
        first.value = 8;
        first.items[0] = 9;
        const second = require("./data.json");
        module.exports = { same: first === second, value: second.value, first: second.items[0] };
      `,
      "data.json": '{"value":1,"items":[2]}'
    });
  });

  test("one leading BOM is accepted in JSON data", () => {
    compareModuleGraph({
      "entry.cjs": 'module.exports = require("./data.json");',
      "data.json": '\uFEFF{"value":7}'
    });
  });

  for (const source of ["{", '\uFEFF\uFEFF{"value":7}', ' \uFEFF{"value":7}']) {
    test(`invalid JSON ${JSON.stringify(source)} throws a fresh SyntaxError on every require`, () => {
      compareModuleGraph({
        "entry.cjs": `
          function attempt() { try { require("./data.json"); } catch (error) { return error; } }
          const first = attempt();
          const second = attempt();
          module.exports = { first: first.name, second: second.name, fresh: first !== second };
        `,
        "data.json": source
      });
    });
  }

  test("a failed JavaScript importer retains a successfully cached JSON dependency", () => {
    compareModuleGraph({
      "entry.cjs": `
        try { require("./failure.cjs"); } catch (error) {}
        module.exports = require("./data.json");
      `,
      "failure.cjs": 'require("./data.json").value = 8; throw "failed";',
      "data.json": '{"value":1}'
    });
  });
});

describe("local module resolution analysis boundaries", () => {
  test("requests containing null bytes remain explicit filesystem analysis gaps", () => {
    withModuleGraphFixture({
      "entry.cjs": 'module.exports = require("./value\\0suffix");',
      "value.js": "module.exports = 1;"
    }, (files, directory) => {
      expect(() => createCommonJSLoader(files).load(join(directory, "entry.cjs"), nodeInitialExecutionContext))
        .toThrow(/CommonJS requests with null bytes .*not yet supported/);
    });
  });

  for (const [filename, source, packageSource] of [
    ["value.mjs", "export default 1;", "{}"],
    ["value.js", "export default 1;", '{"type":"module"}'],
    ["value.js", "module.exports = 1;", '{"type":"module"}'],
    ["value.js", "export default 1;", "{}"],
    ["value.node", "native binary placeholder", "{}"],
    ["value.custom", "module.exports = 1;", "{}"],
    [".js", "module.exports = 1;", '{"type":"module"}'],
    [".mjs", "module.exports = 1;", "{}"]
  ]) {
    test(`loading ${filename} outside supported CommonJS/JSON formats stops analysis`, () => {
      withModuleGraphFixture({
        "entry.cjs": `module.exports = require("./${filename}");`,
        "package.json": packageSource,
        [filename]: source
      }, (files, directory) => {
        expect(() => createCommonJSLoader(files).load(join(directory, "entry.cjs"), nodeInitialExecutionContext))
          .toThrow(/unmodeled|unsupported|not yet supported/i);
      });
    });
  }

  test("a native extension probe stops analysis before a directory fallback", () => {
    withModuleGraphFixture({
      "entry.cjs": 'module.exports = require("./value");',
      "value.node": "native binary placeholder",
      "value/index.js": "module.exports = 1;"
    }, (files, directory) => {
      expect(() => createCommonJSLoader(files).load(join(directory, "entry.cjs"), nodeInitialExecutionContext))
        .toThrow(/unmodeled|unsupported|not yet supported/i);
    });
  });
});
