import { execFileSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESString } from "../src/string/String";
import { Any, isThrownValue, TESBoolean } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

function run(source: string, extra: { [name: string]: Any } = {}) {
  // Each guard is independent and admits both boolean values.
  const initial = setVariablesInScope(nodeInitialExecutionContext, {
    guard: ESBoolean(), other: ESBoolean(), ...extra
  });
  const [completion, context] = evaluateCode(source, initial);
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

test("a two-string choice exhausts a compound rejection guard", () => {
  const scope = run(`
    const method = guard ? "GET" : "HEAD";
    const rejected = method !== "GET" && method !== "HEAD";
    const accepted = method === "GET" || method === "HEAD";
  `);
  certain(scope.rejected, false);
  certain(scope.accepted);
});

test("equality of a choice to a distinguishing value recovers its selecting guard", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    const forward = value === "left" ? guard : !guard;
    const reverse = "right" === value ? !guard : guard;
    const uncertain = value === "left";
  `);
  certain(scope.forward);
  certain(scope.reverse);
  uncertain(scope.uncertain);
});

test("six shared equality selections preserve their original guard", () => {
  // Unroll a bounded shared expression graph; this verifies semantics without
  // promising a general complexity bound for deeper symbolic expressions.
  const layers = Array(6).fill("value = value === 'A' ? value : 'B';").join("\n");
  const scope = run(`
    let value = guard ? "A" : "B";
    ${layers}
    const proof = value === "A" ? guard : !guard;
    const uncertain = value === "A";
  `);
  certain(scope.proof);
  uncertain(scope.uncertain);
});

test("negated equality and strict inequality retain the same discriminating facts", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    const negated = !(value === "left") ? !guard : guard;
    const inequality = "left" !== value ? !guard : guard;
    const impossible = !(value === "left") && !(value === "right");
  `);
  certain(scope.negated);
  certain(scope.inequality);
  certain(scope.impossible, false);
});

test("equal finite domains from independently allocated comparisons stay correlated", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    const first = value === "left";
    const second = value === "left";
    const swapped = "left" === value;
    const proof = first === second && first === swapped;
  `);
  certain(scope.proof);
  uncertain(scope.first);
});

test("nested choices exhaust three alternatives without knowing either guard", () => {
  const scope = run(`
    const value = guard ? "first" : other ? "second" : "third";
    const proof = value === "first" || value === "second" || value === "third";
    const impossible = value !== "first" && value !== "second" && value !== "third";
    const second = value === "second" ? !guard && other : true;
    const third = value === "third" ? !guard && !other : true;
  `);
  certain(scope.proof);
  certain(scope.impossible, false);
  certain(scope.second);
  certain(scope.third);
});

test("a repeated nested leaf does not choose between two feasible selecting paths", () => {
  const scope = run(`
    const value = guard ? "same" : other ? "same" : "different";
    const uniqueLeaf = value === "different" ? !guard && !other : true;
    const disjunction = value === "different" ? !guard && !other : guard || other;
    const stillUncertain = value === "same" ? guard : false;
  `);
  certain(scope.uniqueLeaf);
  // This is true in JavaScript, but retaining a disjunctive relation and
  // reapplying it after a later guard is still a tracked precision gap.
  uncertain(scope.disjunction);
  uncertain(scope.stillUncertain);
});

test("facts shared by both feasible alternatives survive choice discrimination", () => {
  const scope = run(`
    const value = guard ? other ? "same" : "left" : other ? "same" : "right";
    const proof = value === "same" ? other : !other;
    const stillUncertain = value === "same" ? guard : !guard;
  `);
  certain(scope.proof);
  uncertain(scope.stillUncertain);
});

for (const [left, right] of [
  ['0', '"0"'],
  ['null', 'undefined'],
  ['false', '0'],
  ['7', '8'],
  ['""', 'null']
]) {
  test(`strict choice discrimination preserves distinct ${left} and ${right}`, () => {
    const scope = run(`
      const value = guard ? ${left} : ${right};
      const proof = value === ${left} ? guard : !guard;
      const exhaustive = value === ${left} || value === ${right};
    `);
    certain(scope.proof);
    certain(scope.exhaustive);
  });
}

test("object identity discriminates choices while equal fields do not alias objects", () => {
  const scope = run(`
    const left = { value: 1 };
    const right = { value: 1 };
    const third = { value: 1 };
    const selected = guard ? left : right;
    const proof = selected === left ? guard : !guard;
    const exhaustive = selected === left || selected === right;
    const different = selected === third;
  `);
  certain(scope.proof);
  certain(scope.exhaustive);
  certain(scope.different, false);
});

test("function identity discriminates choices without comparing function bodies", () => {
  const scope = run(`
    function left() { return 1; }
    function right() { return 1; }
    const selected = guard ? left : right;
    const proof = selected === left ? guard : !guard;
    const exhaustive = selected === left || selected === right;
    const result = selected();
  `);
  certain(scope.proof);
  certain(scope.exhaustive);
  expect(scope.result).toMatchObject({ value: 1 });
});

test("NaN remains unequal to itself but the other finite alternative discriminates", () => {
  const scope = run(`
    const value = guard ? NaN : 7;
    const finite = value === 7 ? !guard : guard;
    const neverNaN = value === NaN;
    const self = value === value;
    const selfProof = self ? !guard : guard;
  `);
  certain(scope.finite);
  certain(scope.neverNaN, false);
  uncertain(scope.self);
  certain(scope.selfProof);
});

test("strict equality merges signed-zero answers without erasing the selected zero", () => {
  const scope = run(`
    const value = guard ? -0 : 0;
    const bothZero = value === 0;
    const bothNegativeZero = value === -0;
    const stillUncertain = value === 0 ? guard : false;
    const preserved = guard ? 1 / value === -Infinity : 1 / value === Infinity;
  `);
  certain(scope.bothZero);
  certain(scope.bothNegativeZero);
  uncertain(scope.stillUncertain);
  certain(scope.preserved);
});

test("independent choices retain all four combinations", () => {
  const scope = run(`
    const left = guard ? "same" : "different";
    const right = other ? "same" : "different";
    const equal = left === right;
    const unrelated = left === "same" ? other : !other;
    const proof = left === "same"
      ? right === "same" ? guard && other : guard && !other
      : right === "same" ? !guard && other : !guard && !other;
  `);
  uncertain(scope.equal);
  uncertain(scope.unrelated);
  certain(scope.proof);
});

test("equality between independent choices keeps unresolved guard relationships unknown", () => {
  const scope = run(`
    const left = guard ? "left" : "right";
    const right = other ? "left" : "right";
    const equal = left === right;
    const relationship = equal
      ? guard ? other : !other
      : guard ? !other : other;
  `);
  uncertain(scope.equal);
  // All four concrete inputs satisfy this relationship. The solver currently
  // keeps only facts common to feasible branches, not a relation between guards.
  uncertain(scope.relationship);
});

test("a partially accepting result remains unknown when both outcomes are possible", () => {
  const scope = run(`
    const value = guard ? "accepted" : "rejected";
    const accepted = value === "accepted" || value === "third";
    const rejected = value !== "accepted" && value !== "third";
  `);
  uncertain(scope.accepted);
  uncertain(scope.rejected);
});

test("an unknown string alternative may also equal the distinguishing constant", () => {
  const scope = run(`
    const value = guard ? "known" : input;
    const same = value === "known";
    const stillUncertain = same ? guard : false;
    const differentImpliesOther = !same ? !guard : true;
  `, { input: ESString() });
  uncertain(scope.same);
  uncertain(scope.stillUncertain);
  certain(scope.differentImpliesOther);
});

test("an unknown equality result inside a choice does not become a concrete answer", () => {
  const scope = run(`
    const value = guard ? input : "fallback";
    const probe = value === "probe";
    const proof = probe ? guard : true;
    const uncertainGuard = !probe ? guard : false;
  `, { input: ESString() });
  uncertain(scope.probe);
  certain(scope.proof);
  uncertain(scope.uncertainGuard);
});

test("discriminating equality retains branch-specific heap writes and aliases", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    const box = { result: 0 };
    const alias = box;
    if (value === "left") box.result = 11;
    else box.result = 22;
    const proof = guard ? alias.result === 11 : alias.result === 22;
    const reverse = alias.result === 11 ? guard : !guard;
  `);
  certain(scope.proof);
  certain(scope.reverse);
});

