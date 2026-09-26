import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { TESBoolean, isThrownValue } from "../src/types";

const scope = (code: string) => evaluateCode(code, nodeInitialExecutionContext)[1].value.scope;

test("routing preserves relationships between string returns, early exits, and aliased writes", () => {
  const result = scope(`
    function route(score, record) {
      if (score < 0.5) {
        record.lane = "left";
        record.accepted = true;
        return "left";
      }
      record.lane = "right";
      record.accepted = false;
      return "right";
    }

    const score = Math.random();
    const record = { lane: "pending", accepted: false };
    const alias = record;
    const lane = route(score, record);

    const consistent = lane === alias.lane;
    const valid = score < 0.5
      ? lane === "left" && alias.accepted
      : lane === "right" && !alias.accepted;
    const impossible = score < 0.5 && lane === "right";
    const uncertain = lane === "left";
  `);
  expect(result.consistent).toMatchObject({ type: "boolean", value: true });
  expect(result.valid).toMatchObject({ type: "boolean", value: true });
  expect(result.impossible).toMatchObject({ type: "boolean", value: false });
  expect((result.uncertain as TESBoolean).value).toBeUndefined();
  expect((result.lane as { value?: string }).value).toBeUndefined();
});

test("fallthrough and several early returns share the same branch machinery", () => {
  const result = scope(`
    function classify(n) {
      if (n < 0.25) return "low";
      if (n > 0.75) return "high";
      return "middle";
    }
    const n = Math.random();
    const category = classify(n);
    const proof = n < 0.25 ? category === "low"
      : n > 0.75 ? category === "high" : category === "middle";
    function maybe(n) { if (n < 0.5) return 7; }
    const value = maybe(n);
    const partial = n < 0.5 ? value === 7 : value === undefined;
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.partial).toMatchObject({ value: true });
});

test("conditional calls and impossible alternatives retain lazy evaluation", () => {
  const result = scope(`
    const condition = Math.random() < 0.5;
    function one() { return 1; }
    function two() { return 2; }
    const fn = condition ? one : two;
    const result = fn();
    const proof = condition ? result === 1 : result === 2;
    const mixed = condition ? 1 : {};
    const safe = condition ? mixed + 1 === 2 : true;
    const negative = condition ? -mixed === -1 : true;
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.safe).toMatchObject({ value: true });
  expect(result.negative).toMatchObject({ value: true });
});

test("concrete throw is still an abrupt completion", () => {
  const [result, context] = evaluateCode(`throw "failure";`, nodeInitialExecutionContext);
  expect(isThrownValue(result)).toBe(true);
  expect(result).toMatchObject({ value: { value: "failure" } });
  expect(context.value.uncaught).toMatchObject({ value: "failure" });
  expect(context.value.stderr).toBe("failure");
});
