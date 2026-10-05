import { spawnSync } from "child_process";
import { createCommonJSLoader, createWarningModel, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { resolveBoolean, strictEquality } from "../src/symbolic";
import { ESString } from "../src/string/String";
import { Any, isThrownValue } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function loadWarning(body: string, inputs: { [name: string]: Any } = {}, pid: number | undefined = 123) {
  const model = createWarningModel(pid === undefined ? {} : { pid });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ "/app/warnings.cjs":
    `const process = require("process"); ${body}` }, { builtins: { process: model.process } })
    .load("/app/warnings.cjs", initial);
  return { model, value, context };
}

function compareNativeWarnings(body: string, deliveries = 1) {
  assertPinnedNode();
  const native = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `
    ${body}
    setImmediate(() => process.stdout.write(String(process.pid)));
  `], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(native.status).toBe(0);
  const result = loadWarning(body, {}, Number(native.stdout));
  let context = result.context;
  for (let index = 0; index < deliveries; index++) {
    const [value, after] = result.model.deliverNext(context);
    expect(isThrownValue(value)).toBe(false);
    expect(isForkedCompletion(value)).toBe(false);
    context = after;
  }
  expect(result.model.inspectOutput(context)[0].chunks.map(chunk => chunk.value).join("")).toBe(native.stderr);
  return { ...result, delivered: context };
}

test("default warning delivery is deferred, ordered and writes pinned Node's stderr text", () => {
  assertPinnedNode();
  const body = 'process.emitWarning("first", "Warning", "ONE"); process.emitWarning("second", "DeprecationWarning", "TWO");';
  const native = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `
    const order = [];
    process.on("warning", warning => order.push(warning.code));
    ${body}
    order.push("synchronous");
    setImmediate(() => console.log(JSON.stringify({pid:process.pid, order})));
  `], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(native.status).toBe(0);
  const observation = JSON.parse(native.stdout);
  expect(observation.order).toEqual(["synchronous", "ONE", "TWO"]);
  const model = createWarningModel({ pid: observation.pid });
  const initial = nodeInitialExecutionContext;
  const [value, context] = createCommonJSLoader({ "/app/warnings.cjs":
    `const process = require("process"); ${body}` }, { builtins: { process: model.process } })
    .load("/app/warnings.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  expect(model.inspectPending(context)[0].warnings).toHaveLength(2);
  expect(model.inspectOutput(context)[0].chunks).toHaveLength(0);
  const [, first] = model.deliverNext(context);
  expect(model.inspectPending(first)[0].warnings).toHaveLength(1);
  const [, second] = model.deliverNext(first);
  expect(model.inspectPending(second)[0].warnings).toHaveLength(0);
  expect(model.inspectOutput(second)[0].chunks.map(chunk => chunk.value).join("")).toBe(native.stderr);
  expect(model.inspectPending(context)[0].warnings).toHaveLength(2);
  expect(model.inspectPending(initial)[0].warnings).toHaveLength(0);
});

test("conditional warnings retain queue, output and helper-line state per execution path", () => {
  const model = createWarningModel({ pid: 123 });
  const flag = ESBoolean();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, flag }) });
  const [, context] = createCommonJSLoader({ "/app/warnings.cjs": `
    const process = require("process");
    if (flag) process.emitWarning("conditional", "DeprecationWarning", "D");
    process.emitWarning("always", "Warning", "W");
  ` }, { builtins: { process: model.process } }).load("/app/warnings.cjs", initial);
  const [, first] = model.deliverNext(context);
  const [, second] = model.deliverNext(first);
  for (const path of model.inspectOutput(second)) {
    const selected = resolveBoolean(flag, path.knowledge);
    expect(selected).not.toBeUndefined();
    const text = path.chunks.map(chunk => chunk.value).join("");
    expect(text).toContain("[W] Warning: always");
    expect(text.includes("[D] DeprecationWarning: conditional")).toBe(selected);
    expect(text).toContain(selected ? "node --trace-deprecation" : "node --trace-warnings");
    expect(text.split("(Use `")).toHaveLength(2);
  }
  expect(model.inspectPending(context).map(path => path.warnings.length).sort()).toEqual([1, 2]);
});

