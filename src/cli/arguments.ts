export type CLIArguments = {
  readonly kind: "run";
  readonly runtime: "node@24.21.0";
  readonly script: string;
  readonly args: string[];
  readonly maxSteps: number;
  readonly maxEvents: number;
} | { readonly kind: "help" };

/** Parse Prophet's options without ever interpreting the target's arguments. */
export function parseArguments(args: ReadonlyArray<string>): CLIArguments {
  if (args.length === 1 && args[0] === "--help") return { kind: "help" };

  let runtimeSeen = false;
  let maxStepsSeen = false;
  let maxSteps = 100000;
  let maxEvents = 0;
  let maxEventsSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option === "--") {
      const script = args[index + 1];
      if (!script) throw new Error("Expected a script path after --.");
      return { kind: "run", runtime: "node@24.21.0", script, args: args.slice(index + 2), maxSteps, maxEvents };
    }
    if (option === "--runtime") {
      if (runtimeSeen) throw new Error("--runtime may only be specified once.");
      runtimeSeen = true;
      index += 1;
      if (args[index] !== "node@24.21.0") {
        throw new Error("The only supported runtime is node@24.21.0.");
      }
      continue;
    }
    if (option === "--max-events") {
      if (maxEventsSeen) throw new Error("--max-events may only be specified once.");
      maxEventsSeen = true;
      index += 1;
      if (args[index] !== "0" && args[index] !== "1") {
        throw new Error("--max-events currently supports only 0 or 1 incoming events.");
      }
      maxEvents = Number(args[index]);
      continue;
    }
    if (option === "--max-steps") {
      if (maxStepsSeen) throw new Error("--max-steps may only be specified once.");
      maxStepsSeen = true;
      index += 1;
      const value = args[index];
      if (!value || !/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
        throw new Error("--max-steps requires a positive, safe integer.");
      }
      maxSteps = Number(value);
      continue;
    }
    throw new Error(option === "--help"
      ? "Use --help by itself."
      : `Unknown Prophet argument ${JSON.stringify(option)}; put the script and its arguments after --.`);
  }
  throw new Error("Expected -- followed by a script path. Use --help for usage.");
}
