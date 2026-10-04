import { ESBoolean } from "../boolean/ESBoolean";
import { createError } from "../error/Error";
import { HostModel } from "../effects";
import { ESString } from "../string/String";
import { selectValue } from "../symbolic";
import { ESNull, ESNumber, TESNumber, isUndefined } from "../types";

/**
 * An unconstrained native TCP bind/listen result for the supported numeric
 * primary-process overloads. Each attempt has one fresh outcome, retained by
 * the server until notification. No real socket or availability probe occurs.
 * Error fields overapproximate OS failures; code/message/errno relationships
 * and contention between different attempts remain unresolved.
 */
export const symbolicTCPBind: HostModel = (call, context) => {
  const port = call.args[0] as TESNumber;
  const host = call.args[1];
  const error = createError("Error", ESString());
  Object.assign(error.properties, {
    code: ESString(), errno: ESNumber(), syscall: ESString("listen"),
    address: isUndefined(host) ? ESString() : host
  });
  // Pinned UVExceptionWithHostPort omits this own field for port zero.
  if (port.value) error.properties.port = port;
  return [selectValue(ESBoolean(), ESNull, error), context];
};
