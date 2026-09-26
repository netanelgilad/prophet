const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const root = path.resolve(__dirname, "..");
require.extensions[".ts"] = (module, filename) => {
  module._compile(babel.transformFileSync(filename, { cwd: root }).code, filename);
};

const { evaluateCode, nodeInitialExecutionContext } = require("../src/index.ts");
const [filename, ...names] = process.argv.slice(2);
if (!filename || !names.length) {
  throw new Error("Usage: node scripts/run-example.cjs <source.js> <variable> [...variables]");
}
const [, context] = evaluateCode(fs.readFileSync(path.resolve(filename), "utf8"), nodeInitialExecutionContext);
if (context.value.uncaught !== undefined) throw new Error(context.value.stderr || "Uncaught exception");
const output = {};
for (const name of names) {
  const value = context.value.scope[name];
  if (!value) throw new Error(`No variable named ${name}`);
  output[name] = value.type === "undefined" || value.type === "null"
    ? { type: value.type }
    : value.value === undefined
      ? { type: value.type, value: "unknown" }
      : { type: value.type, value: value.value };
}
console.log(JSON.stringify(output, null, 2));