test("unsupported warning configuration cannot silently change default delivery", () => {
  for (const body of ['process.noDeprecation = true;', 'process.on("warning", function() {});',
    'process.emitWarning("text", {type:"Warning"});']) {
    const model = createWarningModel();
    expect(createCommonJSLoader({ "/app/warnings.cjs": `const process = require("process"); ${body}` },
      { builtins: { process: model.process } }).load("/app/warnings.cjs", nodeInitialExecutionContext)[0])
      .toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  }
});

test("empty type defaults to Warning, missing code stays undefined, and empty messages format without a colon", () => {
  const { model, context } = loadWarning('process.emitWarning("", "");');
  expect(model.inspectPending(context)[0].warnings[0]).toMatchObject({
    name: { value: "Warning" }, message: { value: "" }, code: { type: "undefined" }
  });
  const [, delivered] = model.deliverNext(context);
  expect(model.inspectOutput(delivered)[0].chunks[0].value).toBe(
    "(node:123) Warning\n(Use `node --trace-warnings ...` to show where the warning was created)\n");
  const [, empty] = model.deliverNext(delivered);
  expect(model.inspectOutput(empty)[0].chunks).toHaveLength(1);
});

test("finite warning choices preserve diagnostic and helper selection", () => {
  const flag = ESBoolean();
  const { model, context } = loadWarning(`
    process.emitWarning(flag ? "one" : "two", flag ? "DeprecationWarning" : "Notice", flag ? "D" : "N");
  `, { flag });
  const [, delivered] = model.deliverNext(context);
  for (const path of model.inspectOutput(delivered)) {
    const selected = resolveBoolean(flag, path.knowledge);
    expect(selected).not.toBeUndefined();
    expect(path.chunks[0].value).toBe(selected
      ? "(node:123) [D] DeprecationWarning: one\n(Use `node --trace-deprecation ...` to show where the warning was created)\n"
      : "(node:123) [N] Notice: two\n(Use `node --trace-warnings ...` to show where the warning was created)\n");
  }
});

test("unknown pid and message retain structured diagnostics without inventing stderr bytes", () => {
  const model = createWarningModel();
  const [, context] = createCommonJSLoader({ "/app/warnings.cjs":
    'require("process").emitWarning("known", "Notice", "KNOWN");' },
    { builtins: { process: model.process } }).load("/app/warnings.cjs", nodeInitialExecutionContext);
  expect(model.inspectPending(context)[0].warnings[0]).toMatchObject({
    name: { value: "Notice" }, code: { value: "KNOWN" }, message: { value: "known" }
  });
  const [, delivered] = model.deliverNext(context);
  expect(model.inspectOutput(delivered)[0].chunks[0]).toMatchObject({ type: "string", value: undefined });
  const message = ESString();
  const unknown = loadWarning('process.emitWarning(message, "Notice", "UNKNOWN");', { message });
  const [, after] = unknown.model.deliverNext(unknown.context);
  const outputs = unknown.model.inspectOutput(after);
  expect(outputs.some(path => path.chunks[0].value === undefined)).toBe(true);
  for (const path of outputs) if (path.chunks[0].value !== undefined) {
    // Error.prototype.toString distinguishes the empty message case.
    expect(resolveBoolean(strictEquality(message, ESString(""), path.knowledge), path.knowledge)).toBe(true);
  }
});

test("emitWarning is mutable and detached calls use the captured process", () => {
  const { model, value, context } = loadWarning(`
    const original = process.emitWarning;
    let called = false;
    process.emitWarning = function(message) { called = this === process && message === "replacement"; };
    process.emitWarning("replacement");
    original.call(null, "original");
    module.exports = called && process.noDeprecation === undefined && process.throwDeprecation === undefined;
  `);
  expect(value).toMatchObject({ value: true });
  expect(model.inspectPending(context)[0].warnings).toHaveLength(1);
  expect(model.inspectPending(context)[0].warnings[0].message).toMatchObject({ value: "original" });
});

