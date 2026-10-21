import { parseArguments } from "../src/cli/arguments";

test("CLI accepts an environment path once in any order", () => {
  for (const args of [
    ["--environment", "initial.json", "--", "server.js"],
    ["--environment", "initial.json", "--max-events", "1", "--", "server.js"],
    ["--max-events", "1", "--environment", "initial.json", "--", "server.js"],
    ["--environment", "initial.json", "--runtime", "node@24.21.0", "--", "server.js"]
  ]) {
    expect(parseArguments(args)).toMatchObject({ kind: "run", environment: "initial.json", script: "server.js" });
  }
});

test("CLI omits the environment field when no environment is supplied", () => {
  const parsed = parseArguments(["--", "server.js"]);
  expect(parsed).toMatchObject({ kind: "run", script: "server.js" });
  expect(Object.prototype.hasOwnProperty.call(parsed, "environment")).toBe(false);
});

test("CLI rejects malformed environment arguments", () => {
  for (const args of [
    ["--environment"],
    ["--environment", "", "--", "server.js"],
    ["--environment", "--", "server.js"],
    ["--environment", "a.json", "--environment", "b.json", "--", "server.js"],
    ["--help", "--environment", "a.json"]
  ]) {
    expect(() => parseArguments(args)).toThrow();
  }
});

test("CLI preserves an environment-looking target argument", () => {
  expect(parseArguments(["--", "server.js", "--environment", "target.json"]))
    .toMatchObject({ args: ["--environment", "target.json"] });
});
