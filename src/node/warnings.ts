import { invoke, readMember } from "../ASTResolvers";
import { Array as ESArray, TArray } from "../array/Array";
import { coerceToBoolean, ESBoolean } from "../boolean/ESBoolean";
import { isObjectValue, toString, withValue } from "../conversion/toString";
import { createHostFunction, effectPaths } from "../effects";
import { createError, getErrorConstructor } from "../error/Error";
import { bindNormal } from "../evaluate";
import { withAnalysisFailureContext } from "../execution-context/analysis-failure";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { BranchResult, evaluateBranches } from "../execution-context/branches";
import { getArrayElements, getProperties, writeProperty } from "../execution-context/Heap";
import { JobQueue } from "../jobs";
import { isESFunction } from "../Function/Function";
import { ESObject, TESObject } from "../Object";
import { concatenateStrings } from "../string/concat";
import { ESString, TESString } from "../string/String";
import { Knowledge, resolveBoolean } from "../symbolic";
import { Any, ESNumber, isESString, isUndefined, TESBoolean, Undefined } from "../types";
import { withStringArgument } from "./arguments";

export type WarningModelOptions = { pid?: number; nextTick?: JobQueue };

export type PendingWarning = { name: Any; code: Any; message: Any };
export type PendingWarningPath = { knowledge: Knowledge; warnings: ReadonlyArray<PendingWarning> };
export type WarningOutputPath = { knowledge: Knowledge; chunks: ReadonlyArray<TESString> };

function unsupported(detail: string): never {
  throw new Error(`Process warning analysis is not yet supported: ${detail}`);
}

function withKnownOptionalString(name: string, value: Any, context: TExecutionContext,
  next: (value: string | undefined, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (selected, branch) => {
    if (isUndefined(selected)) return next(undefined, branch);
    if (isObjectValue(selected)) return unsupported("warning options, constructor overloads and object diagnostics");
    return withStringArgument(name, selected, branch, (text, after) => {
      if (typeof text.value !== "string") return unsupported(`open symbolic warning ${name}`);
      return next(text.value, after);
    });
  });
}

// Template interpolation uses the default hint for objects. Until the shared
// conversion operation models that hint, do not substitute string-hint ToString.
function withDiagnosticText(value: Any, context: TExecutionContext,
  next: (value: TESString, context: TExecutionContext) => BranchResult): BranchResult {
  return withValue(value, context, (selected, branch) => {
    if (isObjectValue(selected)) return unsupported("object conversion in warning presentation");
    return bindNormal(toString(selected, branch), (text, after) => next(text as TESString, after));
  });
}

/**
 * Scoped default Node warning delivery: a persistent next-tick queue and healthy
 * decoded UTF-8 stderr, with unchanged default warning handlers/console.error,
 * node release/argv0 and no warning flags, listeners, redirects or subscribers.
 * Scheduling and delivery are separate; neither performs a real process write.
 */
