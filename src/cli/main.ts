import { parseArguments } from "./arguments";
import { encodeGraph } from "./graph";
import { runFile } from "./runtime";

const usage = `Usage: prophet [--runtime node@24.21.0] [--max-steps N] -- SCRIPT [args...]

Interpret one CommonJS file and write a versioned symbolic graph to stdout.
This first slice supports console output; uncaptured imports and other host
APIs stop analysis. No target code or external writes run natively.
The graph is an inspection projection, not a resumable environment snapshot.
Exit codes: 0 analyzed entry completion (including a program throw),
2 partial analysis stop, 1 invocation/acquisition/serialization failure.
`;

/** The process adapter owns output; target console activity stays in the graph. */
export function main(args: string[]): number {
  try {
    const options = parseArguments(args);
    if (options.kind === "help") {
      process.stdout.write(usage);
      return 0;
    }
    const execution = runFile(options, process.cwd());
    const roots: { [name: string]: unknown } = { initial: execution.initial, current: execution.current };
    if (execution.completion !== undefined) roots.completion = execution.completion;
    const result = {
      format: "prophet.execution",
      version: 1,
      input: execution.input,
      state: { representation: "projection", resumable: false },
      execution: {
        status: execution.status,
        scope: "synchronous-entry",
        retained: execution.status === "analysis-stop" ? "partial-checkpoint" : "entry-completion",
        diagnostic: execution.diagnostic,
        maxSteps: options.maxSteps,
        modelDomain: execution.modelDomain,
        limitations: [
          "Opaque native implementations and private host metadata are not portable state.",
          "Function definitions retain code and lexical scope, not derived callback summaries.",
          "Future events are not explored. A stopped checkpoint may omit explored sibling histories and unvisited continuations."
        ]
      },
      graph: encodeGraph(roots)
    };
    // Serialize fully before writing so an encoding failure cannot emit a
    // truncated result that resembles a successfully completed run.
    process.stdout.write(JSON.stringify(result) + "\n");
    return execution.status === "analysis-stop" ? 2 : 0;
  } catch (error) {
    process.stderr.write(`prophet: ${error && error.message ? error.message : String(error)}\n`);
    return 1;
  }
}
