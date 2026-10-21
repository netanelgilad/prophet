import { mkdtempSync, symlinkSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { parseEnvironment } from "../src/cli/environment";
import { isESBoolean } from "../src/types";

const cwd = mkdtempSync(join(tmpdir(), "prophet-env-"));
afterAll(() => removeSync(cwd));

function writeEnvironment(name: string, text: string | Buffer): string {
  const path = join(cwd, name);
  writeFileSync(path, text);
  return path;
}

function parse(text: string | Buffer) {
  return parseEnvironment({ path: writeEnvironment(`env-${Math.random().toString(36).slice(2)}.json`, text), cwd });
}

function reject(text: string | Buffer) {
  expect(() => parse(text)).toThrow();
}

test("a minimal valid environment materializes an empty graph state", () => {
  const environment = parse('{"version":1}');
  expect(environment.state.provenance.version).toBe(1);
  expect(environment.state.provenance.path).toMatch(/env-[a-z0-9]+\.json$/);
  expect(environment.state.provenance.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(environment.state.values.size).toBe(0);
  expect(environment.state.requests).toBeUndefined();
  expect(environment.requestInput).toBeUndefined();
  expect(environment.filesystem.descriptorAvailable).toBeUndefined();
});

test("a full environment materializes shared values, filesystem facts and a request template", () => {
  const environment = parse(JSON.stringify({
    version: 1,
    values: {
      available: { symbolic: "boolean" },
      head: { symbolic: "boolean" },
      method: { select: { condition: { ref: "head" }, then: "HEAD", else: "GET" } }
    },
    filesystem: {
      descriptorAvailable: { ref: "available" },
      emptyPathBeforeOpenDescriptorCheck: false
    },
    http: {
      requests: {
        method: { ref: "method" },
        url: { select: { condition: { ref: "head" }, then: "/docs", else: "/index.txt" } },
        headers: { accept: "text/plain" }
      }
    }
  }));
  expect([...environment.state.values.keys()].sort()).toEqual(["available", "head", "method"]);
  expect(isESBoolean(environment.filesystem.descriptorAvailable!)).toBe(true);
  expect(environment.state.values.get("available")).toBe(environment.filesystem.descriptorAvailable);
  expect(environment.state.requests).toMatchObject({ headers: { accept: "text/plain" } });
  expect(typeof environment.requestInput).toBe("function");
  const first = environment.requestInput!();
  const second = environment.requestInput!();
  // Fresh inline symbolic leaves are distinct per call; shared refs alias the same object.
  expect(first.method).toBe(environment.state.values.get("method"));
  expect(first.url).not.toBe(second.url);
});

test("forward references resolve and escaped surrogates are accepted as data", () => {
  parse(JSON.stringify({
    version: 1,
    values: { later: { ref: "earlier" }, earlier: "ok" },
    http: { requests: { method: { ref: "later" }, url: "\ud800/index" } }
  }));
});

test.each([
  ['{"version":2}', "version"],
  ['{"version":"1"}', "version"],
  ['{}', "version"],
  ['{"version":1,"unknown":{}}', "unknown"],
  ['{"version":1,"values":{"a":{"symbolic":"boolean"},"b":{"ref":"missing"}}}', "missing"],
  ['{"version":1,"values":{"a":{"ref":"a"}}}', "cycle"],
  ['{"version":1,"values":{"a":{"ref":"b"},"b":{"ref":"a"}}}', "cycle"],
  ['{"version":1,"values":{"a":{"symbolic":"boolean"},"b":{"ref":"constructor"}}}', "constructor"],
  ['{"version":1,"values":{"a":{"symbolic":"boolean"},"b":{"ref":"__proto__"}}}', "__proto__"],
  ['{"version":1,"filesystem":{"descriptorAvailable":"yes"}}', "Boolean"],
  ['{"version":1,"http":{"requests":{"method":"GET"}}}', "url"],
  ['{"version":1,"http":{"requests":{"url":"/"}}}', "method"],
  ['{"version":1,"http":{"requests":{"method":"GET","url":"/","headers":{"Accept":"x"}}}}', "token"],
  ['{"version":1,"http":{"requests":{"method":"GET","url":"/","headers":{"accept":5}}}}', "string"],
  ['{"version":1,"http":{"requests":{"method":"GET","url":"/","unknown":1}}}', "unknown"],
  ['{"version":1,"values":{"a":{}}}', "expression"],
  ['{"version":1,"values":{"a":{"select":{"condition":{"symbolic":"boolean"},"then":true,"else":"GET"}}}}', "kind"],
  ['{"version":1,"values":{"a":{"symbolic":"number"}}}', "symbolic"],
  ['{"version":1,"values":{"a":{"symbolic":"boolean","x":1}}}', "symbolic"],
  ['{"version":1,"values":{"a":1}}', "expression"],
  ['{"version":1,"filesystem":{"descriptorAvailable":{"ref":"x"},"emptyPathBeforeOpenDescriptorCheck":true},"values":{}}', "x"],
  ['{"version":1} trailing', "trailing"],
  ['{"version":1,"values":{"a":true,"a":false}}', "duplicate"],
  ['{"version":1,"values":{"a":"unterminated}}', "invalid"]
])("rejects invalid environment input: %s", (text, _detail) => reject(text));

test("a repeated DAG whose tiny syntax exceeds the expanded work bound rejects", () => {
  // w0=1; wn=4+2*w(n-1). Twelve levels exceed the aggregate 4096 cap.
  const values: Record<string, unknown> = { x0: { symbolic: "boolean" } };
  for (let level = 1; level <= 12; level += 1) {
    const previous = { ref: `x${level - 1}` };
    values[`x${level}`] = { select: { condition: { symbolic: "boolean" }, then: previous, else: previous } };
  }
  expect(() => parse(JSON.stringify({ version: 1, values }))).toThrow(/expanded work/);
});

test("a nearby repeated DAG within the expanded work bound accepts", () => {
  const environment = parse(JSON.stringify({
    version: 1,
    values: {
      a: { symbolic: "boolean" },
      b: { select: { condition: { symbolic: "boolean" }, then: { ref: "a" }, else: { ref: "a" } } },
      c: { select: { condition: { symbolic: "boolean" }, then: { ref: "b" }, else: { ref: "b" } } }
    }
  }));
  expect([...environment.state.values.keys()].sort()).toEqual(["a", "b", "c"]);
});

test("a deep reference chain beyond the expanded depth bound rejects", () => {
  const values: Record<string, unknown> = {};
  for (let level = 0; level < 40; level += 1) values[`d${level}`] = { ref: `d${level + 1}` };
  values.d40 = true;
  reject(JSON.stringify({ version: 1, values }));
});

test("missing, directory and symlink environment paths reject before any graph", () => {
  expect(() => parseEnvironment({ path: join(cwd, "does-not-exist.json"), cwd })).toThrow();
  expect(() => parseEnvironment({ path: cwd, cwd })).toThrow();
  const target = writeEnvironment("target.json", '{"version":1}');
  const link = join(cwd, "link.json");
  symlinkSync(target, link);
  expect(() => parseEnvironment({ path: link, cwd })).toThrow();
});
