import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, isExecutionBoundary, hasExecutionBoundary, isForkedCompletion } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { BranchResult } from "../src/execution-context/branches";
import { getArrayElements } from "../src/execution-context/Heap";
import { TArray } from "../src/array/Array";
import { createConsoleModel } from "../src/node/console";
import { createOpaqueBuiltinModule } from "../src/node/opaque";
import { resolveBoolean } from "../src/symbolic";
import { Any, isThrownValue, TESBoolean, TESNumber } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function run(source: string, input: { [key: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, input));
}

function scope(source: string, input: { [key: string]: Any } = {}) {
  const [completion, context] = run(source, input);
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0])
    ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

// The native oracle checks the concrete expectation independently under pinned
// Node 24.21.0. Every compare source must define `proof` as true natively.
function compare(source: string) {
  assertPinnedNode();
  const native = execFileSync(nodeBinary,
    ["-e", source + ";process.stdout.write(JSON.stringify(proof));"],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(JSON.parse(native)).toBe(true);
  const result = scope(source);
  expect(result.proof).toMatchObject({ value: true });
  return result;
}

describe("for statement evaluation order", () => {
  test("initialization runs once, the test guards each body and the update follows each body", () => {
    const result = compare(`let events = [];
      for (let i = 0; i < 3; i++) { events.push(i); }
      let leaked = "visible";
      try { events.push(i); } catch (error) { leaked = error instanceof ReferenceError ? "hidden" : "wrong"; }
      const proof = events.length === 3 && events[0] === 0 && events[1] === 1 && events[2] === 2 && leaked === "hidden";`);
    expect(result).toBeDefined();
  });

  test("zero iterations skip the body and the update entirely", () => {
    compare(`let bodies = 0, updates = 0, tests = 0;
      function test(i) { tests = tests + 1; return i < 10; }
      for (let i = 10; test(i); updates = updates + 1) { bodies = bodies + 1; }
      const proof = bodies === 0 && updates === 0 && tests === 1;`);
  });

  test("an omitted test is true and an omitted update performs no step", () => {
    compare(`let rounds = 0;
      for (let i = 0; ; i++) { rounds = rounds + 1; if (i >= 2) break; }
      let count = 0;
      for (count = 0; count < 2;) { count = count + 1; }
      const proof = rounds === 3 && count === 2;`);
  });

  test("a throwing initializer propagates without running the test or body", () => {
    compare(`let tested = false, bodies = 0;
      function bomb() { throw "init"; }
      let caught = "";
      try { for (let i = bomb(); tested = true, i < 2; i++) { bodies = bodies + 1; } }
      catch (error) { caught = error; }
      const proof = caught === "init" && tested === false && bodies === 0;`);
  });

  test("a throwing test propagates with the prefix effects retained", () => {
    compare(`let seen = 0;
      function test() { if (seen === 1) throw "test"; return true; }
      let caught = "";
      try { for (let i = 0; test(); i++) { seen = seen + 1; if (seen === 3) break; } }
      catch (error) { caught = error; }
      const proof = caught === "test" && seen === 1;`);
  });

  test("a throwing update propagates without another body", () => {
    compare(`let bodies = 0;
      function step(i) { if (i === 1) throw "update"; return i + 1; }
      let caught = "";
      try { for (let i = 0; i < 4; i = step(i)) { bodies = bodies + 1; } }
      catch (error) { caught = error; }
      const proof = caught === "update" && bodies === 2;`);
  });

  test("return inside a loop body propagates the value without running the update", () => {
    compare(`function f() {
        let updates = 0;
        function step(i) { updates = updates + 1; return i + 1; }
        for (let i = 0; i < 5; i = step(i)) { if (i === 2) return i * 10; }
        return -1;
      }
      const proof = f() === 20;`);
  });
});

describe("for statement lexical iteration environments", () => {
  test("var keeps one shared hoisted identity across iterations", () => {
    compare(`const saved = [];
      let probe = "";
      for (var j = 0; j < 2; j++) saved.push(() => j);
      try { probe = String(j); } catch (error) { probe = "missing"; }
      const proof = saved[0]() === 2 && saved[1]() === 2 && probe === "2";`);
  });

  test("a self-reading let initializer throws ReferenceError and preserves the outer binding", () => {
    compare(`let i = 8, hit = false;
      try { for (let i = i; false;) {} } catch (error) { hit = error instanceof ReferenceError; }
      const proof = hit && i === 8;`);
  });

  test("let bindings stay invisible outside the loop and shadow the outer scope", () => {
    const result = run(`let i = "outer";
      for (let i = 0; i < 1; i++) {}
      const after = i;`);
    const context = result[1];
    expect(hasExecutionBoundary(result[0])).toBe(false);
    expect(context.value.scope.after).toMatchObject({ type: "string", value: "outer" });
  });

  test("initialization, body and update closures capture different iteration cells", () => {
    compare(`let origin, first, second, after;
      function step(capture, n) { after = capture; return n + 1; }
      for (let i = 0, capture = (origin = () => i); i < 2; i = step(() => i, i)) {
        if (i === 0) first = () => i; else second = () => i;
      }
      const proof = origin() === 0 && first() === 0 && second() === 1 && after() === 2;`);
  });

  test("writing an old captured cell does not change the current iteration", () => {
    compare(`let change, old, now;
      for (let i = 0; i < 2; i++) {
        if (i === 0) { change = () => { i = 70; }; old = () => i; }
        else { change(); now = () => i; }
      }
      const proof = old() === 70 && now() === 1;`);
  });

  test("const loop assignment throws TypeError while the first captured cell survives", () => {
    compare(`let caught = false, captured;
      try { for (const i = 0; i < 2; i++) { captured = () => i; } }
      catch (error) { caught = error instanceof TypeError; }
      const proof = caught && captured() === 0;`);
  });
});

describe("for statement break and continue", () => {
  test("break skips the update and the rest of the body", () => {
    compare(`let updates = 0, tails = 0;
      function step(i) { updates = updates + 1; return i + 1; }
      for (let i = 0; i < 5; i = step(i)) {
        if (i === 2) break;
        tails = tails + 1;
      }
      const proof = updates === 2 && tails === 2;`);
  });

  test("continue runs the update but skips the rest of the body", () => {
    compare(`let updates = 0, tails = 0;
      function step(i) { updates = updates + 1; return i + 1; }
      for (let i = 0; i < 4; i = step(i)) {
        if (i % 2 === 0) continue;
        tails = tails + 1;
      }
      const proof = updates === 4 && tails === 2;`);
  });

  test("nested loops consume their own unlabeled jumps", () => {
    compare(`let n = 0;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) { if (j === 1) continue; if (j === 3) break; n = n + 1; }
      }
      const proof = n === 6;`);
  });

  test("labeled statements and while loops remain honest unsupported boundaries", () => {
    const labeled = run(`foo: for (;;) { break foo; }`);
    expect(hasExecutionBoundary(labeled[0])).toBe(true);
    const loop = run(`let i = 0; while (i < 2) { i = i + 1; }`);
    expect(hasExecutionBoundary(loop[0])).toBe(true);
  });
});

describe("for statement interaction with try/finally", () => {
  test("a finally break replaces continue and a finally continue replaces break", () => {
    compare(`let updates = 0, rounds = 0;
      for (let i = 0; i < 3; updates = updates + 1) {
        rounds = rounds + 1;
        try { continue; } finally { break; }
      }
      let j = 0, finished = 0;
      for (; j < 3; j++) {
        try { break; } finally { finished = finished + 1; continue; }
      }
      const proof = rounds === 1 && updates === 0 && finished === 3 && j === 3;`);
  });

  test("a normal finally preserves break and a finalizer return replaces it", () => {
    compare(`function f() {
        let n = 0;
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 3; j++) { if (j === 0) continue; n = n + 1; break; }
        }
        for (;;) { try { return n; } finally { break; } }
        return n + 10;
      }
      const proof = f() === 12;`);
  });

  test("catch handles a guest throw from the body but loop jumps bypass it", () => {
    compare(`let catches = 0, bodies = 0;
      for (let i = 0; i < 4; i++) {
        try { if (i === 2) throw "jump"; if (i === 3) break; bodies = bodies + 1; }
        catch (error) { catches = catches + 1; }
      }
      const proof = catches === 1 && bodies === 2;`);
  });
});

describe("for statement symbolic jumps and effects", () => {
  test("symbolic break and continue retain finalizer and update correlation", () => {
    const selected = ESBoolean();
    const source = `let body = 0, update = 0, cleanup = 0;
      for (let i = 0; i < 2; i++) {
        body = body + 1;
        try { if (selected) break; else continue; }
        finally { cleanup = cleanup + 1; }
        update = update + 1;
      }
      const proof = selected ? body === 1 && cleanup === 1 : body === 2 && cleanup === 2;
      const unknown = body === 1;
      const skipped = update === 0;`;
    for (const concrete of [true, false]) {
      compare(`const selected = ${concrete};` + source);
    }
    const result = run(source, { selected });
    expect(resolveBoolean(result[1].value.scope.proof as TESBoolean, result[1].value.knowledge || [])).toBe(true);
    expect(resolveBoolean(result[1].value.scope.skipped as TESBoolean, result[1].value.knowledge || [])).toBe(true);
    expect(resolveBoolean(result[1].value.scope.unknown as TESBoolean, result[1].value.knowledge || [])).toBeUndefined();
  });

  test("loop-carried heap effects stay ordered on every path", () => {
    compare(`const saved = [];
      for (let i = 0; i < 3; i++) { saved.push(i * 2); }
      const proof = saved.length === 3 && saved[0] === 0 && saved[1] === 2 && saved[2] === 4;`);
  });

  test("an update boundary retains earlier body effects and a completed break sibling", () => {
    const output = createConsoleModel();
    const outcomes = leaves(run(`let seen = 0;
      try {
        for (let i = 0; i < 2; fs.readFileSync("x")) {
          seen = seen + 1; console.log("body"); if (selected) break;
        }
      } finally { console.log("finally"); }
      console.log("tail");`, { selected: ESBoolean(), console: output.module, fs: createOpaqueBuiltinModule("fs") }));
    expect(outcomes).toHaveLength(2);
    for (const [, context] of outcomes) {
      expect(context.value.scope.seen).toMatchObject({ value: 1 });
    }
    const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
    const finished = outcomes.filter(([value]) => !isExecutionBoundary(value));
    expect(stopped).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(output.inspectOutput(stopped[0][1])[0].chunks.map(chunk => chunk.value)).toEqual(["body\n"]);
    expect(output.inspectOutput(finished[0][1])[0].chunks.map(chunk => chunk.value))
      .toEqual(["body\n", "finally\n", "tail\n"]);
    expect(stopped[0][1].value.scope.i).toMatchObject({ value: 0 });
  });

  test("a later test stop retains a prior throw sibling and the full normal prefix", () => {
    const outcomes = leaves(run(`let seen = 0;
      function test() { if (seen === 2) fs.readFileSync("x"); return seen < 3; }
      for (; test();) { seen = seen + 1; if (seen === 1 && selected) throw "early"; }
      `, { selected: ESBoolean(), fs: createOpaqueBuiltinModule("fs") }));
    expect(outcomes).toHaveLength(2);
    const thrown = outcomes.find(([value]) => isThrownValue(value))!;
    const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
    expect(thrown[0]).toMatchObject({ value: { value: "early" } });
    expect(thrown[1].value.scope.seen).toMatchObject({ value: 1 });
    expect(stopped[1].value.scope.seen).toMatchObject({ value: 2 });
  });
});

describe("for statement budgets", () => {
  test("an omitted-test empty body stops as a budget boundary instead of hanging", () => {
    const [completion] = run(`for (;;) {}`);
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
  });

  test("a loop at the iteration limit completes while one more iteration stops", () => {
    const atLimit = scope(`let i = 0;
      for (; i < 1024; i++) {}
      const done = i;`);
    expect(atLimit.done).toMatchObject({ type: "number", value: 1024 });
    const [overCompletion, overContext] = run(`let i = 0;
      for (; i < 1025; i++) {}
      const done = i;`);
    expect(isExecutionBoundary(overCompletion)).toBe(true);
    expect(overCompletion).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
    expect((overContext.value.scope.i as TESNumber).value).toBe(1024);
  });

  test("already performed effects survive an over-limit stop", () => {
    const [completion, context] = run(`const saved = [];
      for (let i = 0; i < 2000; i++) { saved.push(i); }`);
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(completion).toMatchObject({ type: "ExecutionBoundary", kind: "budget" });
    // Array contents live in the persistent heap, so inspect them through the
    // shared heap helpers rather than the object's initial property table.
    const elements = getArrayElements(context.value.scope.saved as TArray<Any>, context)!;
    expect(elements).toHaveLength(1024);
    expect(elements[0]).toMatchObject({ value: 0 });
    expect(elements[1023]).toMatchObject({ value: 1023 });
  });

  test("nested loops each consume their own iteration budget", () => {
    const finished = scope(`let n = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 5; j++) { n = n + 1; }
      }
      const done = n;`);
    expect(finished.done).toMatchObject({ value: 20 });
    const [completion] = run(`for (let i = 0; i < 2; i++) {
        for (;;) {}
      }`);
    expect(isExecutionBoundary(completion)).toBe(true);
    expect(completion).toMatchObject({ kind: "budget" });
  });

  test("branching near the limit retains both the completed and the stopped leaf", () => {
    const outcomes = leaves(run(`let n = 0;
      for (let i = 0; i < 1025; i++) { if (i === 1023 && flag) break; n = n + 1; }
      `, { flag: ESBoolean() }));
    expect(outcomes).toHaveLength(2);
    const stopped = outcomes.filter(([value]) => isExecutionBoundary(value));
    const finished = outcomes.filter(([value]) => !isExecutionBoundary(value));
    expect(stopped).toHaveLength(1);
    expect(finished).toHaveLength(1);
    expect(stopped[0][0]).toMatchObject({ kind: "budget" });
    expect(stopped[0][1].value.scope.n).toMatchObject({ value: 1024 });
    expect(finished[0][1].value.scope.n).toMatchObject({ value: 1023 });
  });

  test("an infinite branch budget stops without running finally or losing its sibling", () => {
    const outcomes = leaves(run(`let n = 0, cleanup = 0;
      try { for (; selected;) { n = n + 1; } } finally { cleanup = 1; }
      `, { selected: ESBoolean() }));
    expect(outcomes).toHaveLength(2);
    const stopped = outcomes.find(([value]) => isExecutionBoundary(value))!;
    const normal = outcomes.find(([value]) => !isExecutionBoundary(value))!;
    expect(stopped[0]).toMatchObject({ kind: "budget" });
    expect((stopped[1].value.scope.n as TESNumber).value).toBeGreaterThan(0);
    expect(stopped[1].value.scope.cleanup).toMatchObject({ value: 0 });
    expect(normal[1].value.scope.n).toMatchObject({ value: 0 });
    expect(normal[1].value.scope.cleanup).toMatchObject({ value: 1 });
  });
});
