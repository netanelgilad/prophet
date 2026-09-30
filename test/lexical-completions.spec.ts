import { evaluateCode, nodeInitialExecutionContext } from "../src";

function run(source: string) {
  const [, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("finally preserves captured binding identity on both symbolic completion paths", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    function factory() {
      let captured = 0;
      const read = function() { return captured; };
      try { if (guard) return read; throw 1; }
      catch (error) { return read; }
      finally { captured = 3; }
    }
    const read = factory();
    const observed = read();
  `);
  expect(scope.observed).toMatchObject({ value: 3 });
});

test("a caught function throw restores its caller environment before continuing", () => {
  const scope = run(`
    let captured = 1;
    function fail() { let captured = 9; throw captured; }
    let thrown;
    try { fail(); } catch (error) { thrown = error; captured = 2; }
    const observed = captured;
  `);
  expect(scope.thrown).toMatchObject({ value: 9 });
  expect(scope.observed).toMatchObject({ value: 2 });
});
