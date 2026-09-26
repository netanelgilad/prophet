import "../src";
import { ESNumber, TESNumber } from "../src/types";
import {
  compareNumbers,
  NumberOperator,
  randomNumber,
  selectNumber
} from "../src/number/symbolic";

type Expression = {
  label: string;
  symbolic: TESNumber;
  concrete: (values: number[]) => number;
};

const operators: NumberOperator[] = ["<", "<=", ">", ">="];

function compare(left: number, right: number, operator: NumberOperator) {
  switch (operator) {
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
  }
}

function display(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function constant(value: number): Expression {
  return {
    label: display(value),
    symbolic: ESNumber(value),
    concrete: () => value
  };
}

function choice(
  left: Expression,
  right: Expression,
  operator: NumberOperator,
  consequent: Expression,
  alternate: Expression
): Expression {
  return {
    label: `(${left.label} ${operator} ${right.label} ? ${consequent.label} : ${alternate.label})`,
    symbolic: selectNumber(
      compareNumbers(left.symbolic, right.symbolic, operator),
      consequent.symbolic,
      alternate.symbolic
    ),
    concrete: values => compare(
      left.concrete(values), right.concrete(values), operator
    ) ? consequent.concrete(values) : alternate.concrete(values)
  };
}

function expressions(makeNumber: () => TESNumber): Expression[] {
  const [a, b, c] = [0, 1, 2].map(index => ({
    label: ["a", "b", "c"][index],
    symbolic: makeNumber(),
    concrete: (values: number[]) => values[index]
  }));
  const nan = constant(NaN);
  const zero = constant(0);
  const negativeZero = constant(-0);
  const minAB = choice(a, b, "<", a, b);
  const maxAB = choice(a, b, "<", b, a);
  const minBC = choice(b, c, "<", b, c);
  const maxBC = choice(b, c, "<", c, b);
  const values = [
    a, b, c, nan, zero, negativeZero,
    constant(-Infinity), constant(Infinity), constant(-1), constant(1),
    minAB, maxAB, minBC, maxBC,
    choice(a, minBC, "<", a, minBC),
    choice(a, maxBC, ">", a, maxBC),
    choice(a, b, "<", c, a),
    choice(a, b, "<", nan, b),
    choice(a, b, "<", a, nan),
    choice(a, b, "<", minAB, maxBC),
    choice(minAB, c, "<=", minBC, a),
    choice(maxAB, minBC, ">=", maxBC, minAB),
    choice(a, a, "<=", a, nan),
    choice(a, b, "<=", negativeZero, zero)
  ];
  // Both branch orientations and all four comparison operators exercise ties
  // and the distinction between a false comparison and its reversed order.
  for (const operator of operators) {
    values.push(choice(a, b, operator, a, b));
    values.push(choice(a, b, operator, b, a));
    values.push(choice(a, b, operator, minAB, maxAB));
  }
  return values;
}

function checkConcreteClaims(makeNumber: () => TESNumber, domain: number[]) {
  const candidates = expressions(makeNumber);
  const assignments: Array<{ inputs: number[]; results: number[] }> = [];
  for (const a of domain) {
    for (const b of domain) {
      for (const c of domain) {
        const inputs = [a, b, c];
        assignments.push({
          inputs,
          results: candidates.map(candidate => candidate.concrete(inputs))
        });
      }
    }
  }

  let concreteClaims = 0;
  candidates.forEach((left, leftIndex) => {
    candidates.forEach((right, rightIndex) => {
      for (const operator of operators) {
        const claimed = compareNumbers(left.symbolic, right.symbolic, operator).value;
        if (typeof claimed !== "boolean") {
          continue;
        }
        concreteClaims += 1;
        for (const assignment of assignments) {
          const actual = compare(
            assignment.results[leftIndex], assignment.results[rightIndex], operator
          );
          if (actual !== claimed) {
            throw new Error(
              `${left.label} ${operator} ${right.label}: claimed ${claimed}, ` +
              `got ${actual} for [a, b, c] = [${assignment.inputs.map(display).join(", ")}]`
            );
          }
        }
      }
    });
  });
  expect(concreteClaims).toBeGreaterThan(100);
}

describe("symbolic comparison soundness against concrete evaluation", () => {
  test("nested unconstrained choices include NaN, infinities, and signed zero", () => {
    checkConcreteClaims(() => ESNumber(), [NaN, -Infinity, -1, -0, 0, 1, Infinity]);
  });

  test("nested random choices include equal and distinct finite values", () => {
    checkConcreteClaims(randomNumber, [0, 0.5, 0.9]);
  });
});
