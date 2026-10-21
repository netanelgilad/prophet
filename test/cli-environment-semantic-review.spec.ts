// Independent P035 semantic review probes; authored against the accepted contract.
import { mkdtempSync, writeFileSync } from "fs";
import { removeSync } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { parseEnvironment } from "../src/cli/environment";
import { encodeGraph } from "../src/cli/graph";
import { runFile } from "../src/cli/runtime";
import { effectPaths, isExecutionBoundary, isForkedCompletion } from "../src";
import { BranchResult } from "../src/execution-context/branches";

let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "prophet-environment-semantic-")); });
afterEach(() => { removeSync(directory); });
function parse(value: unknown, raw = false) {
  const path = join(directory, "environment.json");
  writeFileSync(path, raw ? value as string : JSON.stringify(value));
  return parseEnvironment({ path, cwd: directory });
}
function selects(count: number): unknown {
  if (!count) return "/leaf";
  const left = Math.floor((count - 1) / 2);
  return { select: { condition: true, then: selects(left), else: selects(count - 1 - left) } };
}

test("request expanded weight accepts exactly 1024 and rejects 1025 before construction", () => {
  // 340 selects -> 1 + 3*340 = 1021; two refs above a leaf -> 3.
  const values = { method: "GET", alias: { ref: "method" } };
  expect(parse({ version: 1, values, http: { requests: {
    method: { ref: "alias" }, url: selects(340)
  } } }).requestInput!().url).toMatchObject({ value: "/leaf" });
  // Referencing the same 1021-work definition adds exactly one edge's work.
  expect(() => parse({ version: 1, values: { ...values, url: selects(340) }, http: { requests: {
    method: { ref: "alias" }, url: { ref: "url" }
  } } })).toThrow(/request method\/url work/);
});

test("expanded root depth includes each consumer reference and accepts 32 but rejects 33", () => {
  const values: Record<string, unknown> = { v0: true };
  for (let i = 1; i <= 31; i++) values["v" + i] = { ref: "v" + (i - 1) };
  const accepted = parse({ version: 1, values, filesystem: { descriptorAvailable: { ref: "v31" } } });
  expect(accepted.filesystem.descriptorAvailable).toBe(accepted.state.values.get("v0"));
  values.v32 = { ref: "v31" };
  expect(() => parse({ version: 1, values, filesystem: { descriptorAvailable: { ref: "v32" } } }))
    .toThrow(/expanded depth/);
});

test.each([
  { select: { condition: true, then: true, else: { ref: "missing" } } },
  { select: { condition: false, then: { ref: "a" }, else: true } },
  { select: { condition: true, then: true, else: "wrong type" } }
])("unused and constant-dead branches still validate: %j", definition => {
  expect(() => parse({ version: 1, values: { a: definition } })).toThrow(/unknown reference|cycle|same kind/);
});

test("decoded duplicate keys reject, including nested header and top-level duplicates", () => {
  expect(() => parse('{"version":1,"\\u0076ersion":1}', true)).toThrow(/duplicate/);
  expect(() => parse('{"version":1,"http":{"requests":{"method":"GET","url":"/","headers":{"x-a":"1","x-\\u0061":"2"}}}}', true))
    .toThrow(/duplicate/);
});

test("legal prototype-shaped header names are data and never inherited properties", () => {
  const environment = parse('{"version":1,"http":{"requests":{"method":"GET","url":"/","headers":{"constructor":"c","__proto__":"p","prototype":"t"}}}}', true);
  const headers = environment.requestInput!().headers!;
  expect(Object.getPrototypeOf(headers)).toBeNull();
  expect(Object.keys(headers).sort()).toEqual(["__proto__", "constructor", "prototype"]);
  expect(headers.__proto__).toBe("p");
  expect(headers.constructor).toBe("c");
});

test("arrival materialization preserves the complete initial graph without growing caches", () => {
  const environment = parse({ version: 1, values: { unused: { symbolic: "string" }, alias: { ref: "shared" }, shared: { symbolic: "string" } },
    http: { requests: { method: { ref: "alias" }, url: { symbolic: "string" } } } });
  const before = encodeGraph({ environment: environment.state });
  const first = environment.requestInput!(), second = environment.requestInput!();
  expect(first.method).toBe(second.method);
  expect(first.method).toBe(environment.state.values.get("shared"));
  expect(first.url).not.toBe(second.url);
  expect(encodeGraph({ environment: environment.state })).toEqual(before);
});

