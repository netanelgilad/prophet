#!/usr/bin/env node
"use strict";

// Checkout bootstrap only: transpile Prophet's own TypeScript with its existing
// toolchain. Application source is read and interpreted by the VM, never require'd.
const fs = require("fs");
const path = require("path");
const sourceRoot = fs.realpathSync(path.join(__dirname, "..", "src")) + path.sep;

function fail(error) {
  process.stderr.write(`prophet: ${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

try {
  const babel = require("@babel/core");
  require.extensions[".ts"] = function compileProphet(module, filename) {
    const source = fs.realpathSync(filename);
    if (!source.startsWith(sourceRoot)) {
      throw new Error("The Prophet bootstrap only loads its own TypeScript implementation.");
    }
    const result = babel.transformSync(fs.readFileSync(source, "utf8"), {
      filename: source,
      babelrc: false,
      configFile: false,
      plugins: [require.resolve("babel-plugin-macros")],
      presets: [
        [require.resolve("@babel/preset-env"), { targets: { node: "current" } }],
        require.resolve("@babel/preset-typescript")
      ]
    });
    if (!result || typeof result.code !== "string") throw new Error("Prophet TypeScript compilation failed.");
    module._compile(result.code, source);
  };

  const { main } = require("../src/cli/main.ts");
  Promise.resolve().then(() => main(process.argv.slice(2))).then(code => {
    process.exitCode = code;
  }, fail);
} catch (error) {
  fail(error);
}
