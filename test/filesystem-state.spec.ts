import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { effectPaths } from "../src/effects";
import { resolveBoolean, selectValue } from "../src/symbolic";
import { Any, ESNull, isThrownValue, TESBoolean, WithProperties } from "../src/types";

function analyze(root: Any, globals: { [name: string]: Any }, source: string) {
  const filesystem = createFileSystemModel({ root });
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...globals }) });
  const [value, context] = createCommonJSLoader({ "/app/check.cjs": source },
    { builtins: { fs: filesystem.module } }).load("/app/check.cjs", initial);
  expect(isThrownValue(value)).toBe(false);
  return { properties: getProperties(value as WithProperties, context), context, initial };
}

test("one symbolic file presence stays correlated across existence, stat and UTF8 reading", () => {
  // A closed, case-sensitive tree, stable during execution; readable regular
  // files/directories only, no symlinks, permission/resource failures or races.
  const present = ESBoolean();
  const root = fileSystemDirectory({ site: fileSystemDirectory({
    "data.txt": selectValue(present, fileSystemFile("hello 😀"), ESNull)
  }) });
  const { properties, context, initial } = analyze(root, { present }, `
    const fs = require("fs");
    const exists = fs.existsSync("/site/data.txt");
    let read = false;
    let missing = false;
    if (exists) {
      read = fs.statSync("/site/data.txt").isFile() && fs.readFileSync("/site/data.txt", "utf8") === "hello 😀";
    } else {
      try { fs.readFileSync("/site/data.txt", "utf8"); }
      catch (error) { missing = error.code === "ENOENT"; }
    }
    module.exports = { proved: present ? exists && read && !missing : !exists && !read && missing,
      uncertain: exists, again: fs.existsSync("/site/data.txt") === exists };
  `);
  for (const key of ["proved", "again"]) expect(resolveBoolean(properties[key] as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
  expect(initial.value.effects).toBeUndefined();
  const paths = effectPaths(context.value.effects, context.value.knowledge);
  expect(paths).toHaveLength(2);
  for (const path of paths) {
    const selected = resolveBoolean(present, path.knowledge);
    expect(selected).not.toBeUndefined();
    const reads = path.events.filter(event => event.call.operation === "fs.readFileSync");
    expect(reads.map(event => event.kind)).toEqual(["call", selected ? "return" : "throw"]);
  }
});

test("symbolic directory or file state is reused by later traversal and errors", () => {
  const directory = ESBoolean();
  const root = fileSystemDirectory({ item: selectValue(directory,
    fileSystemDirectory({ child: fileSystemFile("contents") }), fileSystemFile("plain")) });
  const { properties, context } = analyze(root, { directory }, `
    const fs = require("fs");
    const isDirectory = fs.statSync("/item").isDirectory();
    let child;
    let failed = false;
    try { child = fs.readFileSync("/item/child", "utf8"); }
    catch (error) { failed = error.code === "ENOTDIR" && error.syscall === "open"; }
    module.exports = { proved: directory ? isDirectory && child === "contents" && !failed : !isDirectory && failed,
      uncertain: isDirectory };
  `);
  expect(resolveBoolean(properties.proved as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});

test("symbolic roots use the same ordinary choices as symbolic directory entries", () => {
  const present = ESBoolean();
  const root = selectValue(present, fileSystemDirectory({ file: fileSystemFile("yes") }), fileSystemDirectory({}));
  const { properties, context } = analyze(root, { present }, `
    const fs = require("fs");
    module.exports = { proved: fs.existsSync("/file") === present, uncertain: fs.existsSync("/file") };
  `);
  expect(resolveBoolean(properties.proved as TESBoolean, context.value.knowledge)).toBe(true);
  expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
});

test("directory setup snapshots its input map and treats JavaScript prototype names as filenames", () => {
  const names: { [name: string]: Any } = Object.create(null);
  names["__proto__"] = fileSystemFile("prototype name");
  names["toString"] = fileSystemFile("method name");
  const root = fileSystemDirectory(names);
  names["__proto__"] = ESNull;
  names["late"] = fileSystemFile("not part of the declared tree");
  const { properties, context } = analyze(root, {}, `
    const fs = require("fs");
    module.exports = { proved: fs.readFileSync("/__proto__", "utf8") === "prototype name" &&
      fs.readFileSync("/toString", "utf8") === "method name" && !fs.existsSync("/late") };
  `);
  expect(resolveBoolean(properties.proved as TESBoolean, context.value.knowledge)).toBe(true);
});
