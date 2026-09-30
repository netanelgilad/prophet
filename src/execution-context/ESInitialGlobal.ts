import { FunctionConstructor } from "../Function/Function";
import { Math } from "../math/Math";
import { evalFn } from "../eval/eval";
import { StringConstructor } from "../string/String";
import { NumberConstructor } from "../number/Number";
import { ESBooleanConstructor } from "../boolean/ESBoolean";
import { ObjectConstructor } from "../Object/ObjectConstructor";
import { ESNumber, Undefined } from "../types";

export const ESInitialGlobal = {
  properties: {
    undefined: Undefined,
    NaN: ESNumber(NaN),
    Infinity: ESNumber(Infinity),
    Math,
    Function: FunctionConstructor,
    eval: evalFn,
    String: StringConstructor,
    Number: NumberConstructor,
    Boolean: ESBooleanConstructor,
    Object: ObjectConstructor
  }
};
