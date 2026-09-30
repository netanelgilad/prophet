import { execFileSync } from "child_process";
import { join } from "path";
import { createBufferValue, createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile,
  isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { readMember } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { effectPaths } from "../src/effects";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject, isESObject } from "../src/Object";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { ESNumber, Any, ESNull, isThrownValue } from "../src/types";
import { assertPinnedNode, withModuleGraphFixture } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// Declared inputs are stable readable UTF-8 files, with no allocation/resource
// failures. Only the pinned Node oracle creates real temporary fixture files.
const contents = { "ascii.txt": "hello\n", "empty.txt": "", "bytes.txt": "Aé😀\0\ud800Z" };
function tree(extra: { [name: string]: Any } = {}) {
  return fileSystemDirectory({ sandbox: fileSystemDirectory({
    "ascii.txt": fileSystemFile(contents["ascii.txt"]),
    "empty.txt": fileSystemFile(contents["empty.txt"]),
    "bytes.txt": fileSystemFile(contents["bytes.txt"]), ...extra
  }) });
}
function source(body: string) { return `const fs = require("node:fs");\n${body}`; }
function load(body: string, inputs: { [name: string]: Any } = {}, root: Any = tree()) {
  const model = createFileSystemModel({ root, cwd: "/sandbox" });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  const [value, context] = createCommonJSLoader({ "/sandbox/entry.cjs": source(body) },
    { builtins: { fs: model.module } }).load("/sandbox/entry.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  expect(isForkedCompletion(value)).toBe(false);
  return { value, context, initial };
}
function native(body: string) {
  return withModuleGraphFixture({ "entry.cjs": source(body), ...contents }, (_files, directory) => {
    assertPinnedNode();
    return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ["--no-global-search-paths", "-e", "process.stdout.write(JSON.stringify(require(process.argv[1])));", join(directory, "entry.cjs")],
      { cwd: directory, encoding: "utf8", timeout: 10000,
        env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] }));
  });
}
function compare(body: string, expected: boolean | string | number = true) {
  expect(native(body)).toBe(expected);
  const result = load(body);
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}
function compareBuffer(bytes: number[], body: string, expected: boolean | string | number = true) {
  expect(native(`const bytes = Buffer.from(${JSON.stringify(bytes)});
${body}`)).toBe(expected);
  const result = load(body, { bytes: createBufferValue(bytes) });
  expect(result.value).toMatchObject({ type: typeof expected, value: expected });
  return result;
}
function symbolicProof(body: string, selected: ReturnType<typeof ESBoolean>, root: Any = tree()) {
  const result = load(body, { selected }, root);
  if (!isESObject(result.value)) throw new Error("Expected Buffer observations");
  const properties = getProperties(result.value, result.context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, result.context.value.knowledge)).toBeUndefined();
  return result;
}

for (const options of ["", ", undefined", ", null"]) {
  test(`default readFileSync returns a byte value with complete UTF8 text (${options || "omitted"})`, () => {
    compare(`const bytes = fs.readFileSync("ascii.txt"${options});
      module.exports = typeof bytes === "object" && bytes.length === 6 &&
        bytes[0] === 104 && bytes[5] === 10 && bytes.toString() === "hello\\n";`);
  });
}

for (const encoding of ["", '"utf8"', '"utf-8"']) {
  test(`Buffer text conversion decodes all bytes (${encoding || "default"})`, () => {
    compare(`const bytes = fs.readFileSync("bytes.txt");
      module.exports = bytes.toString(${encoding}) === "Aé😀\\0\\ufffdZ";`);
  });
}


test("empty Buffer text conversion returns before inspecting its encoding argument", () => {
  compare(`const bytes = fs.readFileSync("empty.txt");
    let called = false;
    const encoding = { toString: function() { called = true; throw "should not run"; } };
    module.exports = bytes.toString("not-an-encoding") === "" && bytes.toString(null) === "" &&
      bytes.toString(encoding) === "" && !called;`);
});

