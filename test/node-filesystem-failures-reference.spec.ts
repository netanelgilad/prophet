import { spawnSync } from "child_process";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmdirSync,
  statSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

// These references establish real OS failures, independently of the symbolic
// model. No fs method is replaced. Root drops privileges in the child after
// setup; a filesystem that does not enforce the permissions fails the spec.
const driver = `
  const fs = require("node:fs");
  const directory = process.argv[1];
  const mode = process.argv[2];
  process.chdir(directory);
  if (mode === "cwd") {
    process.chdir("ancestor/cwd");
    fs.chmodSync(directory + "/ancestor", 0);
  }
  if (process.getuid() === 0) {
    process.setgroups([]);
    process.setgid(65534);
    process.setuid(65534);
  }
  function observe(operation, path) {
    try {
      if (operation === "exists") return { value: fs.existsSync(path) };
      if (operation === "stat") {
        const value = fs.statSync(path);
        return { file: value.isFile(), directory: value.isDirectory() };
      }
      const value = operation === "utf8" ? fs.readFileSync(path, "utf8") : fs.readFileSync(path);
      return { text: value.toString(), bytes: Buffer.byteLength(value) };
    } catch (error) {
      return { name: error.name, code: error.code, errno: error.errno,
        syscall: error.syscall, path: error.path, message: error.message };
    }
  }
  const paths = ["readable.txt", "unreadable.txt", "missing", "no-search", "no-search/",
    "no-search/.", "no-search/child.txt", "no-search/missing", "no-search/../readable.txt",
    "no-read", "no-read/", "no-read/.", "no-read/child.txt", "", "bad\\0path", "/"];
  function observations() {
    const values = {};
    for (const path of paths) {
      values[path] = {};
      for (const operation of ["exists", "stat", "utf8", "buffer"]) {
        values[path][operation] = observe(operation, path);
      }
    }
    return values;
  }
  const result = { platform: process.platform, node: process.version, uid: process.getuid() };
  if (mode === "cwd") {
    result.relative = observe("utf8", "child.txt");
    result.absolute = observe("utf8", directory + "/ancestor/cwd/child.txt");
    result.directory = directory;
  } else {
    result.before = observations();
    if (mode === "capacity") {
      const opened = [];
      try {
        // The child shell sets both limits to 64: Node raises a soft-only
        // limit at startup. This loop cannot consume an unbounded resource.
        for (let count = 0; count < 64; count++) {
          try { opened.push(fs.openSync("readable.txt", "r")); }
          catch (error) { result.exhaustion = { code: error.code, syscall: error.syscall }; break; }
        }
        result.opened = opened.length;
        result.exhausted = observations();
      } finally {
        for (const fd of opened) fs.closeSync(fd);
      }
      result.after = observations();
    }
  }
  fs.writeSync(1, JSON.stringify(result));
`;

function removeTree(directory: string) {
  chmodSync(directory, 0o755);
  for (const name of readdirSync(directory)) {
    const filename = join(directory, name);
    if (statSync(filename).isDirectory()) removeTree(filename);
    else unlinkSync(filename);
  }
  rmdirSync(directory);
}