test("ordinary published-map mutators cannot rewrite future references or graph state", () => {
  const environment = parse({ version: 1, values: { url: "/original" },
    http: { requests: { method: "GET", url: { ref: "url" } } } });
  const before = encodeGraph({ environment: environment.state });
  const values = environment.state.values as Map<string, unknown>;
  expect(() => values.set("url", "changed")).toThrow(/immutable/);
  expect(() => values.delete("url")).toThrow(/immutable/);
  expect(() => values.clear()).toThrow(/immutable/);
  expect(environment.requestInput!().url).toMatchObject({ value: "/original" });
  expect(encodeGraph({ environment: environment.state })).toEqual(before);
});

function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0])
    ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test("guest request mutations cannot change shared declarations or the next arrival", () => {
  writeFileSync(join(directory, "environment.json"), JSON.stringify({ version: 1,
    values: { path: "/original" }, http: { requests: { method: "GET", url: { ref: "path" },
      headers: { constructor: "original" } } } }));
  writeFileSync(join(directory, "entry.cjs"), `require('http').createServer(function(req, res) {
    console.log(req.url + ":" + req.headers.constructor);
    req.url = '/mutated'; req.headers.constructor = 'mutated';
    console.log(req.url + ":" + req.headers.constructor); res.end();
  }).listen(8080);`);
  const result = runFile({ runtime: "node@24.21.0", script: "entry.cjs", environment: "environment.json",
    args: [], maxSteps: 100000, maxEvents: 2 }, directory);
  expect(result.diagnostic).toBeUndefined();
  expect(result.status).toBe("evaluated");
  expect(result.completion).toBeDefined();
  let doubleArrivals = 0;
  for (const [completion, context] of leaves([result.completion!, result.current])) {
    expect(isExecutionBoundary(completion)).toBe(false);
    for (const history of effectPaths(context.value.effects, context.value.knowledge)) {
      const count = history.events.filter(event => event.kind === "call" && event.call.operation === "http.server.request").length;
      const logs = history.events.filter(event => event.kind === "call" && event.call.operation === "console.log")
        .map(event => event.call.args.map(value => (value as any).value));
      expect(count).toBeLessThanOrEqual(2);
      if (count === 2) doubleArrivals++;
      const expected: string[][] = [];
      for (let i = 0; i < count; i++) expected.push(["/original:original"], ["/mutated:mutated"]);
      expect(logs).toEqual(expected);
    }
  }
  expect(doubleArrivals).toBeGreaterThan(0);
  const declared = result.initial.value.global.hostSlots!["node.environment"] as any;
  expect(declared.values.get("path")).toMatchObject({ value: "/original" });
  expect(result.current.value.global.hostSlots!["node.environment"]).toBe(declared);
});


test("invalid UTF-8 and a leading BOM reject before schema interpretation", () => {
  const prefix = Buffer.from('{"version":1,"values":{"text":"');
  const suffix = Buffer.from('"}}');
  expect(() => parse(Buffer.concat([prefix, Buffer.from([0xc0, 0xaf]), suffix]), true)).toThrow(/invalid UTF-8/);
  expect(() => parse("\ufeff" + '{"version":1}', true)).toThrow(/JSON/);
});

test("file bytes and decoded literal limits are independent exact boundaries", () => {
  const base = '{"version":1}';
  expect(parse(base + " ".repeat(262144 - base.length), true).state.values.size).toBe(0);
  expect(() => parse(base + " ".repeat(262145 - base.length), true)).toThrow(/size/);
  expect(parse({ version: 1, values: { text: "a".repeat(16384) } }).state.values.get("text"))
    .toMatchObject({ value: "a".repeat(16384) });
  expect(() => parse({ version: 1, values: { text: "a".repeat(16385) } })).toThrow(/string too long/);
});

test.each([
  { filesystem: { descriptorAvailable: true, ignored: false } },
  { http: { requests: { method: "GET", url: "/" }, ignored: false } },
  { http: { requests: { method: "GET", url: "/", ignored: false } } }
])("unknown nested schema keys reject instead of narrowing supplied inputs: %j", section => {
  expect(() => parse({ version: 1, ...section })).toThrow(/unknown.*key/);
});