test("Buffer length counts UTF8 bytes and indexed reads return unsigned bytes", () => {
  compare(`const bytes = fs.readFileSync("bytes.txt");
    module.exports = bytes.length === 12 && bytes[0] === 65 && bytes[1] === 195 &&
      bytes[2] === 169 && bytes[3] === 240 && bytes[4] === 159 && bytes[5] === 152 &&
      bytes[6] === 128 && bytes[7] === 0 && bytes[8] === 239 && bytes[9] === 191 &&
      bytes[10] === 189 && bytes[11] === 90 && bytes[12] === undefined;`);
});

test("empty Buffer length, contents and out-of-bounds reads remain concrete", () => {
  compare(`const bytes = fs.readFileSync("empty.txt");
    module.exports = bytes.length === 0 && bytes[0] === undefined && bytes.toString() === "";`);
});

test("separate file reads have distinct identities but share the UTF8 conversion method", () => {
  compare(`const first = fs.readFileSync("ascii.txt");
    const second = fs.readFileSync("ascii.txt");
    const third = fs.readFileSync("bytes.txt");
    module.exports = first !== second && first !== third && first === first &&
      first.toString === second.toString && second.toString === third.toString;`);
});

test("a borrowed Buffer conversion method reads the receiver's own byte contents", () => {
  compare(`const first = fs.readFileSync("ascii.txt");
    const second = fs.readFileSync("bytes.txt");
    const decode = first.toString;
    module.exports = decode.call(second, "utf8") === "Aé😀\\0\\ufffdZ" &&
      decode.call(first) === "hello\\n";`);
});

test("successful Buffer reads retain filesystem call ordering and earlier contexts", () => {
  const { context, initial } = compare(`
    const first = fs.readFileSync("ascii.txt");
    const second = fs.readFileSync("empty.txt", null);
    module.exports = first.length === 6 && second.length === 0;`);
  expect(effectPaths(context.value.effects!)[0].events.filter(event =>
    event.call.operation === "fs.readFileSync").map(event => event.kind)).toEqual(["call", "return", "call", "return"]);
  expect(initial.value.effects).toBeUndefined();
});

test("a symbolic file choice keeps byte length, indexed reads and decoded text correlated", () => {
  const selected = ESBoolean();
  symbolicProof(`const bytes = fs.readFileSync("choice");
    module.exports = { proof: selected ? bytes.length === 1 && bytes[0] === 65 && bytes.toString() === "A" :
      bytes.length === 2 && bytes[0] === 195 && bytes[1] === 169 && bytes.toString() === "é",
      uncertain: bytes.length === 1 };`, selected,
    tree({ choice: selectValue(selected, fileSystemFile("A"), fileSystemFile("é")) }));
});

test("symbolic paths preserve reusable Buffer receivers after the read joins", () => {
  const selected = ESBoolean();
  symbolicProof(`const bytes = fs.readFileSync(selected ? "ascii.txt" : "empty.txt");
    const decode = bytes.toString;
    module.exports = { proof: selected ? decode.call(bytes) === "hello\\n" && bytes.length === 6 :
      decode.call(bytes) === "" && bytes.length === 0, uncertain: bytes.length === 0 };`, selected);
});

test("Buffer success and missing-file failure retain the same optional-entry condition", () => {
  const selected = ESBoolean();
  const { context } = symbolicProof(`let result, caught = false;
    try { result = fs.readFileSync("optional").toString(); }
    catch (error) { caught = true; result = error.code; }
    module.exports = { proof: selected ? !caught && result === "present" : caught && result === "ENOENT",
      uncertain: caught };`, selected, tree({ optional: selectValue(selected, fileSystemFile("present"), ESNull) }));
  const readCompletions = effectPaths(context.value.effects!).map(path => path.events.filter(event =>
    event.call.operation === "fs.readFileSync" && event.kind !== "call").map(event => event.kind));
  expect(readCompletions).toEqual(expect.arrayContaining([["return"], ["throw"]]));
});


