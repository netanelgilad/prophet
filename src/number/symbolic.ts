// Compatibility import path; all value kinds share expressions and knowledge.
import { NumberOperator as Operator } from "../symbolic/model";
export type NumberOperator = Operator;
export { compareNumbers, randomNumber, selectNumber } from "../symbolic";