export function createWarningModel(options: WarningModelOptions = {}) {
  const pid = options.pid;
  const nextTick = options.nextTick;
  if (nextTick !== undefined && (!nextTick || typeof nextTick.enqueue !== "function")) {
    throw new Error("Warning model next-tick queue requires an enqueue operation");
  }
  if (pid !== undefined && (!Number.isSafeInteger(pid) || pid < 1)) {
    throw new Error("Warning model pid must be a positive safe integer");
  }
  const state = ESObject({ queue: ESArray<TESObject>([]), helperShown: ESBoolean(false) });
  const primordialErrorToString = getErrorConstructor("Error").properties.prototype.properties.toString;
  const write = createHostFunction("process.warning.stderr.write", (_call, context) => [Undefined, context]);

  const withQueue = (context: TExecutionContext,
    next: (warnings: TESObject[], context: TExecutionContext) => BranchResult): BranchResult =>
    withValue(getProperties(state, context).queue, context, (queue, branch) => {
      const warnings = getArrayElements(queue as TArray<Any>, branch);
      if (!warnings) throw new Error("Invalid private warning queue");
      return next(warnings as TESObject[], branch);
    });
  const saveQueue = (warnings: TESObject[], context: TExecutionContext) =>
    writeProperty(state, "queue", ESArray(warnings), context);

  const emitWarning = Object.assign(createHostFunction("process.emitWarning", (call, context) => {
    assertDefaultConfiguration(context);
    return withKnownOptionalString("type", call.args[1] || Undefined, context, (type, afterType) =>
      withKnownOptionalString("code", call.args[2] || Undefined, afterType, (code, afterCode) =>
        withValue(call.args[3] || Undefined, afterCode, (ctor, afterCtor) => {
          if (!isUndefined(ctor)) return unsupported("warning stack constructor argument");
          return withValue(call.args[0] || Undefined, afterCtor, (message, branch) => {
            if (!isESString(message)) return unsupported("non-string warning and Error-object overload");
            const warning = createError("Error", message);
            warning.properties.name = ESString(type || "Warning");
            if (code !== undefined) warning.properties.code = ESString(code);
            return withQueue(branch, (warnings, after) => {
              const pending = saveQueue(warnings.concat([warning]), after);
              return nextTick ? nextTick.enqueue(deliverQueued, [warning], pending) : [Undefined, pending];
            });
          });
        })));
  }), {
    nonConstructible: false,
    unmodeledConstruct: "process.emitWarning construction is not yet supported",
    unknownProperties: "Node process.emitWarning function API",
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node process.emitWarning descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(emitWarning.properties, { name: ESString("emitWarning"), length: ESNumber(4) });
  const flags = ["noDeprecation", "throwDeprecation", "traceDeprecation", "traceProcessWarnings"];
  const process = Object.assign(ESObject({ emitWarning, pid: ESNumber(pid) }), {
    unknownProperties: "Node process warning API",
    modeledInheritedProperties: flags,
    unmodeledOwnPropertyInspection: "Node process descriptors",
    unmodeledPropertyWrites: flags.concat(["pid"]),
    hostSlots: Object.freeze(nextTick
      ? { "node.process.warnings": state, "node.nextTick": nextTick.state }
      : { "node.process.warnings": state })
  });
  // Flags are absent by default, so inherited writes must not be shadowed by
  // invented own undefined values. Changing their effective configuration is
  // outside this default-handler model, including through Object.prototype.
  function assertDefaultConfiguration(context: TExecutionContext) {
    for (const name of flags) {
      const value = readMember(process, name, context)[0];
      if (resolveBoolean(coerceToBoolean(value, context.value.knowledge), context.value.knowledge) !== false) {
        unsupported(`warning process configuration '${name}'`);
      }
    }
  }

  const writeMessage = (message: TESString, deprecation: boolean, context: TExecutionContext): BranchResult => {
    const output = (text: TESString, after: TExecutionContext) => {
      const chunk = typeof text.value === "string"
        ? ESString(Buffer.from(text.value + "\n", "utf8").toString("utf8")) : ESString();
      return invoke(write, [chunk], after);
    };
    return evaluateBranches(getProperties(state, context).helperShown as TESBoolean, context,
      shown => output(message, shown), fresh => output(concatenateStrings(message, ESString(
        `\n(Use \`node --trace-${deprecation ? "deprecation" : "warnings"} ...\` to show where the warning was created)`)),
      writeProperty(state, "helperShown", ESBoolean(true), fresh)));
  };

  const present = (warning: TESObject, context: TExecutionContext): BranchResult =>
    bindNormal(readMember(warning, "name", context), (name, afterName) =>
      withValue(name, afterName, (selectedName, named) => {
        if (!isESString(selectedName) || typeof selectedName.value !== "string") {
          return unsupported("mutated or open symbolic warning name");
        }
        const deprecation = selectedName.value === "DeprecationWarning";
        const start = pid === undefined ? ESString() : ESString(`(node:${pid}) `);
        return bindNormal(readMember(warning, "code", named), (code, afterCode) => {
          const format = (prefix: TESString, current: TExecutionContext): BranchResult =>
            bindNormal(readMember(warning, "toString", current), (method, afterMethod) =>
              withValue(method, afterMethod, (callee, branch) =>
                bindNormal(invoke(isESFunction(callee) ? callee : primordialErrorToString, [], branch, warning),
                  (formatted, afterFormat) => withDiagnosticText(formatted, afterFormat, (text, converted) => {
                    const message = concatenateStrings(prefix, text);
                    // Formatting may have changed inherited detail; read it afterward.
                    return bindNormal(readMember(warning, "detail", converted), (detail, afterDetail) =>
                      withValue(detail, afterDetail, (selected, leaf) => writeMessage(isESString(selected)
                        ? concatenateStrings(concatenateStrings(message, ESString("\n")), selected)
                        : message, deprecation, leaf)));
                  }))));
          return evaluateBranches(coerceToBoolean(code, afterCode.value.knowledge), afterCode,
            included => withDiagnosticText(code, included, (text, after) =>
              format(concatenateStrings(concatenateStrings(concatenateStrings(start, ESString("[")), text), ESString("] ")), after)),
            omitted => format(start, omitted));
        });
      }));

  // The queue owns ordering. Each job retains its warning identity; formatting
  // reads the invocation-time heap and can append warnings behind existing jobs.
  const deliverQueued = createHostFunction("process.warning.deliver", (call, context) =>
    withQueue(context, (warnings, branch) => {
      if (!warnings.length || warnings[0] !== call.args[0]) {
        throw new Error("Shared warning job does not match its pending warning");
      }
      const delivering = saveQueue(warnings.slice(1), branch);
      return withAnalysisFailureContext(delivering, () => {
        assertDefaultConfiguration(delivering);
        return present(warnings[0], delivering);
      });
    }));

  return {
    process, state,
    deliverNext(context: TExecutionContext): BranchResult {
      if (nextTick) return unsupported("manual warning delivery while a next-tick queue owns delivery");
      return withQueue(context, (warnings, branch) => {
        if (!warnings.length) return [Undefined, branch];
        assertDefaultConfiguration(branch);
        return present(warnings[0], saveQueue(warnings.slice(1), branch));
      });
    },
    inspectPending(context: TExecutionContext): PendingWarningPath[] {
      const paths: PendingWarningPath[] = [];
      withQueue(context, (warnings, branch) => {
        paths.push({ knowledge: branch.value.knowledge || [], warnings: warnings.map(warning => ({
          name: getProperties(warning, branch).name,
          message: getProperties(warning, branch).message,
          code: readMember(warning, "code", branch)[0]
        })) });
        return [Undefined, branch];
      });
      return paths;
    },
    inspectOutput(context: TExecutionContext): WarningOutputPath[] {
      return effectPaths(context.value.effects, context.value.knowledge).map(path => ({
        knowledge: path.knowledge,
        chunks: path.events.filter(event => event.kind === "return" && event.call.target === write)
          .map(event => event.call.args[0] as TESString)
      }));
    }
  };
}
