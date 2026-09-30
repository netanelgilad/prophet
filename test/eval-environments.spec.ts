import { evaluateCode, nodeInitialExecutionContext } from "../src";

function run(source: string) {
  const [, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("direct eval var declarations remain local to their calling function", () => {
  const scope = run(`
    function read() { eval("var evalLocal = 3;"); return evalLocal; }
    const observed = read();
    const outside = typeof evalLocal;
  `);
  expect(scope.observed).toMatchObject({ value: 3 });
  expect(scope.outside).toMatchObject({ value: "undefined" });
});

test("direct eval instantiates function declarations before evaluating statements", () => {
  const scope = run(`
    const observed = eval("local(); function local() { return 3; } local();");
  `);
  expect(scope.observed).toMatchObject({ value: 3 });
});

test("direct eval prepares lexical declarations without leaking them", () => {
  const scope = run(`
    let evalLocal = 1;
    const observed = eval("let evalLocal = 3; evalLocal;");
    const outside = evalLocal;
  `);
  expect(scope.observed).toMatchObject({ value: 3 });
  expect(scope.outside).toMatchObject({ value: 1 });
});

test("eval-created functions retain lexical bindings after eval and its caller return", () => {
  const scope = run(`
    function factory() {
      let outer = 1;
      return eval("outer = 2; let inner = 3; function read() { return outer + inner; } read;");
    }
    const read = factory();
    const observed = read();
    const outside = typeof inner;
  `);
  expect(scope.observed).toMatchObject({ value: 5 });
  expect(scope.outside).toMatchObject({ value: "undefined" });
});

test("strict eval owns its var bindings and can update an enclosing lexical binding", () => {
  const scope = run(`
    function inspect() {
      let outer = 1;
      const evaluated = eval('"use strict"; var evalLocal = 3; outer = 2; evalLocal;');
      return evaluated === 3 && outer === 2 && typeof evalLocal === "undefined";
    }
    const observed = inspect();
  `);
  expect(scope.observed).toMatchObject({ value: true });
});

test("direct eval inherits strictness from its calling function", () => {
  const scope = run(`
    function inspect() {
      "use strict";
      const evaluated = eval("var evalLocal = 3; evalLocal;");
      return evaluated === 3 && typeof evalLocal === "undefined";
    }
    const observed = inspect();
  `);
  expect(scope.observed).toMatchObject({ value: true });
});

test("an empty strict direct eval returns undefined without a synthetic directive value", () => {
  const scope = run(`
    function inspect() { "use strict"; return eval(""); }
    const observed = inspect();
  `);
  expect(scope.observed).toMatchObject({ type: "undefined" });
});

test("indirect eval resolves the global environment instead of caller locals", () => {
  const scope = run(`
    const value = "global";
    function inspect() {
      const value = "local";
      const indirect = eval;
      return indirect("value;");
    }
    const observed = inspect();
  `);
  expect(scope.observed).toMatchObject({ value: "global" });
});

test("sloppy direct eval hoists var through the calling block to its function", () => {
  const scope = run(`
    function inspect() {
      { let blockLocal = 2; eval("var evalLocal = blockLocal;"); }
      return evalLocal;
    }
    const observed = inspect();
    const outside = typeof evalLocal;
  `);
  expect(scope.observed).toMatchObject({ value: 2 });
  expect(scope.outside).toMatchObject({ value: "undefined" });
});

test("conditional eval binding creation is an explicit gap instead of hiding an outer binding", () => {
  // A future presence-aware lookup must retain value=2 on the false path.
  // Reject this analysis until that representation exists.
  expect(() => run(`
    const guard = Math.random() < 0.5;
    let value = 2;
    function inspect() { if (guard) eval("var value = 1;"); return value; }
    const observed = inspect();
    const proof = guard ? observed === 1 : observed === 2;
  `)).toThrow("Conditional creation of bindings in an existing environment is not yet supported");
});

test("assignment resolves its destination before eval introduces a nearer var binding", () => {
  const scope = run(`
    let value = 0;
    function inspect() { value = eval("var value; 1;"); return value; }
    const local = inspect();
    const outside = value;
  `);
  expect(scope.local).toMatchObject({ type: "undefined" });
  expect(scope.outside).toMatchObject({ value: 1 });
});

test("eval throwing on one symbolic path resumes the assignment only on its normal path", () => {
  const scope = run(`
    const guard = Math.random() < 0.5;
    let observed = 0;
    let entered = 0;
    let finished = 0;
    let caught = false;
    try { observed = eval("entered = entered + 1; if (guard) throw 1; 2;"); }
    catch (error) { observed = 3; caught = error === 1; }
    finally { finished = finished + 1; }
    const proof = guard ? observed === 3 && caught : observed === 2 && !caught;
  `);
  expect(scope.proof).toMatchObject({ value: true });
  expect(scope.entered).toMatchObject({ value: 1 });
  expect(scope.finished).toMatchObject({ value: 1 });
});
