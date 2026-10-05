import { parseArguments } from "../src/cli/arguments";

test("CLI defaults to the pinned runtime and a finite execution budget", () => {
  expect(parseArguments(["--", "server.js"])).toEqual({
    kind: "run",
    runtime: "node@24.21.0",
    script: "server.js",
    args: [],
    maxSteps: 100000, maxEvents: 0
  });
});

test("CLI accepts explicit runtime and budget in either order", () => {
  for (const options of [
    ["--runtime", "node@24.21.0", "--max-steps", "25"],
    ["--max-steps", "25", "--runtime", "node@24.21.0"]
  ]) {
    expect(parseArguments([...options, "--", "./server.js", "first"])).toEqual({
      kind: "run", runtime: "node@24.21.0", script: "./server.js", args: ["first"], maxSteps: 25, maxEvents: 0
    });
  }
});

test("CLI preserves all target arguments without interpreting them as Prophet options", () => {
  const args = ["--runtime", "other-runtime", "--", "--help", "", "an argument with spaces"];
  expect(parseArguments(["--", "-script.js", ...args])).toMatchObject({ script: "-script.js", args });
});

test("CLI help does not require a target script", () => {
  expect(parseArguments(["--help"])).toEqual({ kind: "help" });
});

test.each([
  [],
  ["server.js"],
  ["--"],
  ["--", ""],
  ["--runtime"],
  ["--runtime", "node@24.21.0"],
  ["--runtime", "node@20.1.0", "--", "server.js"],
  ["--runtime", "node@24.21.0", "--runtime", "node@24.21.0", "--", "server.js"],
  ["--max-steps", "1", "--max-steps", "2", "--", "server.js"],
  ["--max-steps"],
  ["--unknown", "--", "server.js"],
  ["--environment", "initial.json", "--", "server.js"],
  ["--runtime=node@24.21.0", "--", "server.js"],
  ["--help", "--", "server.js"],
  ["--runtime", "node@24.21.0", "--help"]
].map(args => [args]))("CLI rejects malformed or unsupported arguments: %j", (args: string[]) => {
  expect(() => parseArguments(args)).toThrow();
});

test.each(["0", "-1", "1.5", "Infinity", "NaN", "1e3", "", " 1", "9007199254740992", "--"])(
  "CLI rejects an invalid execution budget: %s", value => {
    expect(() => parseArguments(["--max-steps", value, "--", "server.js"])).toThrow();
  }
);

test("CLI accepts the smallest positive budget and the largest exactly represented integer", () => {
  for (const budget of [1, Number.MAX_SAFE_INTEGER]) {
    expect(parseArguments(["--max-steps", String(budget), "--", "server.js"])).toMatchObject({ maxSteps: budget });
  }
});

test("CLI accepts bounded incoming event exploration", () => {
  for (const maxEvents of [0, 1, 2]) expect(parseArguments(["--max-events", String(maxEvents), "--", "server.js"]))
    .toMatchObject({ maxEvents });
});
test.each(["-1", "3", "1.5", "", "Infinity", "NaN"])("CLI rejects unsupported incoming event bounds: %s", bound => {
  expect(() => parseArguments(["--max-events", bound, "--", "server.js"])).toThrow(/event/i);
});
test("CLI rejects duplicate incoming event bounds", () => {
  expect(() => parseArguments(["--max-events", "0", "--max-events", "1", "--", "server.js"])).toThrow(/once/);
});