test("warning delivery observes inherited formatter and later inherited detail effects", () => {
  const { model, delivered } = compareNativeWarnings(`
    Object.prototype.code = "INHERITED";
    Error.prototype.toString = function() { Object.prototype.detail = "after formatting"; return this.name + "/" + this.message; };
    process.emitWarning("message", "Notice");
  `);
  expect(model.inspectOutput(delivered)[0].chunks[0].value).toContain(
    "[INHERITED] Notice/message\nafter formatting\n(Use `node --trace-warnings ...` to show where the warning was created)\n");
});

test("a noncallable inherited formatter uses the captured Error formatter", () => {
  const { model, delivered } = compareNativeWarnings(`
    Error.prototype.toString = null;
    process.emitWarning("message", "Notice", "N");
  `);
  expect(model.inspectOutput(delivered)[0].chunks[0].value).toContain("[N] Notice: message\n");
});

test("warning formatting can enqueue another warning without replaying or losing its side effects", () => {
  const { model, delivered } = compareNativeWarnings(`
    Error.prototype.toString = function() {
      process.emitWarning("next", "Notice", "NEXT");
      Error.prototype.toString = null;
      return "formatted first";
    };
    process.emitWarning("first", "Notice", "FIRST");
  `, 2);
  expect(model.inspectPending(delivered)[0].warnings).toHaveLength(0);
  expect(model.inspectOutput(delivered)[0].chunks).toHaveLength(2);
});

test("default warning output encodes lone surrogates as replacement characters", () => {
  const { model, delivered } = compareNativeWarnings('process.emitWarning("\\ud800\\nnext", "Notice", "U");');
  expect(model.inspectOutput(delivered)[0].chunks[0].value).toContain("Notice: \ufffd\nnext\n");
});

test("embedding options are snapshotted consistently for process.pid and later delivery", () => {
  const options = { pid: 123 };
  const model = createWarningModel(options);
  options.pid = 456;
  const [value, context] = createCommonJSLoader({ "/app/warnings.cjs": `
    const process = require("process"); process.emitWarning("message"); module.exports = process.pid;
  ` }, { builtins: { process: model.process } }).load("/app/warnings.cjs", nodeInitialExecutionContext);
  expect(value).toMatchObject({ value: 123 });
  const [, delivered] = model.deliverNext(context);
  expect(model.inspectOutput(delivered)[0].chunks[0].value).toContain("(node:123) Warning: message");
});

test("conditional formatter throws consume only the delivered warning and do not invent output", () => {
  const flag = ESBoolean();
  const { model, context } = loadWarning(`
    if (flag) Error.prototype.toString = function() { throw "formatter failed"; };
    process.emitWarning("message", "Notice", "N");
  `, { flag });
  const [completion, delivered] = model.deliverNext(context);
  expect(isForkedCompletion(completion)).toBe(true);
  for (const path of model.inspectOutput(delivered)) {
    expect(path.chunks).toHaveLength(resolveBoolean(flag, path.knowledge) ? 0 : 1);
  }
  model.inspectPending(delivered).forEach(path => expect(path.warnings).toHaveLength(0));
});

test("optional type and code validate before the message and rejection does not enqueue", () => {
  for (const expression of ['process.emitWarning("text", null)', 'process.emitWarning("text", "Notice", 1)']) {
    const { model, value, context } = loadWarning(`
      let caught = false;
      try { ${expression}; } catch (error) { caught = error.name === "TypeError" && error.code === "ERR_INVALID_ARG_TYPE"; }
      module.exports = caught;
    `);
    expect(value).toMatchObject({ value: true });
    expect(model.inspectPending(context)[0].warnings).toHaveLength(0);
  }
});

for (const body of [
  'process.emitWarning(new Error("message"));', 'process.emitWarning(1);',
  'process.emitWarning("message", function() {});', 'process.emitWarning("message", "Warning", function() {});',
  'process.emitWarning("message", undefined, undefined, function() {});',
  'process.emitWarning("message", type);', 'process.emitWarning("message", "Warning", code);',
  'process.traceDeprecation = true;', 'process.throwDeprecation = true;',
  'Object.prototype.noDeprecation = true; process.emitWarning("message", "DeprecationWarning");',
  'process.stderr.write("output");'
]) {
  test(`unsupported warning overload or environment remains explicit: ${body}`, () => {
    expect(loadWarning(body, { type: ESString(), code: ESString() }).value)
      .toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  });
}
