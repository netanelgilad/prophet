import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { isThrownValue } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";
import { concretePrimitive } from "./test262/runner";

const cases = [
  { label: "escaped text is not a strict directive", prefix: '"use\\x20strict";', strict: false },
  { label: "parenthesized text is not a directive", prefix: '("use strict");', strict: false },
  { label: "a non-directive ends the prologue before a later string literal", prefix: '("other"); "use strict";', strict: false },
  { label: "an exact directive following another directive enables strictness", prefix: '"other"; "use strict";', strict: true }
];

for (const example of cases) {
  test(example.label + " in programs, ordinary functions, arrows, and eval", () => {
    assertPinnedNode();
    const assignment = `
      try { directiveTarget = 17; }
      catch (error) { outcome = error.name; }
    `;
    const observation = 'outcome + ":" + typeof directiveTarget';
    const body = `${example.prefix}\nlet outcome = "written";\n${assignment}`;
    const sources = [
      `${body}\nconst result = ${observation};`,
      `const run = function() { ${body}\nreturn ${observation}; }; const result = run();`,
      `const run = () => { ${body}\nreturn ${observation}; }; const result = run();`,
      `let outcome = "written"; eval(${JSON.stringify(example.prefix + assignment)}); const result = ${observation};`
    ];
    for (const source of sources) {
      // A new native script realm tests Program strictness too; wrapping every
      // example in a host function would test a different directive boundary.
      const native = JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
        ["-e", 'process.stdout.write(JSON.stringify(require("node:vm").runInNewContext(process.argv[1])));', source + "\nresult;"],
        { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" },
          stdio: ["ignore", "pipe", "pipe"] }));
      expect(native).toBe(example.strict ? "ReferenceError:undefined" : "written:number");
      const [completion, context] = evaluateCode(source, nodeInitialExecutionContext);
      expect(isThrownValue(completion)).toBe(false);
      expect(isForkedCompletion(completion)).toBe(false);
      expect(concretePrimitive(context.value.scope.result)).toBe(native);
    }
  });
}
