const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  module._compile(babel.transformFileSync(filename, { cwd: root }).code, filename);
};

const { evaluateCode, nodeInitialExecutionContext } = require("../src/index.ts");
const argv = process.argv.slice(2);
let initialContext = nodeInitialExecutionContext;
if (argv[0] === "--symbolic-random-array") {
  argv.shift();
  const name = argv.shift();
  if (!name) throw new Error("A binding name is required for --symbolic-random-array");
  const { symbolicNumberArray } = require("../src/array/symbolic.ts");
  const { randomNumber } = require("../src/symbolic/index.ts");
  const { setVariableInScope } = require("../src/execution-context/ExecutionContext.ts");
  initialContext = setVariableInScope(initialContext, name,
    symbolicNumberArray({ minimumLength: 1, element: randomNumber() }));
}
const [filename, ...names] = argv;
if (!filename || !names.length) {
  throw new Error("Usage: node scripts/run-example.cjs [--symbolic-random-array binding] <source.js> <variable> [...variables]");
}
const [, context] = evaluateCode(fs.readFileSync(path.resolve(filename), "utf8"), initialContext);
if (context.value.uncaught !== undefined) throw new Error(context.value.stderr || "Uncaught exception");
const output = {};
for (const name of names) {
  const value = context.value.scope[name];
  if (!value) throw new Error(`No variable named ${name}`);
  if (value.type === "function") {
    const { getInferredSummaries } = require("../src/Function/summaries.ts");
    output[name] = { type: "function", summaries: getInferredSummaries(value) };
    continue;
  }
  output[name] = value.type === "undefined" || value.type === "null"
    ? { type: value.type }
    : value.value === undefined
      ? { type: value.type, value: "unknown" }
      : { type: value.type, value: value.value };
}
console.log(JSON.stringify(output, null, 2));