function native(mode: "permissions" | "capacity" | "cwd") {
  assertPinnedNode();
  if (process.platform !== "darwin" && process.platform !== "linux") {
    throw new Error("Filesystem permission/capacity references require the declared Linux/macOS domain");
  }
  // /tmp is traversable after root drops uid; a user's private TMPDIR may not be.
  const directory = realpathSync(mkdtempSync("/tmp/prophet-fs-failures-"));
  try {
    chmodSync(directory, 0o755);
    writeFileSync(join(directory, "readable.txt"), "hello 😀");
    chmodSync(join(directory, "readable.txt"), 0o644);
    writeFileSync(join(directory, "unreadable.txt"), "private");
    chmodSync(join(directory, "unreadable.txt"), 0);
    for (const name of ["no-search", "no-read", "ancestor", "ancestor/cwd"]) {
      mkdirSync(join(directory, name));
      chmodSync(join(directory, name), 0o755);
    }
    for (const name of ["no-search", "no-read", "ancestor/cwd"]) {
      writeFileSync(join(directory, name, "child.txt"), "child");
      chmodSync(join(directory, name, "child.txt"), 0o644);
    }
    chmodSync(join(directory, "no-search"), 0o444);
    chmodSync(join(directory, "no-read"), 0o111);
    const node = process.env.PROPHET_NODE_BINARY || process.execPath;
    const args = ["--no-global-search-paths", "-e", driver, directory, mode];
    const executable = mode === "capacity" ? "/bin/sh" : node;
    // The hard cap is necessary because pinned Node raises its soft limit to
    // its inherited hard limit. Only this isolated child process is affected.
    const argv = mode === "capacity"
      ? ["-c", 'ulimit -n 64 || exit $?; exec "$@"', "prophet-fs-capacity", node, ...args] : args;
    const result = spawnSync(executable, argv, { encoding: "utf8", timeout: 10000,
      env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" }, stdio: ["ignore", "pipe", "pipe"] });
    if (result.error) throw result.error;
    expect(result.signal).toBeNull();
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const observed = JSON.parse(result.stdout);
    expect(observed.node).toBe("v24.21.0");
    expect(observed.platform).toBe(process.platform);
    expect(observed.uid).not.toBe(0);
    return observed;
  } finally {
    removeTree(directory);
  }
}

function failure(code: "EACCES" | "EMFILE" | "ENOENT", syscall: string, path: string) {
  const messages = { EACCES: "permission denied", EMFILE: "too many open files", ENOENT: "no such file or directory" };
  const errno = { EACCES: -13, EMFILE: -24, ENOENT: -2 };
  return { name: "Error", code, errno: errno[code], syscall, path,
    message: `${code}: ${messages[code]}, ${syscall} '${path}'` };
}

test("real unreadable regular files still exist and stat but both read paths throw EACCES", () => {
  const { before } = native("permissions");
  expect(before["readable.txt"].utf8).toEqual({ text: "hello 😀", bytes: 10 });
  expect(before["readable.txt"].buffer).toEqual(before["readable.txt"].utf8);
  expect(before["unreadable.txt"].exists).toEqual({ value: true });
  expect(before["unreadable.txt"].stat).toEqual({ file: true, directory: false });
  expect(before["unreadable.txt"].utf8).toEqual(failure("EACCES", "open", "unreadable.txt"));
  expect(before["unreadable.txt"].buffer).toEqual(before["unreadable.txt"].utf8);
});

test("directory search permission applies to traversal and explicit dot, including missing children", () => {
  const { before } = native("permissions");
  expect(before["no-search"].stat).toEqual({ file: false, directory: true });
  expect(before["no-search/"].stat).toEqual({ file: false, directory: true });
  expect(before["no-search/"].exists).toEqual({ value: true });
  for (const path of ["no-search", "no-search/"]) {
    expect(before[path].utf8).toEqual({ name: "Error", code: "EISDIR", errno: -21, syscall: "read",
      message: "EISDIR: illegal operation on a directory, read" });
    expect(before[path].buffer).toEqual(before[path].utf8);
  }
  for (const path of ["no-search/.", "no-search/child.txt", "no-search/missing", "no-search/../readable.txt"]) {
    expect(before[path].exists).toEqual({ value: false });
    expect(before[path].stat).toEqual(failure("EACCES", "stat", path));
    expect(before[path].utf8).toEqual(failure("EACCES", "open", path));
    expect(before[path].buffer).toEqual(before[path].utf8);
  }
  expect(before["/"].stat).toEqual({ file: false, directory: true });
});

test("a directory can allow traversal but deny reads before an EISDIR result", () => {
  const { before } = native("permissions");
  for (const path of ["no-read", "no-read/", "no-read/."]) {
    expect(before[path].exists).toEqual({ value: true });
    expect(before[path].stat).toEqual({ file: false, directory: true });
    expect(before[path].utf8).toEqual(failure("EACCES", "open", path));
    expect(before[path].buffer).toEqual(before[path].utf8);
  }
  expect(before["no-read/child.txt"].utf8).toEqual({ text: "child", bytes: 5 });
});

test("an existing cwd remains a starting directory when an ancestor loses search permission", () => {
  const observed = native("cwd");
  expect(observed.relative).toEqual({ text: "child", bytes: 5 });
  expect(observed.absolute).toEqual(failure("EACCES", "open", observed.directory + "/ancestor/cwd/child.txt"));
});

test("bounded real descriptor exhaustion precedes read traversal but leaves exists/stat usable", () => {
  const { before, exhausted, after, exhaustion, opened } = native("capacity");
  expect(exhaustion).toEqual({ code: "EMFILE", syscall: "open" });
  expect(opened).toBeGreaterThan(0);
  expect(opened).toBeLessThan(64);
  for (const path of ["readable.txt", "unreadable.txt", "missing", "no-search/child.txt", "no-read", "/"]) {
    expect(exhausted[path].exists).toEqual(before[path].exists);
    expect(exhausted[path].stat).toEqual(before[path].stat);
    expect(exhausted[path].utf8).toEqual(failure("EMFILE", "open", path));
    expect(exhausted[path].buffer).toEqual(exhausted[path].utf8);
  }
  // Linux getname rejects an empty path before allocating the descriptor;
  // macOS reaches descriptor exhaustion first. Do not erase that OS boundary.
  // https://github.com/torvalds/linux/blob/v6.12/fs/open.c#L1317-L1343
  // https://github.com/torvalds/linux/blob/v6.12/fs/namei.c#L144-L154
  expect(exhausted[""].utf8).toEqual(failure(process.platform === "linux" ? "ENOENT" : "EMFILE", "open", ""));
  expect(exhausted[""].buffer).toEqual(exhausted[""].utf8);
  for (const operation of ["utf8", "buffer"]) {
    expect(exhausted["bad\0path"][operation]).toMatchObject({ name: "TypeError", code: "ERR_INVALID_ARG_VALUE" });
  }
  expect(after).toEqual(before);
});
