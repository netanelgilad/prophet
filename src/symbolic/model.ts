import { Any, TESBoolean, TESNumber, Type, WithValue } from "../types";

export type NumberOperator = "<" | "<=" | ">" | ">=";

export type SelectExpression = {
  kind: "select";
  condition: TESBoolean;
  consequent: Any;
  alternate: Any;
};

// Expressions describe computations. Facts below describe what is established
// about those computations; an unevaluated comparison is not itself a fact.
export type Expression =
  | { kind: "compare"; operator: NumberOperator; left: TESNumber; right: TESNumber }
  | { kind: "strict-equal"; left: Any; right: Any }
  | { kind: "not"; operand: TESBoolean }
  | { kind: "typeof"; operand: Any }
  | { kind: "truthy"; operand: Any }
  | SelectExpression
  | { kind: "binary"; operator: string; left: Any; right: Any }
  | { kind: "unary"; operator: string; operand: Any };

export type OrderFact = {
  kind: "order";
  left: TESNumber;
  right: TESNumber;
  strict: boolean;
};

// Regions refer to an immutable collection snapshot. Their half-open offsets
// let facts about a collection also apply to reads from one of its subregions.
export type CollectionRegion = {
  id: object;
  start: number;
  end?: number;
};

// All entries in Knowledge hold simultaneously. A vocabulary of small facts,
// rather than a variant for every possible combination of known properties.
export type Fact =
  | OrderFact
  | { kind: "truth"; condition: TESBoolean; truth: boolean }
  | { kind: "finite" | "notNaN" | "integer"; subject: TESNumber }
  | { kind: "member"; collection: CollectionRegion; element: TESNumber }
  | {
      kind: "every-element-order";
      collection: CollectionRegion;
      bound: TESNumber;
      // lower: bound <= every element; upper: every element <= bound.
      direction: "lower" | "upper";
    };

export type Knowledge = ReadonlyArray<Fact>;

export type TChoice = Type<"choice"> & WithValue<never> & {
  expression: SelectExpression;
};
