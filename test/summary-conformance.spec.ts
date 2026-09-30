import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESNumber, TESNumber, TESBoolean } from "../src/types";
import { symbolicNumberArray } from "../src/array/symbolic";
import { setVariablesInScope, TExecutionContext } from "../src/execution-context/ExecutionContext";
import { getInferredSummaries, InferredSummary } from "../src/Function/summaries";

function finiteTemplate(): TESNumber {
  const element = ESNumber();
  element.knowledge = [{ kind: "finite", subject: element }];
  return element;
}

function inputFor(element = finiteTemplate()) {
  return symbolicNumberArray({ minimumLength: 1, element });
}

function execute(source: string, context: TExecutionContext = nodeInitialExecutionContext): TExecutionContext {
  const [, result] = evaluateCode(source, context);
  expect(result.value.uncaught).toBeUndefined();
  return result;
}

function define(body: string): TExecutionContext {
  return execute(`function fold(a) { ${body} }`);
}

function infer(body: string) {
  const context = execute("const result = fold(input);",
    setVariablesInScope(define(body), { input: inputFor() }));
  const summaries = getInferredSummaries(context.value.scope.fold);
  expect(summaries).toHaveLength(1);
  return { context, summary: summaries[0] };
}

const domain = [-1, -0, 0, 1];

function smallArrays(): number[][] {
  const arrays: number[][] = [];
  let frontier: number[][] = [[]];
  for (let length = 1; length <= 4; length++) {
    const next: number[][] = [];
    for (const prefix of frontier) {
      for (const element of domain) {
        const array = prefix.concat([element]);
        arrays.push(array);
        next.push(array);
      }
    }
    frontier = next;
  }
  return arrays;
}