test("Buffer byteLength agrees with byte length, including empty buffers", () => {
  compare(`const bytes = fs.readFileSync("bytes.txt");
    const empty = fs.readFileSync("empty.txt");
    module.exports = bytes.byteLength === 12 && bytes.byteLength === bytes.length &&
      empty.byteLength === 0;`);
});

test("separate empty file reads have distinct byte-value identities", () => {
  compare(`module.exports = fs.readFileSync("empty.txt") !== fs.readFileSync("empty.txt");`);
});

test("Buffer conversion method metadata and UTF8 encoding case match Node", () => {
  compare(`const bytes = fs.readFileSync("ascii.txt");
    module.exports = bytes.toString.name === "toString" && bytes.toString.length === 3 &&
      bytes.toString(undefined) === "hello\\n" && bytes.toString("UTF8") === "hello\\n" &&
      bytes.toString("UtF-8") === "hello\\n";`);
});

test("canonical numeric indices never fall through to inherited properties", () => {
  compare(`Object.prototype["-0"] = 7; Object.prototype["-1"] = 8;
    Object.prototype["NaN"] = 9; Object.prototype["Infinity"] = 10;
    Object.prototype["1.5"] = 11; Object.prototype["99"] = 12;
    const bytes = fs.readFileSync("ascii.txt");
    module.exports = bytes["0"] === 104 && bytes["-0"] === undefined &&
      bytes[-1] === undefined && bytes["NaN"] === undefined &&
      bytes["Infinity"] === undefined && bytes[1.5] === undefined && bytes[99] === undefined;`);
});

test("raw byte embedding copies input and decodes malformed UTF8 just as Node does", () => {
  const original = [65, 255, 195, 40, 226, 130];
  const value = createBufferValue(original);
  original[0] = 90;
  const body = `module.exports = bytes.length === 6 && bytes[0] === 65 && bytes[1] === 255 &&
    bytes.toString() === "A\\ufffd\\ufffd(\\ufffd";`;
  expect(native(`const bytes = Buffer.from([65,255,195,40,226,130]); ${body}`)).toBe(true);
  expect(load(body, { bytes: value }).value).toMatchObject({ type: "boolean", value: true });
});

test("raw byte embedding validates that setup already contains bytes", () => {
  for (const bytes of [[-1], [256], [1.5], [NaN], [Infinity]]) {
    expect(() => createBufferValue(bytes)).toThrow(/byte|Buffer/i);
  }
});

test("byte writes use unsigned eight-bit conversion and return the assigned number", () => {
  compareBuffer([0, 0, 0, 0, 0], `
    const assigned = bytes[0] = 257.9;
    bytes[1] = -1; bytes[2] = 0 / 0; bytes[3] = 1 / 0; bytes[4] = -257.9;
    module.exports = assigned === 257.9 && bytes[0] === 1 && bytes[1] === 255 &&
      bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 255;`);
});

test("byte writes change aliases and decoded text while retaining earlier contexts", () => {
  const bytes = createBufferValue([65, 66]);
  const body = `const alias = bytes; bytes[0] = 67;
    module.exports = alias[0] === 67 && alias.toString() === "CB" && bytes.length === 2;`;
  expect(native(`const bytes = Buffer.from([65, 66]); ${body}`)).toBe(true);
  const { value, initial, context } = load(body, { bytes });
  expect(value).toMatchObject({ type: "boolean", value: true });
  expect(readMember(bytes, "0", initial)[0]).toMatchObject({ type: "number", value: 65 });
  expect(readMember(bytes, "0", context)[0]).toMatchObject({ type: "number", value: 67 });
});

test("mutating one default read neither changes another read nor the filesystem file", () => {
  compare(`const first = fs.readFileSync("ascii.txt");
    const second = fs.readFileSync("ascii.txt");
    first[0] = 74;
    module.exports = first.toString() === "Jello\\n" && second.toString() === "hello\\n" &&
      fs.readFileSync("ascii.txt").toString() === "hello\\n" &&
      fs.readFileSync("ascii.txt", "utf8") === "hello\\n";`);
});

