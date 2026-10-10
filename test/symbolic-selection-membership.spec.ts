import { execFileSync } from "child_process";
import { evaluateCode, hasExecutionBoundary, isForkedCompletion, isThrownValue, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber } from "../src/types";
import { ESString } from "../src/string/String";
import { Any, TESBoolean } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const nodeBinary = process.env.PROPHET_NODE_BINARY || process.execPath;

function run(source: string, extra: { [name: string]: Any } = {}) {
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    first: ESBoolean(), second: ESBoolean(), ...extra
  });
  const [completion, context] = evaluateCode(source, initial);
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

function certain(value: Any, expected = true) {
  expect(value).toMatchObject({ type: "boolean", value: expected });
}

function uncertain(value: Any) {
  expect(value).toMatchObject({ type: "boolean" });
  expect((value as TESBoolean).value).toBeUndefined();
}

function nativeExhaustive(selection: string, probe: string, preamble = "const a = 0.1, b = 0.2, c = 0.3;") {
  assertPinnedNode();
  const source = `
    const results = [];
    for (const first of [false, true]) for (const second of [false, true]) {
      ${preamble}
      ${selection}
      results.push(${probe});
    }
    process.stdout.write(JSON.stringify(results));`;
  return JSON.parse(execFileSync(nodeBinary, ["-e", source],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }));
}

test("independent guards in matching candidate order prove exhaustive membership", () => {
  expect(nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ member: selected === a || selected === b || selected === c }"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  // Equal draws remain inside the declared [0, 1) domain and keep membership true.
  expect(nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ member: selected === a || selected === b || selected === c }",
    "const a = 0.2, b = 0.2, c = 0.2;"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const selected = first ? a : second ? b : c;
    const member = selected === a || selected === b || selected === c;
    const rejection = selected !== a && selected !== b && selected !== c;
  `);
  certain(scope.member);
  certain(scope.rejection, false);
});

test("independent guards in reverse candidate order prove exhaustive membership", () => {
  expect(nativeExhaustive(
    "const selected = first ? c : second ? b : a;",
    "{ member: selected === a || selected === b || selected === c }"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  expect(nativeExhaustive(
    "const selected = first ? c : second ? b : a;",
    "{ member: selected === a || selected === b || selected === c }",
    "const a = 0.2, b = 0.2, c = 0.2;"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const selected = first ? c : second ? b : a;
    const member = selected === a || selected === b || selected === c;
    const reordered = selected === c || selected === a || selected === b;
    const rejection = selected !== a && selected !== b && selected !== c;
  `);
  certain(scope.member);
  certain(scope.reordered);
  certain(scope.rejection, false);
});

test("renamed variables prove membership without name recognition", () => {
  const scope = run(`
    const x = Math.random(), y = Math.random(), z = Math.random();
    const picked = first ? z : second ? y : x;
    const member = picked === x || picked === y || picked === z;
  `);
  certain(scope.member);
});

test.each([
  "a || b || c", "a || c || b", "b || a || c",
  "b || c || a", "c || a || b", "c || b || a"
])("reverse selection proves membership for candidate order %s", (order) => {
  const disjuncts = order.split(" || ").map(name => `chosen === ${name}`).join(" || ");
  const conjuncts = order.split(" || ").map(name => `chosen !== ${name}`).join(" && ");
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const chosen = first ? c : second ? b : a;
    const proof = ${disjuncts};
    const rejected = ${conjuncts};
  `);
  certain(scope.proof);
  certain(scope.rejected, false);
});

test("forward selection proves membership for every candidate order", () => {
  const orders = [
    ["a", "b", "c"], ["a", "c", "b"], ["b", "a", "c"],
    ["b", "c", "a"], ["c", "a", "b"], ["c", "b", "a"]
  ];
  const lines = orders.map((names, index) => `
    const proof${index} = chosen === ${names[0]} || chosen === ${names[1]} || chosen === ${names[2]};
    const rejected${index} = chosen !== ${names[0]} && chosen !== ${names[1]} && chosen !== ${names[2]};
  `).join("\n");
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const chosen = first ? a : second ? b : c;
    ${lines}
  `);
  for (let index = 0; index < orders.length; index++) {
    certain(scope[`proof${index}`]);
    certain(scope[`rejected${index}`], false);
  }
});

