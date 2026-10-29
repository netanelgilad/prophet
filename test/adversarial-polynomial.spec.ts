import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { exactIntegerDifference } from "../src/symbolic/affine";
import { arithmeticNumber } from "../src/symbolic/arithmetic";
import { ESNumber, TESNumber, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";
beforeAll(assertPinnedNode);
function integer(low = -100, high = 100) {
  const value = ESNumber();
  value.knowledge = [{kind:"integer",subject:value},
    {kind:"order",left:ESNumber(low),right:value,strict:false},
    {kind:"order",left:value,right:ESNumber(high),strict:false}];
  return value;
}
function run(source: string, input = integer()) {
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext,
    {a:input,b:integer(),c:integer(),d:integer(),t:integer()}));
  expect(completion).toBe(Undefined);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}
const source = `const before = a*d-b*c; const rowA=a+t*c; const rowB=b+t*d;
  const after=rowA*d-rowB*c; const violation=after!==before;`;
test("symbolic row shear preserves determinant with all five inputs independently unknown", () => {
  const scope = run(source);
  expect(scope.violation).toMatchObject({value:false});
  for (const key of ["a","b","c","d","t","before","rowA","rowB","after"])
    expect((scope[key] as TESNumber).value).toBeUndefined();
});
test("renamed reordered distribution and coefficients normalize", () => {
  const scope = run(`const x = a, y = b; const violation=(2*x+3*y)*(x-y)!==(2*x*x+x*y-3*y*y);
    const shifted=(a+b)*(a-b)+7; const order=shifted>a*a-b*b;`);
  expect(scope.violation).toMatchObject({value:false});
  expect(scope.order).toMatchObject({value:true});
});
for (const mutation of ["b", "b-t*d"]) test(`broken row update ${mutation} remains unknown`, () => {
  const scope=run(source.replace("b+t*d",mutation));
  expect((scope.violation as TESBoolean).value).toBeUndefined();
});
for (const domain of ["fractional","nan","unsafe"]) test(`declines ${domain} determinant cancellation`, () => {
  const input = domain === "unsafe" ? integer(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER) : ESNumber();
  if (domain === "fractional") input.knowledge=[{kind:"finite",subject:input},
    {kind:"order",left:ESNumber(-1),right:input,strict:false},
    {kind:"order",left:input,right:ESNumber(1),strict:false}];
  expect((run(source,input).violation as TESBoolean).value).toBeUndefined();
});
test("independent atom identities cannot cancel despite identical bounds", () => {
  const a=integer(),b=integer();
  expect(exactIntegerDifference(arithmeticNumber("*",a,a),arithmeticNumber("*",b,b))).toBeUndefined();
});
test("pinned Node verifies independent concrete determinant and mutant witnesses", () => {
  const output=JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,["-e",`
    function check(a,b,c,d,t,kind) {return (a+t*c)*d-(kind===1?b:kind===2?b-t*d:b+t*d)*c!==a*d-b*c;}
    console.log(JSON.stringify([process.version,
      [0,1,2].map(k=>check(2,3,4,5,6,k)), [0,1,2].map(k=>check(2,3,4,5,0,k)),
      check(0.1,0.1,0.1,0.2,0.1,0),check(NaN,3,4,5,6,0)]));`],{encoding:"utf8"}));
  expect(output).toEqual(["v24.21.0",[false,true,true],[false,false,false],true,true]);
});

// Direct expression fixtures isolate normalization resource limits from the
// general evaluator's separate construction/merging budgets.
function expression(operator: "+" | "-" | "*", left: TESNumber, right: TESNumber) {
  const value=ESNumber(); value.expression={kind:"binary",operator,left,right}; return value;
}
function sum(values: TESNumber[]): TESNumber {
  if(values.length===1) return values[0];
  const middle=Math.floor(values.length/2);
  return expression("+",sum(values.slice(0,middle)),sum(values.slice(middle)));
}
test("degree cap declines degree five but admits degree four", () => {
  const x=integer(-1,1);
  const square=expression("*",x,x), fourth=expression("*",square,square);
  expect(exactIntegerDifference(fourth,expression("*",expression("*",expression("*",x,x),x),x))).toBe(0);
  const fifth=expression("*",fourth,x);
  expect(exactIntegerDifference(fifth,fifth)).toBeUndefined();
});
test("monomial cap refuses product expansion before retaining more than 64 terms", () => {
  const left=sum(Array.from({length:9},()=>integer(-1,1)));
  const right=sum(Array.from({length:8},()=>integer(-1,1)));
  const large=expression("*",left,right);
  expect(exactIntegerDifference(large,large)).toBeUndefined();
});
test("work cap declines repeated expansion even with only 35 unique terms", () => {
  const base=sum(Array.from({length:4},()=>integer(-1,1)));
  const square=expression("*",base,base), fourth=expression("*",square,square);
  const large=expression("+",expression("+",fourth,fourth),fourth);
  expect(exactIntegerDifference(large,large)).toBeUndefined();
});
test("unsafe coefficients, intermediate products, cycles and excess depth remain unknown", () => {
  const x=integer(0,0);
  const coefficients=expression("*",expression("*",ESNumber(Number.MAX_SAFE_INTEGER),x),ESNumber(2));
  expect(exactIntegerDifference(coefficients,x)).toBeUndefined();
  const y=integer(0,Number.MAX_SAFE_INTEGER);
  const product=expression("*",y,ESNumber(2));
  expect(exactIntegerDifference(expression("-",product,product),ESNumber(0))).toBeUndefined();
  const cyclic=ESNumber(); cyclic.expression={kind:"binary",operator:"*",left:cyclic,right:ESNumber(1)};
  expect(exactIntegerDifference(cyclic,cyclic)).toBeUndefined();
  let deep=x; for(let i=0;i<25;i++) deep=expression("*",deep,ESNumber(1));
  expect(exactIntegerDifference(deep,x)).toBeUndefined();
});
test("multiplicative equality does not rewrite a signed-zero-sensitive result", () => {
  const scope=run(`const result=a*a; const equal=result===0; const reciprocal=1/result;`,integer(0,0));
  expect(scope.equal).toMatchObject({value:true});
  expect((scope.result as TESNumber).value).toBeUndefined();
  expect((scope.reciprocal as TESNumber).value).toBeUndefined();
});
