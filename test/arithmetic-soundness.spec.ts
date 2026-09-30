import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { ESNumber, TESNumber, isESNumber, isThrownValue } from "../src/types";
import { Fact, isFiniteNumber, notNaN, numberBounds } from "../src/symbolic";

type Domain = {
  label: string;
  minimum: number;
  maximum: number;
  samples: number[];
  finite?: boolean;
  bounds?: boolean;
  openLower?: boolean;
  openUpper?: boolean;
};

const positive: Domain = {
  label: "positive subnormals through ordinary numbers",
  minimum: Number.MIN_VALUE, maximum: 10,
  samples: [Number.MIN_VALUE, Number.MIN_VALUE * 2, Number.EPSILON, 0.1, 1, 10]
};
const negative: Domain = {
  label: "negative subnormals through ordinary numbers",
  minimum: -10, maximum: -Number.MIN_VALUE,
  samples: [-10, -1, -0.1, -Number.EPSILON, -Number.MIN_VALUE * 2, -Number.MIN_VALUE]
};
const crossingZero: Domain = {
  label: "both signs and both zeros", minimum: -2, maximum: 2,
  samples: [-2, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 2]
};
const zeros: Domain = {
  label: "both signed zeros", minimum: 0, maximum: 0, samples: [-0, 0]
};
const large: Domain = {
  label: "large positive numbers", minimum: Number.MAX_VALUE / 2, maximum: Number.MAX_VALUE,
  samples: [Number.MAX_VALUE / 2, Number.MAX_VALUE * 0.75, Number.MAX_VALUE]
};
const largeNegative: Domain = {
  label: "large negative numbers", minimum: -Number.MAX_VALUE, maximum: -Number.MAX_VALUE / 2,
  samples: [-Number.MAX_VALUE, -Number.MAX_VALUE * 0.75, -Number.MAX_VALUE / 2]
};
const finiteOnly: Domain = {
  label: "any finite number", minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE,
  bounds: false,
  samples: [-Number.MAX_VALUE, -1, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 1, Number.MAX_VALUE]
};
const ordersOnly: Domain = {
  label: "finite bounds without an explicit finite fact", minimum: -1, maximum: 1,
  finite: false, samples: [-1, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, 1]
};
const openPositive: Domain = {
  label: "positive numbers approaching zero", minimum: 0, maximum: 1,
  openLower: true, openUpper: true,
  samples: [Number.MIN_VALUE, Number.EPSILON, 0.1, 0.5, 1 - Number.EPSILON]
};

function input(domain: Domain): TESNumber {
  const value = ESNumber();
  const facts: Fact[] = [];
  if (domain.finite !== false) facts.push({ kind: "finite", subject: value });
  if (domain.bounds !== false) facts.push(
    { kind: "order", left: ESNumber(domain.minimum), right: value, strict: !!domain.openLower },
    { kind: "order", left: value, right: ESNumber(domain.maximum), strict: !!domain.openUpper }
  );
  value.knowledge = facts;
  return value;
}

