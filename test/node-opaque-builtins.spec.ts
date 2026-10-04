import { join } from "path";
import { createCommonJSLoader, createConsoleModel, nodeInitialExecutionContext } from "../src";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { hasProperty } from "../src/Object/prototype";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { assertPinnedNode, nodeModuleObservation, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// These four public Node modules have object exports. This list is not a claim
// that every builtin exports an object, or that any of their APIs are modeled.
const modules = [
  ["https", "createServer"], ["fs", "readFileSync"],
  ["url", "parse"], ["path", "join"]
];

for (const [name, member] of modules) {
  test(`${name} imports preserve object type and canonical alias identity without using its API`, () => {
    const sources = {
      "entry.cjs": `
        const api = require("${name}");
        module.exports = typeof api === "object" && api !== null &&
          api === require("node:${name}") && api === require("./other.cjs");
      `,
      "other.cjs": `module.exports = require("node:${name}");`
    };
    withModuleGraphFixture(sources, (files, directory) => {
      const filename = join(directory, "entry.cjs");
      // Independent pinned Node observation only imports the module and checks
      // identities/type: no socket, filesystem API, parsing or path call runs.
      expect(nodeModuleObservation(filename)).toEqual({
        kind: "return", value: { type: "boolean", value: true }
      });
      const api = createOpaqueBuiltinModule(name);
      const [value, context] = createCommonJSLoader(files, { builtins: { [name]: api } })
        .load(filename, nodeInitialExecutionContext);
      expect(value).toMatchObject({ type: "boolean", value: true });
      expect(context.value.effects).toBeUndefined();
      // Shared presence reasoning must not treat the empty model table as an
      // absent API, even while the guest `in` operator remains unsupported.
      expect(() => hasProperty(api, member, context)).toThrow("Unmodeled host property presence");
    });
  });

  for (const [label, expression, expected] of [
    ["read", `api.${member}`, /Unmodeled host property/],
    ["call", `api.${member}()`, /Unmodeled host property/],
    ["write", `api.${member} = operand()`, /Unmodeled host property/],
    ["presence operator", `"${member}" in api`, /Binary operator resolver for in hasn't been implemented/],
    ["own inspection", `Object.prototype.hasOwnProperty.call(api, "${member}")`, /Unmodeled host own-property inspection/],
    ["enumeration", "({ ...api })", /Own property enumeration is not yet supported/],
    ["coercion", "String(api)", /Unmodeled host/],
    ["tag inspection", "Object.prototype.toString.call(api)", /Unmodeled host Symbol.toStringTag/],
    ["prototype inspection", "api instanceof Object", /Unmodeled host prototype/]
  ] as Array<[string, string, RegExp]>) {
    test(`${name} ${label} stops analysis outside the program's catch and retains earlier effects`, () => {
      const consoleModel = createConsoleModel();
      const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
        global: ESObject({ ...nodeInitialExecutionContext.value.global.properties,
          console: consoleModel.module }) });
      const filename = "/app/opaque.cjs";
      const loader = createCommonJSLoader({ [filename]: `
        const api = require("${name}");
        function operand() { console.log("operand"); return 1; }
        console.log("before");
        try { ${expression}; }
        catch (error) { console.log("caught"); }
        console.log("after");
      ` }, { builtins: { [name]: createOpaqueBuiltinModule(name) } });
      let failure: Error | undefined;
      try { loader.load(filename, initial); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(failure!.message).toMatch(expected);
      const checkpoint = analysisFailureContext(failure);
      expect(checkpoint).toBeDefined();
      const paths = consoleModel.inspectOutput(checkpoint!);
      expect(paths).toHaveLength(1);
      expect(paths[0].chunks.map(chunk => chunk.value)).toEqual(
        label === "write" ? ["before\n", "operand\n"] : ["before\n"]);
    });
  }
}
