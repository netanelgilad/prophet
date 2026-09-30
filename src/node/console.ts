import { invoke } from "../ASTResolvers";
import { withValue } from "../conversion/toString";
import { createHostFunction, effectPaths } from "../effects";
import { TExecutionContext } from "../execution-context/ExecutionContext";
import { ESObject } from "../Object";
import { ESString, TESString } from "../string/String";
import { Knowledge } from "../symbolic";
import { ESNumber, isESString, Undefined } from "../types";

export type ConsoleOutputPath = {
  knowledge: Knowledge;
  chunks: ReadonlyArray<TESString>;
};

function unsupported(detail: string): never {
  throw new Error(`Console analysis is not yet supported: ${detail}`);
}

/**
 * A default, ungrouped Node console and healthy UTF-8 stdout, without diagnostic
 * subscribers or stream replacement. Output is a persistent ordered effect,
 * never a real terminal write. Stream failures, flushing, formatting, and the
 * rest of Console remain separate compatibility gaps (implementation-gaps.md).
 */
export function createConsoleModel() {
  // This internal boundary records successful decoded UTF-8 output, not the
  // public process.stdout.write API or a promise about its backpressure result.
  const write = createHostFunction("console.stdout.write", (_call, context) => [Undefined, context]);
  const log = Object.assign(createHostFunction("console.log", (call, context) => {
    if (call.args.length > 1) return unsupported("multi-argument formatting");
    return withValue(call.args.length ? call.args[0] : ESString(""), context, (value, branch) => {
      if (!isESString(value)) return unsupported("non-string formatting and object inspection");
      // The single-string fast path does not invoke user conversion methods or
      // substitute '%' tokens. Each call adds a newline before UTF-8 encoding.
      // Arbitrary symbolic UTF-16 strings cannot be claimed unchanged on wire.
      const output = typeof value.value === "string"
        ? ESString(Buffer.from(value.value + "\n", "utf8").toString("utf8")) : ESString();
      return invoke(write, [output], branch);
    });
  }), {
    unknownProperties: "Node console.log function API",
    modeledInheritedProperties: ["call"],
    unmodeledOwnPropertyInspection: "Node console.log descriptors",
    unmodeledPropertyReads: ["caller", "arguments"],
    unmodeledPropertyWrites: ["name", "length", "caller", "arguments"]
  });
  Object.assign(log.properties, { name: ESString("log"), length: ESNumber(0) });
  const module = Object.assign(ESObject({ log }), {
    unknownProperties: "Node console API",
    unmodeledOwnPropertyInspection: "Node console descriptors",
    unmodeledPropertyWrites: ["log"]
  });

  return {
    // Supply this same identity as the global console and the console builtin.
    module,
    inspectOutput(context: TExecutionContext): ConsoleOutputPath[] {
      return effectPaths(context.value.effects, context.value.knowledge).map(path => ({
        knowledge: path.knowledge,
        chunks: path.events.filter(event => event.kind === "return" && event.call.target === write)
          .map(event => event.call.args[0] as TESString)
      }));
    }
  };
}
