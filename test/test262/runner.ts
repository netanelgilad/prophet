import { readFileSync } from "fs";
import { dirname, join } from "path";
import { evaluate, nodeInitialExecutionContext } from "../../src";
import { parseECMACompliant } from "../../src/parseECMACompliant";
import { ESFunction } from "../../src/Function/Function";
import { ESBoolean } from "../../src/boolean/ESBoolean";
import { Any, Undefined, isThrownValue } from "../../src/types";
import { isForkedCompletion } from "../../src/execution-context/Completion";
import {
  setVariablesInScope,
  TExecutionContext
} from "../../src/execution-context/ExecutionContext";

export const test262Root = dirname(require.resolve("test262/package.json"));

export type Test262File = {
  file: string;
  contents: string;
  attrs: {
    flags: { [flag: string]: boolean };
    includes: string[];
    negative?: { phase: string; type: string };
  };
};

export type Variant = "sloppy" | "strict" | "raw";

export function parseTest262(contents: string, file = "runner-self-test"): Test262File {
  return require("test262-parser").parseFile({ file, contents });
}

export function loadTest262(path: string): Test262File {
  return parseTest262(readFileSync(join(test262Root, "test", path), "utf8"), path);
}

export function variantsFor(file: Test262File): Variant[] {
  const { flags, includes, negative } = file.attrs;
  for (const flag of Object.keys(flags)) {
    if (!["onlyStrict", "noStrict", "raw"].includes(flag)) {
      throw new Error(`Unsupported Test262 flag: ${flag} (${file.file})`);
    }
  }
  if (includes.length) {
    throw new Error(`Unsupported Test262 includes: ${includes.join(", ")}`);
  }
  if (negative && (negative.phase !== "parse" || negative.type !== "SyntaxError")) {
    throw new Error(`Unsupported Test262 negative: ${negative.phase}/${negative.type}`);
  }
  if (flags.onlyStrict && flags.noStrict) {
    throw new Error("Test262 cannot request both strict and sloppy mode");
  }
  if (flags.raw) return ["raw"];
  if (flags.onlyStrict) return ["strict"];
  if (flags.noStrict) return ["sloppy"];
  return ["sloppy", "strict"];
}

// Native harness boundaries only. Test source is always parsed and executed by
// Prophet. These checks implement assert.js's concrete SameValue behavior;
// unknown values must fail rather than being accepted as falsy/undefined.
export function concretePrimitive(value: Any): string | number | boolean | null | undefined {
  const result = value as { type?: string; value?: any };
  if (result.type === "undefined") return undefined;
  if (result.type === "null") return null;
  if (
    (result.type === "number" && typeof result.value === "number") ||
    (result.type === "boolean" && typeof result.value === "boolean") ||
    (result.type === "string" && typeof result.value === "string")
  ) {
    return result.value;
  }
  throw new Error("Test262 assertion requires a concrete primitive value");
}

function sameValue(left: Any, right: Any): boolean {
  return Object.is(sameValueOperand(left), sameValueOperand(right));
}

function sameValueOperand(value: Any): string | number | boolean | null | undefined | object {
  const result = value as { type?: string; id?: object; expression?: { kind: string } };
  if (
    (result.type === "object" || result.type === "array" || result.type === "function") &&
    (!result.expression || result.expression.kind !== "select")
  ) {
    // Concrete references have known identity even if their fields are unknown.
    // Native function wrappers may share a stable ID rather than an object.
    // Compare directly in the harness, not via Prophet's equality operator.
    return result.id || value;
  }
  return concretePrimitive(value);
}

function callback(check: (args: Any[]) => Any) {
  return ESFunction(function*(_self, args, context) {
    return [check(args), context] as [Any, TExecutionContext];
  });
}

function assertionContext(): TExecutionContext {
  const failure = callback(args => {
    const message = args.length ? String(concretePrimitive(args[0])) : "Test262 failure";
    throw new Error(message);
  });
  const assert = callback(args => {
    if (concretePrimitive(args[0]) !== true) {
      throw new Error("Test262 assert expected exactly true");
    }
    return Undefined;
  });
  Object.assign(assert.properties, {
    sameValue: callback(args => {
      if (!sameValue(args[0], args[1])) {
        throw new Error("Test262 assert.sameValue failed");
      }
      return Undefined;
    }),
    notSameValue: callback(args => {
      if (sameValue(args[0], args[1])) {
        throw new Error("Test262 assert.notSameValue failed");
      }
      return Undefined;
    }),
    _isSameValue: callback(args => ESBoolean(sameValue(args[0], args[1])))
  });
  return setVariablesInScope(nodeInitialExecutionContext, {
    assert,
    $ERROR: failure,
    $DONOTEVALUATE: callback(() => {
      throw new Error("$DONOTEVALUATE was evaluated");
    })
  });
}

export function runTest262Variant(file: Test262File, variant: Variant): void {
  if (!variantsFor(file).includes(variant)) {
    throw new Error(`Invalid variant ${variant} for ${file.file}`);
  }
  const source = variant === "strict" ? '"use strict";\n' + file.contents : file.contents;
  if (file.attrs.negative) {
    // Parse errors must come from the parser, not from executing the test or
    // calling its $DONOTEVALUATE guard. Evaluation errors never satisfy this.
    try {
      parseECMACompliant(source);
    } catch (error) {
      if (error.name === file.attrs.negative.type) return;
      throw error;
    }
    throw new Error("Expected Test262 parse SyntaxError, but parsing succeeded");
  }

  const ast = parseECMACompliant(source);
  const [completion, context] = evaluate(
    ast,
    variant === "raw" ? nodeInitialExecutionContext : assertionContext()
  );
  if (isForkedCompletion(completion)) {
    throw new Error("Unresolved symbolic completion in Test262 test");
  }
  if (isThrownValue(completion) || context.value.uncaught !== undefined) {
    throw new Error("Unhandled throw in Test262 test");
  }
  if (context.value.stderr) {
    throw new Error(`Test262 execution wrote stderr: ${context.value.stderr}`);
  }
}
