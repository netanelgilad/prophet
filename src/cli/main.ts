import { parseArguments } from "./arguments";
import { encodeGraph } from "./graph";
import { runFile } from "./runtime";

const usage = `Usage: prophet [--runtime node@24.21.0] [--max-steps N] [--max-events 0|1] -- SCRIPT [args...]

Interpret one CommonJS file and write its symbolic graph to stdout.
This slice follows CommonJS imports and evaluates supported HTTP startup,
including queued bind notifications. Unknown host APIs stop when reached.
No target code or external writes run natively. --max-events 1 explores at most
one parsed incoming event; the default 0 stops after startup.
The graph is an inspection projection, not a resumable environment snapshot.
Exit codes: 0 analyzed bounded completion (including a program throw),
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
    // Serialize fully before writing so an encoding failure cannot emit a
    // truncated result that resembles a successfully completed run.
    process.stdout.write(JSON.stringify(encodeGraph(roots)) + "\n");
    if (execution.status === "analysis-stop") {
      process.stderr.write(`prophet: ${execution.diagnostic}\n`);
    }
    return execution.status === "analysis-stop" ? 2 : 0;
  } catch (error) {
    process.stderr.write(`prophet: ${error && error.message ? error.message : String(error)}\n`);
    return 1;
  }
}