function display(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function crossCheck(body: string, summary: InferredSummary) {
  // The independent host oracle executes precisely the body analyzed by
  // Prophet. It does not implement minimum/maximum on the evaluator's behalf.
  const concrete = Function(`return function fold(a) { ${body} };`)() as
    (array: number[]) => number;
  const arrays = smallArrays();
  expect(arrays).toHaveLength(340);
  let claims = 0;
  for (const array of arrays) {
    const result = concrete(array.slice());
    for (const fact of summary.facts) {
      const valid = fact === "finite" ? Number.isFinite(result)
        : fact === "notNaN" ? !Number.isNaN(result)
        : array.every(element => fact === "lower" ? result <= element : result >= element);
      if (!valid) {
        throw new Error(`Unsound ${fact}: [${array.map(display).join(", ")}] ` +
          `returned ${display(result)}`);
      }
      claims++;
    }
  }
  expect(claims).toBeGreaterThanOrEqual(680);
}

const minimum = `
  if (a.length === 1) return a[0];
  const rest = fold(a.slice(1));
  return a[0] < rest ? a[0] : rest;
`;

const maximum = `
  if (a.length === 1) return a[0];
  const rest = fold(a.slice(1));
  if (a[0] > rest) return a[0];
  return rest;
`;

describe("recursive summaries agree with concrete JavaScript", () => {
  for (const [name, body, direction, operator] of [
    ["minimum", minimum, "lower", "<="],
    ["maximum", maximum, "upper", ">="]
  ]) {
    test(`${name}: all inferred claims hold for every small finite array`, () => {
      const { context, summary } = infer(body);
      expect(summary.facts).toEqual(["finite", "notNaN", direction]);
      crossCheck(body, summary);

      // Check that quantified facts become usable comparisons, including reads
      // whose presence is learned from a length guard rather than the shape.
      const checked = execute([0, 1, 2, 3].map(index =>
        `const proof${index} = input.length > ${index} ` +
        `? result ${operator} input[${index}] : true;`
      ).join("\n"), context);
      for (let index = 0; index < 4; index++) {
        expect(checked.value.scope[`proof${index}`]).toMatchObject({ value: true });
      }
    });
  }

  test("a wrong singleton result cannot acquire element bounds", () => {
    const body = minimum.replace("return a[0];", "return 0;");
    const { context, summary } = infer(body);
    expect(summary.facts).toEqual(["finite", "notNaN"]);
    crossCheck(body, summary);
    const checked = execute("const claim = result <= input[0];", context);
    expect((checked.value.scope.claim as TESBoolean).value).toBeUndefined();
  });

  test("a terminating recursion that skips an element cannot claim coverage", () => {
    const body = minimum.replace(
      "const rest = fold(a.slice(1));",
      "if (a.length === 2) return a[0]; const rest = fold(a.slice(2));"
    );
    const { summary } = infer(body);
    expect(summary.facts).not.toContain("lower");
    expect(summary.facts).not.toContain("upper");
    crossCheck(body, summary);
  });

  test("exceptional branches at small and maximum lengths participate in induction", () => {
    for (const length of [3, 0xffffffff]) {
      const body = `if (a.length === ${length}) return 5;` + minimum;
      const { summary } = infer(body);
      expect(summary.facts).toEqual(["finite", "notNaN"]);
      crossCheck(body, summary);
    }
  });

  test("nonfinite contracts cannot reuse an existing finite summary", () => {
    const defined = define(minimum);
    const valid = execute("const good = fold(input);",
      setVariablesInScope(defined, { input: inputFor() }));
    const fn = valid.value.scope.fold;
    expect(getInferredSummaries(fn)).toHaveLength(1);

    const possiblyInfinite = ESNumber();
    possiblyInfinite.knowledge = [{ kind: "notNaN", subject: possiblyInfinite }];
    for (const element of [ESNumber(NaN), ESNumber(Infinity), ESNumber(-Infinity), possiblyInfinite]) {
      expect(() => execute("const bad = fold(input);",
        setVariablesInScope(valid, { input: inputFor(element) })
      )).toThrow(/exclude NaN and infinity/);
      expect(getInferredSummaries(fn)).toHaveLength(1);
      expect(getInferredSummaries(fn)[0].applications).toBe(1);
    }
  });

  test("a shadowed undefined is a captured dependency, not a constant", () => {
    const source = `
      var undefined = 0;
      function fold(a) {
        if (a.length === 1) return undefined;
        return fold(a.slice(1));
      }
      const first = fold(input);
      undefined = 0 / 0;
      const second = fold(input);
      const claim = second === second;
    `;
    expect(() => execute(source,
      setVariablesInScope(nodeInitialExecutionContext, { input: inputFor() })
    )).toThrow(/captured binding undefined/);
  });

  test("caller shadows cannot change a recursive closure's proof dependencies", () => {
    const context = execute(`
      function fold(a) { ${minimum} }
      const saved = fold;
      function invoke(fold) { return saved(input); }
      const result = invoke(function () { return 42; });
      const proof = input[0] < result;
      const uncertain = result < input[0];
    `, setVariablesInScope(nodeInitialExecutionContext, { input: inputFor() }));
    expect(context.value.scope.proof).toMatchObject({ value: false });
    expect((context.value.scope.uncertain as TESBoolean).value).toBeUndefined();
    expect(getInferredSummaries(context.value.scope.saved)[0].facts).toEqual(["finite", "notNaN", "lower"]);
  });

  test("rebinding the captured recursive name prevents reuse of its old proof", () => {
    const input = symbolicNumberArray({ minimumLength: 2, element: finiteTemplate() });
    const context = execute(`
      function fold(a) { ${minimum} }
      const saved = fold;
      const first = saved(input);
      fold = function (a) { return 42; };
      const second = saved(input);
      const proof = second <= 42;
      const uncertain = second < input[0];
    `, setVariablesInScope(nodeInitialExecutionContext, { input }));
    expect(context.value.scope.proof).toMatchObject({ value: true });
    expect((context.value.scope.uncertain as TESBoolean).value).toBeUndefined();
    expect(getInferredSummaries(context.value.scope.saved)[0].applications).toBe(1);
  });

  test("a departed shadow cannot conceal captured reads or writes from validation", () => {
    for (const [operation, error] of [
      ["if (a.length === 0xffffffff) return captured;", /captured binding captured/],
      ["captured = 1;", /writes outside local/]
    ] as Array<[string, RegExp]>) {
      const defined = execute(`
        let captured = 0;
        function fold(a) {
          { let captured = a[0]; }
          ${operation}
          ${minimum}
        }
      `);
      expect(() => execute("const result = fold(input);",
        setVariablesInScope(defined, { input: inputFor() })
      )).toThrow(error);
      expect(getInferredSummaries(defined.value.scope.fold)).toEqual([]);
    }
  });

  test("mutable self properties and unverified local operations cannot publish summaries", () => {
    const cases: Array<[string, string, RegExp]> = [
      [minimum.replace("return a[0];", "return fold.mode;"), "fold.mode = 0;",
        /property dependencies|captured binding/],
      [minimum.replace("const rest = fold(a.slice(1));",
        "const recursiveAlias = fold; const rest = recursiveAlias(a.slice(1));"), "",
        /captured binding fold/],
      [minimum.replace("return a[0] < rest ? a[0] : rest;",
        "let head = a[0]; head -= head; return head < rest ? head : rest;"), "",
        /Compound assignment/]
    ];
    for (const [body, setup, error] of cases) {
      const context = execute(setup, define(body));
      expect(() => execute("const result = fold(input);",
        setVariablesInScope(context, { input: inputFor() })
      )).toThrow(error);
      expect(getInferredSummaries(context.value.scope.fold)).toEqual([]);
    }
  });
});
