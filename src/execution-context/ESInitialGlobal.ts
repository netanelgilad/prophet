import { FunctionConstructor, ESBuiltinFunction } from "../Function/Function";
import { Math } from "../math/Math";
import { evalFn } from "../eval/eval";
import { StringConstructor } from "../string/String";
import { NumberConstructor } from "../number/Number";
import { ESBooleanConstructor } from "../boolean/ESBoolean";
import { ObjectConstructor } from "../Object/ObjectConstructor";
import { ESNumber, Undefined } from "../types";
import { getErrorConstructor } from "../error/Error";
import { getObjectPrototype } from "../Object/prototype";
import { getFunctionPrototype } from "../Function/prototype";
import { ESObject } from "../Object";

ObjectConstructor.properties.prototype = getObjectPrototype();
Object.assign(ObjectConstructor.properties.prototype.properties, { constructor: ObjectConstructor });
Object.assign(FunctionConstructor.properties, { prototype: getFunctionPrototype() });
Object.assign(FunctionConstructor.properties.prototype.properties, { constructor: FunctionConstructor });
Object.assign(ObjectConstructor, { unmodeledPropertyWrites: ["prototype"] });
Object.assign(FunctionConstructor, { unmodeledPropertyWrites: ["prototype"] });
Object.assign(NumberConstructor, { unmodeledPropertyWrites: ["prototype"] });
Object.assign(ESBooleanConstructor, { unmodeledPropertyWrites: ["prototype"] });

// Availability is known even though symbol creation/properties are not yet
// implemented. Valid Symbol use must stop analysis, not fabricate an ordinary
// missing-global ReferenceError that application code could catch as a result.
const unavailableSymbol = Object.assign(ESBuiltinFunction(function*() {
  throw new Error("Symbol creation is not yet supported");
}), { unknownProperties: "Symbol API", unmodeledOwnPropertyInspection: "Symbol descriptors" });

export const ESInitialGlobal = ESObject({
  undefined: Undefined,
  NaN: ESNumber(NaN),
  Infinity: ESNumber(Infinity),
  Math,
  Function: FunctionConstructor,
  eval: evalFn,
  String: StringConstructor,
  Number: NumberConstructor,
  Boolean: ESBooleanConstructor,
  Object: ObjectConstructor,
  Symbol: unavailableSymbol,
  Error: getErrorConstructor("Error"),
  EvalError: getErrorConstructor("EvalError"),
  RangeError: getErrorConstructor("RangeError"),
  ReferenceError: getErrorConstructor("ReferenceError"),
  SyntaxError: getErrorConstructor("SyntaxError"),
  TypeError: getErrorConstructor("TypeError"),
  URIError: getErrorConstructor("URIError")
}, "unmodeled");
