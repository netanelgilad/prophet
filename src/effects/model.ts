import { Any, TESBoolean } from "../types";
import { Heap } from "../execution-context/Heap";
import { Knowledge } from "../symbolic/model";

export type HostCall = {
  readonly id: object;
  readonly operation: string;
  readonly target: Any;
  readonly receiver: Any;
  readonly args: ReadonlyArray<Any>;
};

type Snapshot = {
  readonly call: HostCall;
  readonly heap: Heap | undefined;
  readonly knowledge: Knowledge;
};

export type HostEffect = Snapshot & (
  | { readonly kind: "call" }
  | { readonly kind: "return" | "throw"; readonly value: Any }
);

// Branches share immutable prefixes. A choice contains two complete traces;
// it is not a concatenation of the branches or a replay of the common prefix.
export type EffectTrace =
  | { readonly kind: "empty" }
  | { readonly kind: "event"; readonly previous: EffectTrace; readonly event: HostEffect }
  | { readonly kind: "choice"; readonly condition: TESBoolean;
      readonly consequent: EffectTrace; readonly alternate: EffectTrace };

export type EffectPath = {
  readonly knowledge: Knowledge;
  readonly events: ReadonlyArray<HostEffect>;
};