test("out-of-range numeric writes are ignored without creating indexed properties", () => {
  compareBuffer([65], `bytes[9] = 66; bytes[-1] = 67; bytes["-0"] = 68;
    bytes[1.5] = 69; bytes["NaN"] = 70; bytes["Infinity"] = 71;
    module.exports = bytes.length === 1 && bytes[0] === 65 && bytes.toString() === "A" &&
      bytes[9] === undefined && bytes[-1] === undefined && bytes["-0"] === undefined &&
      bytes[1.5] === undefined && bytes["NaN"] === undefined && bytes["Infinity"] === undefined;`);
});

test("ordinary toString shadows remain visible without replacing another buffer's method", () => {
  compare(`const first = fs.readFileSync("ascii.txt"), second = fs.readFileSync("ascii.txt");
    const decode = first.toString;
    first.toString = function() { return "replacement"; };
    module.exports = first.toString() === "replacement" && second.toString() === "hello\\n" &&
      decode.call(first) === "hello\\n";`);
});

test("symbolic byte assignments preserve correlations in indexed reads and UTF8 text", () => {
  const selected = ESBoolean();
  const { value, context } = load(`bytes[0] = selected ? 65 : 66;
    module.exports = { proof: selected ? bytes[0] === 65 && bytes.toString() === "A" :
      bytes[0] === 66 && bytes.toString() === "B", uncertain: bytes[0] === 65 };`,
    { selected, bytes: createBufferValue([0]) });
  if (!isESObject(value)) throw new Error("Expected symbolic byte observations");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

for (const body of [
  'bytes[0] = "67";', 'bytes[99] = "67";', 'bytes[0] = {};', 'bytes[99] = {};',
  'bytes.length = 0;', 'bytes.byteLength = 0;', 'bytes.buffer;', 'bytes.byteOffset;',
  'bytes.constructor;', 'bytes.__proto__;', 'bytes.__proto__ = {};',
  'bytes.toString("hex");', 'bytes.toString("utf8", 0, 1);', 'bytes.toString.call({});',
  'Object.keys(bytes);', 'module.exports = { ...bytes };'
]) {
  test(`unmodeled Buffer behavior remains an explicit analysis boundary: ${body}`, () => {
    expect(() => load(body, { bytes: createBufferValue([65]) })).toThrow(/Buffer|byte|unmodeled|unsupported/i);
  });
}

test("an open symbolic number is not silently converted into a concrete byte", () => {
  expect(() => load('bytes[0] = input;', { bytes: createBufferValue([0]), input: ESNumber() }))
    .toThrow(/Buffer|byte|symbolic|unsupported/i);
});

test("correlated symbolic bytes decode only feasible complete UTF8 sequences", () => {
  const selected = ESBoolean();
  const { value, context } = load(`
    bytes[0] = selected ? 195 : 65;
    bytes[1] = selected ? 169 : 66;
    const text = bytes.toString();
    module.exports = { proof: selected ? text === "é" : text === "AB",
      uncertain: text === "é" };`, { selected, bytes: createBufferValue([0, 0]) });
  if (!isESObject(value)) throw new Error("Expected correlated UTF8 observations");
  const properties = getProperties(value, context);
  expect(resolveBoolean(properties.proof as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBeUndefined();
});

test("ignored extra toString arguments still run their expressions in order", () => {
  compare(`const bytes = fs.readFileSync("ascii.txt");
    let trace = "";
    function extra() { trace = trace + "extra"; return 123; }
    const text = bytes.toString("utf8", undefined, undefined, extra());
    module.exports = text === "hello\\n" && trace === "extra";`);
});

test("Buffer setup rejects sparse byte arrays instead of inventing missing contents", () => {
  expect(() => createBufferValue(new Array<number>(1))).toThrow(/dense|byte|Buffer/i);
});

test("concrete byte decoding handles a complete 10000-byte file-sized value", () => {
  const bytes = new Array<number>(10000).fill(65);
  compareBuffer(bytes, `module.exports = bytes.length === 10000 &&
    bytes.toString() === ${JSON.stringify("A".repeat(10000))};`);
});
