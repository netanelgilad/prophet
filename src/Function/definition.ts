import { ESTree } from "cherow";
import { Environment } from "../execution-context/ExecutionContext";

export type FunctionDefinition = {
  statements: ESTree.Statement[];
  params: ESTree.Pattern[];
  environment: Environment;
};

// Keep executable function identity separate from analysis metadata.
const definitions = new WeakMap<object, FunctionDefinition>();
export function registerDefinition(value: object, definition: FunctionDefinition): void {
  definitions.set(value, definition);
}
export function functionDefinition(value: object): FunctionDefinition | undefined {
  return definitions.get(value);
}
