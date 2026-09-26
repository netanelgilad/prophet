import { evaluateCode, nodeInitialExecutionContext } from "../src";

function scope(source: string) {
  const [, context] = evaluateCode(source, nodeInitialExecutionContext);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}

test("method reads preserve identity and only direct calls bind the receiver", () => {
  const result = scope(`
    function method() { return this; }
    var object = { method: method };
    var detached = object.method;
    var array = [];
    var result = object.method === method && object.method === object.method &&
      object.method() === object && detached() === this && array.reverse === array.reverse;
  `);
  expect(result.result).toMatchObject({ value: true });
});

test("constructors retain receiver identity, writes, and sequential argument effects", () => {
  const result = scope(`
    var n = 0;
    var saved;
    function C(a, b) { this.a = a; this.b = b; saved = this; return 42; }
    var object = new C(n = n + 1, n = n + 1);
    var result = object === saved && object.a === 1 && object.b === 2 && n === 2;
    function Replacement() { this.x = 1; return { x: 2 }; }
    var replacement = new Replacement();
    var replaced = replacement.x === 2;
  `);
  expect(result.result).toMatchObject({ value: true });
  expect(result.replaced).toMatchObject({ value: true });
});

test("symbolic constructor returns select objects or the allocated receiver", () => {
  const result = scope(`
    var condition = Math.random() < 0.5;
    function C() { return condition ? { x: 1 } : { x: 2 }; }
    var object = new C();
    var result = object.x >= 1;
    function D() { this.x = 3; return condition ? { x: 4 } : 7; }
    var other = new D();
    var proof = condition ? other.x === 4 : other.x === 3;
  `);
  expect(result.result).toMatchObject({ value: true });
  expect(result.proof).toMatchObject({ value: true });
});

test("finally runs on returns and throws and can override their completion", () => {
  const result = scope(`
    var effects = 0;
    function preserved() { try { return 1; } finally { effects = effects + 1; } }
    function overridden() { try { return 1; } finally { return 2; } }
    function recovered() { try { throw 3; } finally { return 4; } }
    var a = preserved();
    var b = overridden();
    var c = recovered();
    var caught = 0;
    try { try { throw 6; } finally { throw 5; } } catch (e) { caught = e; }
    var result = a === 1 && b === 2 && c === 4 && effects === 1 && caught === 5;
  `);
  expect(result.result).toMatchObject({ value: true });
});

test("symbolic catch and finally preserve correlation and restore catch bindings", () => {
  const result = scope(`
    var condition = Math.random() < 0.5;
    var e = "outer";
    var record = { caught: false, finished: false };
    function operation() {
      try {
        if (condition) throw 7;
        return 1;
      } catch (e) {
        record.caught = e === 7;
        return 2;
      } finally {
        record.finished = true;
      }
    }
    var value = operation();
    var proof = condition ? value === 2 && record.caught : value === 1 && !record.caught;
    var complete = record.finished && e === "outer";
    function override() {
      try { return 1; } finally { if (condition) return 2; }
    }
    var overridden = override();
    var finalProof = condition ? overridden === 2 : overridden === 1;
  `);
  expect(result.proof).toMatchObject({ value: true });
  expect(result.complete).toMatchObject({ value: true });
  expect(result.finalProof).toMatchObject({ value: true });
});

test("unsupported effects fail explicitly instead of producing a false proof", () => {
  const cases: Array<[string, RegExp]> = [
    ['var n = 0; var o = { toString: function() { n = 1; return "x"; } }; var s = "" + o;', /object-to-primitive/],
    ["var x = 1; x.a = 2;", /primitive values/],
    ["var x = 1; x += 2;", /Compound assignment/],
    ["do {} while (false);", /Do-while/],
    ["function C() { if (Math.random() < 0.5) throw 42; } var x = new C();", /throwing symbolic constructors/],
    ["function f() { if (Math.random() < 0.5) throw 42; } var x = f();", /throws on only some paths/]
  ];
  for (const [source, error] of cases) {
    expect(() => evaluateCode(source, nodeInitialExecutionContext)).toThrow(error);
  }
});