test("comparison-driven selections without a loop prove membership", () => {
  expect(nativeExhaustive(
    "let selected = a; if (b < selected) selected = b; if (c < selected) selected = c;",
    "{ member: selected === a || selected === b || selected === c }"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  expect(nativeExhaustive(
    "let selected = a; if (b < selected) selected = b; if (c < selected) selected = c;",
    "{ member: selected === a || selected === b || selected === c }",
    "const a = 0.2, b = 0.2, c = 0.2;"
  )).toEqual([
    { member: true }, { member: true }, { member: true }, { member: true }
  ]);
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    let selected = a;
    if (b < selected) selected = b;
    if (c < selected) selected = c;
    const member = selected === a || selected === b || selected === c;
    const reordered = selected === c || selected === b || selected === a;
  `);
  certain(scope.member);
  certain(scope.reordered);
});

test("incomplete candidate lists stay unknown with both outcomes witnessed", () => {
  const native = nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ member: selected === a || selected === b }"
  );
  expect(native.map((row: { member: boolean }) => row.member)).toEqual([false, true, true, true]);
  // A tied tail coincides with a listed candidate, so the same partial
  // disjunction holds on every guard combination there.
  const tied = nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ member: selected === a || selected === b }",
    "const a = 0.2, b = 0.3, c = 0.2;"
  );
  expect(tied.map((row: { member: boolean }) => row.member)).toEqual([true, true, true, true]);
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const selected = first ? a : second ? b : c;
    const partial = selected === a || selected === b;
    const partialRejection = selected !== a && selected !== b;
  `);
  uncertain(scope.partial);
  uncertain(scope.partialRejection);
});

test("an unrelated fresh symbolic value stays unknown", () => {
  const nativeTrue = nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ hit: selected === d }",
    "const a = 0.1, b = 0.2, c = 0.3; const d = 0.2;"
  );
  expect(nativeTrue.map((row: { hit: boolean }) => row.hit)).toEqual([false, true, false, false]);
  const nativeFalse = nativeExhaustive(
    "const selected = first ? a : second ? b : c;",
    "{ hit: selected === d }",
    "const a = 0.1, b = 0.2, c = 0.3; const d = 0.99;"
  );
  expect(nativeFalse.map((row: { hit: boolean }) => row.hit)).toEqual([false, false, false, false]);
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const selected = first ? a : second ? b : c;
    const fresh = selected === d;
  `, { d: ESNumber() });
  // A fresh unknown number may coincide with the selection or not; without a
  // finite domain on d there is no exhaustive proof in either direction.
  uncertain(scope.fresh);
});

test("repeated and aliased candidates remain sound", () => {
  const scope = run(`
    const a = Math.random(), b = Math.random(), c = Math.random();
    const alias = a;
    const repeated = first ? a : second ? a : b;
    const repeatedMember = repeated === a || repeated === b;
    const aliased = first ? alias : second ? b : c;
    const aliasedMember = aliased === a || aliased === b || aliased === c;
    const aliasSelf = aliased === alias || aliased === b || aliased === c;
  `);
  certain(scope.repeatedMember);
  certain(scope.aliasedMember);
  certain(scope.aliasSelf);
});

test("a selected NaN need not equal even itself", () => {
  assertPinnedNode();
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const first of [false, true]) for (const second of [false, true]) {
        const a = NaN, b = 7, c = 8;
        const selected = first ? a : second ? b : c;
        results.push({ member: selected === a || selected === b || selected === c, self: selected === selected });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ member: boolean; self: boolean }>;
  // NaN-first path fails its own disjunction; finite paths satisfy it.
  expect(native.map(row => row.member)).toEqual([true, true, false, false]);
  expect(native.map(row => row.self)).toEqual([true, true, false, false]);
  const scope = run(`
    const selected = first ? nan : second ? b : c;
    const member = selected === nan || selected === b || selected === c;
    const self = selected === selected;
    const finite = selected === b ? !first && second : true;
  `, { nan: ESNumber(NaN), b: ESNumber(7), c: ESNumber(8) });
  uncertain(scope.member);
  uncertain(scope.self);
  certain(scope.finite);
});

test("unknown numbers that may be NaN cannot inherit the finite theorem", () => {
  const scope = run(`
    const b = Math.random(), c = Math.random();
    const selected = first ? input : second ? b : c;
    const member = selected === input || selected === b || selected === c;
    const self = selected === selected;
  `, { input: ESNumber() });
  uncertain(scope.member);
  uncertain(scope.self);
});

test("infinities, signed zero and concrete aliases use strict equality", () => {
  assertPinnedNode();
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const first of [false, true]) for (const second of [false, true]) {
        const a = 1 / 0, b = -1 / 0, c = 7;
        const selected = first ? a : second ? b : c;
        results.push({ member: selected === a || selected === b || selected === c });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  ));
  expect(native).toEqual([{ member: true }, { member: true }, { member: true }, { member: true }]);
  const scope = run(`
    const selected = first ? inf : second ? ninf : seven;
    const member = selected === inf || selected === ninf || selected === seven;
    const zeroBoth = zeroSelected === 0;
    const zeroNegative = zeroSelected === -0;
    const zeroUncertain = zeroSelected === 0 ? first : false;
    const aliasMember = aliasSelected === seven || aliasSelected === eight;
  `, {
    inf: ESNumber(Infinity), ninf: ESNumber(-Infinity), seven: ESNumber(7), eight: ESNumber(8),
    zeroSelected: ESNumber(-0), aliasSelected: ESNumber(7)
  });
  certain(scope.member);
  certain(scope.zeroBoth);
  certain(scope.zeroNegative);
  uncertain(scope.zeroUncertain);
  certain(scope.aliasMember);
});

test("mixed primitive selections discriminate without confusing equality", () => {
  const scope = run(`
    const selected = first ? str : num;
    const member = selected === str || selected === num;
    const cross = selected === other;
    const unknownCross = selected === input;
  `, { str: ESString("known"), num: ESNumber(7), other: ESString("other"), input: ESString() });
  certain(scope.member);
  certain(scope.cross, false);
  uncertain(scope.unknownCross);
});

test("object reference selections prove identity membership without field comparison", () => {
  const scope = run(`
    const left = { tag: 1 };
    const right = { tag: 1 };
    const third = { tag: 1 };
    const selected = first ? left : second ? right : third;
    const member = selected === left || selected === right || selected === third;
    const rejection = selected !== left && selected !== right && selected !== third;
    const outsider = selected === third;
    const freshObj = { tag: 1 };
    const fresh = selected === freshObj;
  `);
  certain(scope.member);
  certain(scope.rejection, false);
  uncertain(scope.outsider);
  certain(scope.fresh, false);
});

test("object aliases share identity while equal fields stay distinct", () => {
  const scope = run(`
    const left = { tag: 1 };
    const alias = left;
    const right = { tag: 1 };
    const selected = first ? alias : right;
    const member = selected === left || selected === right;
    const aliasProof = selected === left ? first : !first;
    const fieldProof = selected === left || selected === right;
  `);
  certain(scope.member);
  certain(scope.aliasProof);
  certain(scope.fieldProof);
});

test("a mixed NaN alternative poisons exhaustive membership", () => {
  assertPinnedNode();
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const first of [false, true]) for (const second of [false, true]) {
        const selected = first ? NaN : second ? "known" : 7;
        results.push({ member: selected === NaN || selected === "known" || selected === 7 });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ member: boolean }>;
  expect(native.map(row => row.member)).toEqual([true, true, false, false]);
  const scope = run(`
    const selected = first ? nan : second ? str : num;
    const member = selected === nan || selected === str || selected === num;
    const withoutNaN = selected === str || selected === num;
  `, { nan: ESNumber(NaN), str: ESString("known"), num: ESNumber(7) });
  uncertain(scope.member);
  uncertain(scope.withoutNaN);
});

test("a signed-zero choice proves membership while preserving its sign", () => {
  assertPinnedNode();
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const first of [false, true]) {
        const selected = first ? -0 : 0;
        results.push({
          member: selected === 0 || selected === -0,
          sign: 1 / selected === -Infinity ? "negative" : "positive"
        });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ member: boolean; sign: string }>;
  expect(native.map(row => row.member)).toEqual([true, true]);
  expect(native.map(row => row.sign)).toEqual(["positive", "negative"]);
  const scope = run(`
    const selected = first ? negZero : posZero;
    const member = selected === 0 || selected === -0;
    const preserved = first ? 1 / selected === -Infinity : 1 / selected === Infinity;
    const stillUncertain = selected === 0 ? first : false;
  `, { negZero: ESNumber(-0), posZero: ESNumber(0) });
  certain(scope.member);
  certain(scope.preserved);
  uncertain(scope.stillUncertain);
});

test("four leaves prove membership at the exploration bound", () => {
  assertPinnedNode();
  const nested = "g1 ? v3 : g2 ? v2 : g3 ? v1 : v0";
  const member = ["v0", "v1", "v2", "v3"].map(v => `chosen === ${v}`).join(" || ");
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const g1 of [false, true]) for (const g2 of [false, true]) for (const g3 of [false, true]) {
        const v0 = 0.1, v1 = 0.2, v2 = 0.3, v3 = 0.4;
        const chosen = ${nested};
        results.push({ member: ${member} });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ member: boolean }>;
  expect(native.every(row => row.member)).toBe(true);
  const scope = run(`
    const v0 = Math.random(), v1 = Math.random(), v2 = Math.random(), v3 = Math.random();
    const chosen = ${nested};
    const proof = ${member};
    const rejected = ${["v0", "v1", "v2", "v3"].map(v => `chosen !== ${v}`).join(" && ")};
    const hardOrder = chosen === v0 || chosen === v3 || chosen === v1 || chosen === v2;
  `, { g1: ESBoolean(), g2: ESBoolean(), g3: ESBoolean() });
  certain(scope.proof);
  certain(scope.rejected, false);
  // The same outer-consequent-second shape as the over-cap control below
  // proves within the bound, isolating the leaf cap as the difference.
  certain(scope.hardOrder);
});

test("five leaves stay unknown beyond the exploration bound without stopping", () => {
  assertPinnedNode();
  const nested = "g1 ? v4 : g2 ? v3 : g3 ? v2 : g4 ? v1 : v0";
  // The outer-consequent candidate second: rejecting it drops the outer
  // branch early and leaves a subproblem past the leaf bound, mirroring the
  // three-leaf a||c||b shape the pre-existing reasoner cannot finish.
  const member = ["v0", "v4", "v1", "v2", "v3"].map(v => `chosen === ${v}`).join(" || ");
  const native = JSON.parse(execFileSync(nodeBinary,
    ["-e", `
      const results = [];
      for (const g1 of [false, true]) for (const g2 of [false, true]) {
        const g3 = false, g4 = false;
        const v0 = 0.1, v1 = 0.2, v2 = 0.3, v3 = 0.4, v4 = 0.5;
        const chosen = ${nested};
        results.push({ member: ${member} });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ member: boolean }>;
  // Concretely exhaustive, so the unknown below is an explicit precision
  // bound rather than a feasible counterexample.
  expect(native.every(row => row.member)).toBe(true);
  const scope = run(`
    const v0 = Math.random(), v1 = Math.random(), v2 = Math.random();
    const v3 = Math.random(), v4 = Math.random();
    const chosen = ${nested};
    const proof = ${member};
  `, { g1: ESBoolean(), g2: ESBoolean(), g3: ESBoolean(), g4: ESBoolean() });
  uncertain(scope.proof);
});
