import { CapturedSource } from "./source-capture";

export type ProgramCapture = {
  runtime: "node@24.21.0";
  filename: string;
  args: ReadonlyArray<string>;
  cwd: string;
  sources: ReadonlyMap<string, CapturedSource>;
  paths: ReadonlyMap<string, "file" | "directory" | "missing">;
};
export type SourceIdentity = { readonly sha256: string; readonly byteLength: number };
export type ProgramSnapshot = {
  readonly runtime: "node@24.21.0";
  readonly filename: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly source: SourceIdentity;
  readonly sources: ReadonlyMap<string, SourceIdentity>;
  readonly paths: ReadonlyMap<string, "file" | "directory" | "missing">;
};

function fail(detail: string): never {
  throw new Error(`Program identity publication failed: ${detail}`);
}

function immutableMap<K, V>(map: Map<K, V>): ReadonlyMap<K, V> {
  // Guard ordinary embedding mistakes without adding enumerable graph fields.
  // This is not a membrane against hostile Map.prototype calls in native code.
  const reject = (): never => { throw new TypeError("Program identity maps are immutable"); };
  Object.defineProperties(map, {
    set: { value: reject }, delete: { value: reject }, clear: { value: reject }
  });
  Object.freeze(map);
  return map;
}

/**
 * Publish a final union of acquisition observations, not execution history or a
 * machine snapshot. No source text is accessed and no new native probe occurs.
 * Native source capture and the rest of the VM graph have separate resource gaps.
 */
export function snapshotProgram(input: ProgramCapture): ProgramSnapshot {
  if (input.sources.size > 4096) fail("sources exceed 4096 entries");
  if (input.paths.size > 16384) fail("paths exceed 16384 entries");
  if (input.args.length > 4096) fail("args exceed 4096 entries");
  let remaining = 4 * 1024 * 1024;
  const count = (value: string) => {
    if (typeof value !== "string") fail("metadata must contain strings");
    // UTF-8 bytes are at least the JS code-unit count. Reject enormous input
    // cheaply before the scan, then charge exact UTF-8 metadata bytes. JSON
    // escaping and the other graph contents can make serialized output larger.
    if (value.length > remaining) fail("metadata exceeds 4194304 UTF-8 bytes");
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > remaining) fail("metadata exceeds 4194304 UTF-8 bytes");
    remaining -= bytes;
  };
  count(input.runtime); count(input.filename); count(input.cwd);
  for (const arg of input.args) count(arg);
  if (!input.sources.has(input.filename)) fail("entry source identity is missing");
  for (const [path, source] of input.sources) {
    count(path); count(source.sha256);
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail("sha256 must be a lowercase 64-digit digest");
    if (!Number.isSafeInteger(source.byteLength) || source.byteLength < 0) {
      fail("byteLength must be a nonnegative safe integer");
    }
  }
  for (const [path, kind] of input.paths) {
    count(path); count(kind);
    if (kind !== "file" && kind !== "directory" && kind !== "missing") fail("unknown path kind");
  }

  // All admission checks finish before copying any public container or record.
  // The entry alias refers to this map's record and adds no second byte charge.
  const sources = new Map<string, SourceIdentity>();
  for (const [path, source] of input.sources) {
    sources.set(path, Object.freeze({ sha256: source.sha256, byteLength: source.byteLength }));
  }
  return Object.freeze({ runtime: input.runtime, filename: input.filename,
    args: Object.freeze(input.args.slice()), cwd: input.cwd,
    source: sources.get(input.filename)!, sources: immutableMap(sources),
    paths: immutableMap(new Map(input.paths)) });
}
