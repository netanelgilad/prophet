import { ESTree } from "cherow";

export type FunctionDefinition = {
  statements: ESTree.Statement[];
  params: ESTree.Pattern[];
};

// Keep executable function identity separate from analysis metadata.
const definitions = new WeakMap<object, FunctionDefinition>();
export function registerDefinition(value: object, definition: FunctionDefinition): void {
  definitions.set(value, definition);
}
export function functionDefinition(value: object): FunctionDefinition | undefined {
  return definitions.get(value);
}
