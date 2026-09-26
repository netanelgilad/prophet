import { evaluateCode, nodeInitialExecutionContext } from "../src";

function run(code: string) {
  return evaluateCode(code, nodeInitialExecutionContext)[1].value;
}

describe("function activation scopes", () => {
  test("recursive calls restore their caller's parameters", () => {
    const result = run(`
      const n = 100;
      function recurse(n) {
        if (n === 0) return n;
        recurse(n - 1);
        return n;
      }
      const result = recurse(10);
    `);

    expect(result.scope.result).toMatchObject({ type: "number", value: 10 });
    expect(result.scope.n).toMatchObject({ type: "number", value: 100 });
  });

  test("recursive calls restore local variables declared inside blocks", () => {
    const result = run(`
      const saved = 100;
      function recurse(n) {
        if (n === 0) return n;
        {
          const saved = n;
          recurse(n - 1);
          return saved;
        }
      }
      const result = recurse(10);
    `);

    expect(result.scope.result).toMatchObject({ type: "number", value: 10 });
    expect(result.scope.saved).toMatchObject({ type: "number", value: 100 });
    expect(result.scope).not.toHaveProperty("n");
  });

  test("fallthrough removes declarations while preserving nonlocal assignments", () => {
    const result = run(`
      let changed = 0;
      let shadowed = 100;
      function work(input) {
        var local = input;
        let shadowed = 5;
        {
          let blockLocal = 6;
          const blockConstant = 7;
          function helper() { return local; }
        }
        changed = 9;
      }
      work(2);
    `);

    expect(result.scope.changed).toMatchObject({ type: "number", value: 9 });
    expect(result.scope.shadowed).toMatchObject({ type: "number", value: 100 });
    for (const name of ["input", "local", "blockLocal", "blockConstant", "helper"]) {
      expect(result.scope).not.toHaveProperty(name);
    }
  });

  test("a thrown value restores local bindings and preserves earlier side effects", () => {
    const result = run(`
      const parameter = 100;
      let changed = 0;
      function fail(parameter) {
        const local = 3;
        changed = 9;
        throw "failed";
      }
      fail(2);
    `);

    expect(result.stderr).toBe("failed");
    expect(result.scope.parameter).toMatchObject({ type: "number", value: 100 });
    expect(result.scope.changed).toMatchObject({ type: "number", value: 9 });
    expect(result.scope).not.toHaveProperty("local");
  });

  test("nested function declarations do not make their own locals belong to the caller", () => {
    const result = run(`
      let changed = 0;
      function work() {
        function inner() { let changed = 5; }
        changed = 9;
      }
      work();
    `);

    expect(result.scope.changed).toMatchObject({ type: "number", value: 9 });
    expect(result.scope).not.toHaveProperty("inner");
  });

  test("missing arguments become undefined instead of inheriting caller bindings", () => {
    const result = run(`
      const parameter = 100;
      function read(parameter) { return parameter; }
      const result = read();
    `);

    expect(result.scope.result).toMatchObject({ type: "undefined" });
    expect(result.scope.parameter).toMatchObject({ type: "number", value: 100 });
  });
});