test("exhausted guards skip unreachable calls and their thrown exceptions", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    let calls = 0;
    function fail() { calls = calls + 1; throw "unreachable"; }
    const rejected = value !== "left" && value !== "right" && fail();
    const accepted = value === "left" || value === "right" || fail();
  `);
  certain(scope.rejected, false);
  certain(scope.accepted);
  expect(scope.calls).toMatchObject({ value: 0 });
});

test("a reachable throw remains correlated with the selecting guard after catch", () => {
  const scope = run(`
    const value = guard ? "left" : "right";
    let trace = "";
    let caught = false;
    try {
      if (value === "left") { trace = trace + "L"; throw "left"; }
      trace = trace + "R";
    } catch (error) { caught = error === "left"; }
    const proof = guard ? caught && trace === "L" : !caught && trace === "R";
  `);
  certain(scope.proof);
  uncertain(scope.caught);
});

test("finite-choice proofs agree with exhaustive pinned Node executions", () => {
  assertPinnedNode();
  const source = `
    const value = guard ? "GET" : other ? "HEAD" : "POST";
    const exhaustive = value === "GET" || value === "HEAD" || value === "POST";
    const rejection = value !== "GET" && value !== "HEAD" && value !== "POST";
    const discriminated = value === "HEAD" ? !guard && other : true;
    const left = guard ? NaN : -0;
    const right = other ? NaN : 0;
    const equal = left === right;
  `;
  const native = JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", `const results = [];
      for (const guard of [false, true]) for (const other of [false, true]) {
        ${source}
        results.push({ exhaustive, rejection, discriminated, equal });
      }
      process.stdout.write(JSON.stringify(results));`],
    { encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } }
  )) as Array<{ exhaustive: boolean; rejection: boolean; discriminated: boolean; equal: boolean }>;
  expect(native.map(result => result.exhaustive)).toEqual([true, true, true, true]);
  expect(native.map(result => result.rejection)).toEqual([false, false, false, false]);
  expect(native.map(result => result.discriminated)).toEqual([true, true, true, true]);
  expect(native.map(result => result.equal)).toEqual([true, false, false, false]);
  const scope = run(source);
  certain(scope.exhaustive);
  certain(scope.rejection, false);
  certain(scope.discriminated);
  uncertain(scope.equal);
});
