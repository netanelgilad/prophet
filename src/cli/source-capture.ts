import { createHash } from "crypto";
import { lstatSync, readFileSync, realpathSync } from "fs";
import { dirname, isAbsolute, normalize, sep } from "path";
import { ModuleSource } from "../require/resolution";

export type CapturedSource = { text: string; sha256: string };
type PathKind = "file" | "directory" | "missing";

/**
 * Read-only acquisition for the resolver. First observations are shared across
 * branches; evaluated module contents/cache remain in the VM heap. This is not
 * an atomic OS snapshot or the target's modeled fs module.
 */
export function captureModuleSources() {
  const files = new Map<string, CapturedSource>();
  const paths = new Map<string, PathKind>();
  const kind = (filename: string): PathKind => {
    if (sep !== "/") throw new Error("CLI module acquisition currently requires POSIX paths");
    if (!isAbsolute(filename) || normalize(filename) !== filename || filename.includes("\0")) {
      throw new Error("CLI module acquisition requires normalized absolute paths without null bytes");
    }
    if (paths.has(filename)) return paths.get(filename)!;
    const parent = dirname(filename);
    // Check every component, including directory symlinks and ENOTDIR cases.
    if (parent !== filename && kind(parent) !== "directory") {
      paths.set(filename, "missing");
      return "missing";
    }
    let stat;
    try {
      stat = lstatSync(filename);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      paths.set(filename, "missing");
      return "missing";
    }
    if (stat.isSymbolicLink()) throw new Error("CLI dependency symlinks are not yet supported");
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error("CLI module acquisition requires a regular file or directory");
    }
    if (realpathSync(filename) !== filename) {
      throw new Error("CLI dependency filename aliases are not yet supported");
    }
    const result = stat.isFile() ? "file" : "directory";
    paths.set(filename, result);
    return result;
  };
  const readFile = (filename: string): string | undefined => {
    const type = kind(filename);
    if (type === "missing") return undefined;
    if (type !== "file") throw new Error("CLI source acquisition requires a regular file");
    if (!files.has(filename)) {
      // An error after a positive probe is an acquisition failure, not evidence
      // that this source was absent from the starting environment.
      const bytes = readFileSync(filename);
      const text = bytes.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(bytes)) {
        throw new Error("CLI source acquisition currently requires valid UTF-8 bytes");
      }
      files.set(filename, { text, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    return files.get(filename)!.text;
  };
  const source: ModuleSource = {
    isFile: filename => kind(filename) === "file",
    isDirectory: filename => kind(filename) === "directory",
    readFile
  };
  return { source, files, paths };
}