function evaluateNumber(expression: string, variables: { [name: string]: TESNumber }): TESNumber {
  const [completion, context] = evaluateCode(`const result = ${expression};`,
    setVariablesInScope(nodeInitialExecutionContext, variables));
  expect(isForkedCompletion(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect(context.value.uncaught).toBeUndefined();
  const result = context.value.scope.result;
  expect(isESNumber(result)).toBe(true);
  return result as TESNumber;
}

function display(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

// The host computes concrete outcomes independently of Prophet's interval
// implementation. Samples only try to refute claims; they never establish a
// universal fact or restrict the symbolic input to this finite list.
function checkClaims(result: TESNumber, concrete: number, label: string): void {
  const number = (value: TESNumber): number => {
    if (value === result || value.id === result.id) return concrete;
    if (typeof value.value === "number") return value.value;
    throw new Error(`${label}: unexpected unrelated symbolic value in an arithmetic fact`);
  };
  if (typeof result.value === "number" && !Object.is(result.value, concrete)) {
    throw new Error(`${label}: concrete ${display(result.value)} disagrees with ${display(concrete)}`);
  }
  for (const fact of result.knowledge || []) {
    let holds: boolean;
    switch (fact.kind) {
      case "order": holds = fact.strict
        ? number(fact.left) < number(fact.right)
        : number(fact.left) <= number(fact.right);
        break;
      case "finite": holds = Number.isFinite(number(fact.subject)); break;
      case "notNaN": holds = !Number.isNaN(number(fact.subject)); break;
      case "integer": holds = Number.isInteger(number(fact.subject)); break;
      default: throw new Error(`${label}: unexpected ${fact.kind} fact on an arithmetic result`);
    }
    if (!holds) throw new Error(`${label}: ${fact.kind} fact is false for ${display(concrete)}`);
  }
}

const arithmetic = [
  { operator: "+", apply: (a: number, b: number) => a + b },
  { operator: "-", apply: (a: number, b: number) => a - b },
  { operator: "*", apply: (a: number, b: number) => a * b },
  { operator: "/", apply: (a: number, b: number) => a / b }
];

test("arithmetic facts hold against independent boundary samples, including underflow and overflow", () => {
  const pairs = [
    [positive, positive], [positive, negative], [negative, positive], [negative, negative],
    [crossingZero, positive], [crossingZero, negative], [crossingZero, crossingZero],
    [zeros, positive], [positive, zeros], [large, large], [large, largeNegative],
    [large, positive], [largeNegative, negative], [finiteOnly, positive],
    [finiteOnly, finiteOnly], [ordersOnly, positive], [positive, openPositive]
  ];
  let boundedResults = 0;
  for (const [left, right] of pairs) {
    for (const operation of arithmetic) {
      const result = evaluateNumber(`a ${operation.operator} b`, { a: input(left), b: input(right) });
      const excludesZero = right.minimum > 0 || right.maximum < 0;
      if (operation.operator !== "/" || excludesZero) {
        const bounds = numberBounds(result);
        expect(bounds.lower).toBeDefined();
        expect(bounds.upper).toBeDefined();
        expect(notNaN(result)).toBe(true);
        boundedResults++;
      }
      for (const a of left.samples) {
        for (const b of right.samples) {
          checkClaims(result, operation.apply(a, b),
            `${left.label} / ${right.label}: ${display(a)} ${operation.operator} ${display(b)}`);
        }
      }
    }
  }
  // Prevent the differential check from passing vacuously with no new facts.
  expect(boundedResults).toBeGreaterThan(50);
});

test("unary negation facts hold for boundaries, subnormals and signed zero", () => {
  const possiblyInfinite: Domain = {
    label: "a one-sided bound allowing negative infinity", minimum: -Infinity, maximum: 10,
    finite: false, samples: [-Infinity, -Number.MAX_VALUE, -0, 0, Number.MIN_VALUE, 10]
  };
  for (const domain of [positive, negative, crossingZero, zeros, large, largeNegative, finiteOnly, ordersOnly, openPositive, possiblyInfinite]) {
    const result = evaluateNumber("-a", { a: input(domain) });
    expect(notNaN(result)).toBe(true);
    if (domain.finite !== false) expect(isFiniteNumber(result)).toBe(true);
    for (const a of domain.samples) checkClaims(result, -a, `-(${display(a)}) in ${domain.label}`);
  }
  const unknown = evaluateNumber("-a", { a: ESNumber() });
  expect(notNaN(unknown)).toBe(false);
  for (const a of [NaN, -Infinity, -0, 0, Infinity]) checkClaims(unknown, -a, `-(${display(a)})`);
});

test("unknown NaN and infinity inputs never acquire false arithmetic guarantees", () => {
  const exceptional = [NaN, -Infinity, -Number.MAX_VALUE, -1, -0, 0, 1, Number.MAX_VALUE, Infinity];
  for (const operation of arithmetic) {
    const result = evaluateNumber(`a ${operation.operator} b`, { a: ESNumber(), b: input(crossingZero) });
    expect(result.value).toBeUndefined();
    expect(notNaN(result)).toBe(false);
    for (const a of exceptional) {
      for (const b of crossingZero.samples) {
        checkClaims(result, operation.apply(a, b), `${display(a)} ${operation.operator} ${display(b)}`);
      }
    }
  }
});

test("overflow followed by multiplication across zero retains the possible NaN", () => {
  const result = evaluateNumber("(a * 2) * b", { a: input(large), b: input(crossingZero) });
  expect(result.value).toBeUndefined();
  expect(notNaN(result)).toBe(false);
  for (const a of large.samples) {
    for (const b of crossingZero.samples) {
      checkClaims(result, (a * 2) * b, `(${display(a)} * 2) * ${display(b)}`);
    }
  }
});

test("non-NaN intervals allowing infinity do not borrow finite arithmetic guarantees", () => {
  const domain: Domain = {
    label: "every non-NaN number", minimum: -Infinity, maximum: Infinity, finite: false,
    samples: [-Infinity, -Number.MAX_VALUE, -1, -0, 0, 1, Number.MAX_VALUE, Infinity]
  };
  for (const operation of arithmetic) {
    const result = evaluateNumber(`a ${operation.operator} b`, { a: input(domain), b: input(crossingZero) });
    expect(result.value).toBeUndefined();
    expect(isFiniteNumber(result)).toBe(false);
    for (const a of domain.samples) {
      for (const b of crossingZero.samples) {
        checkClaims(result, operation.apply(a, b), `${display(a)} ${operation.operator} ${display(b)}`);
      }
    }
  }
});
