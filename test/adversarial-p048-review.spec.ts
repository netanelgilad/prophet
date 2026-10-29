import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { hasExecutionBoundary } from "../src/execution-context/Completion";
import { symbolicNumberArray } from "../src/array/symbolic";
import { exactIntegerDifference } from "../src/symbolic/affine";
import { integerDomainEquality } from "../src/symbolic/integer-domain";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Knowledge } from "../src/symbolic/model";
import { ESNumber, TESNumber, Undefined } from "../src/types";

function integer(low:number,high:number) {
  const n=ESNumber(); n.knowledge=[{kind:"integer",subject:n},
    {kind:"order",left:ESNumber(low),right:n,strict:false},
    {kind:"order",left:n,right:ESNumber(high),strict:false}]; return n;
}
function expression(operator:string,left:TESNumber,right:TESNumber) {
  const n=ESNumber(); n.expression={kind:"binary",operator,left,right}; return n;
}
test("independent review: cubic associativity and fourth-degree commutativity",()=>{
  const a=integer(-10,10),b=integer(-10,10),c=integer(-10,10);
  const mul=(x:TESNumber,y:TESNumber)=>expression("*",x,y);
  expect(exactIntegerDifference(mul(mul(a,b),c),mul(a,mul(c,b)))).toBe(0);
  expect(exactIntegerDifference(mul(mul(a,b),mul(a,c)),mul(mul(c,a),mul(b,a)))).toBe(0);
  expect(exactIntegerDifference(mul(mul(a,b),c),mul(mul(a,b),integer(-10,10)))).toBeUndefined();
});
test("independent review: a safe final zero cannot excuse overflowing products",()=>{
  const x=integer(-100000000,100000000), product=expression("*",x,x);
  expect(exactIntegerDifference(expression("-",product,product),ESNumber(0))).toBeUndefined();
  const huge=integer(-Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
  expect(exactIntegerDifference(expression("*",ESNumber(0),expression("+",huge,huge)),ESNumber(0))).toBeUndefined();
});
test("independent review: coefficient cancellation does not merge distinct symbols",()=>{
  const x=integer(-10,10),y=integer(-10,10);
  const left=expression("*",expression("+",x,y),expression("-",x,y));
  const valid=expression("-",expression("*",x,x),expression("*",y,y));
  expect(exactIntegerDifference(left,valid)).toBe(0);
  expect(exactIntegerDifference(left,expression("-",expression("*",x,x),expression("*",x,y)))).toBeUndefined();
});
test("independent review: integer bound facts cannot be borrowed from another atom",()=>{
  const x=ESNumber(),y=integer(-2,2);
  x.knowledge=[{kind:"integer",subject:x}];
  expect(exactIntegerDifference(expression("*",x,x),expression("*",x,x),y.knowledge)).toBeUndefined();
  expect(integerDomainEquality(x,ESNumber(0),y.knowledge!)).toBeUndefined();
});
function excludes(value:TESNumber,n:number):Knowledge[number] {
  const condition=ESBoolean(); condition.expression={kind:"strict-equal",left:value,right:ESNumber(n)};
  return {kind:"truth",condition,truth:false};
}
test("independent review: exhaustive endpoint domains include the safe-integer endpoints",()=>{
  const max=Number.MAX_SAFE_INTEGER,x=integer(max-2,max);
  expect(integerDomainEquality(x,ESNumber(max),[excludes(x,max-2),excludes(x,max-1)])).toBe(true);
  const y=integer(-max,-max+2);
  expect(integerDomainEquality(y,ESNumber(-max),[excludes(y,-max+1),excludes(y,-max+2)])).toBe(true);
});
test("independent review: contradictory fractional singleton and signed-zero exclusions decline",()=>{
  const x=integer(0,1),condition=ESBoolean();
  condition.expression={kind:"strict-equal",left:x,right:ESNumber(0.5)};
  expect(integerDomainEquality(x,ESNumber(0),[{kind:"truth",condition,truth:true}])).toBeUndefined();
  const z=integer(0,0);
  expect(integerDomainEquality(z,ESNumber(0),[excludes(z,-0)])).toBeUndefined();
});

const weighted=`function check(values) {
  let a=0; let b=0; let c=0;
  for(let i=0;i<values.length;i++) {
    if(values[i]<-1) a=a+2; else if(values[i]>1) b=b+3; else c=c+5;
  }
  return 15*a+10*b+6*c !== 30*values.length;
}`;
function loop(source=weighted) {
  const element=ESNumber(); element.knowledge=[{kind:"finite",subject:element}];
  const input=symbolicNumberArray({minimumLength:0,maximumLength:1000000,element});
  const initial=setVariablesInScope(nodeInitialExecutionContext,{input});
  const [completion,context]=evaluateCode(source+' const result=check(input);',
    ExecutionContext({...initial.value,evaluationBudget:{remaining:65}}));
  return {completion,context,input};
}
test("independent review: different relatively-prime scales preserve weighted conservation",()=>{
  const {completion,context,input}=loop();
  expect(completion).toBe(Undefined);
  expect(context.value.scope.result).toMatchObject({value:false});
  expect(input.shape.sequence.reads.size).toBe(0);
  expect(input.shape.sequence.indexedReads.size).toBe(0);
});
test.each([
  ["late reset",weighted.replace('if(values[i]<-1)','if(i===999999) a=0; else if(values[i]<-1)')],
  ["double classification",weighted.replace('else if(values[i]>1)','if(values[i]>1)')],
  ["wrong successor",weighted.replace('i++)','i=i+2)')],
  ["mutating a counter in the update",weighted.replace('i++)','i++,a=a+2)')],
  ["nonzero base",weighted.replace('let a=0','let a=2')],
  ["replacing the input",weighted.replace('if(values[i]<-1)','values=[]; if(values[i]<-1)')],
])("independent review: %s cannot inherit the valid loop proof",(_name,source)=>{
  const {completion,context}=loop(source);
  expect(hasExecutionBoundary(completion) || !context.value.scope.result || (context.value.scope.result as any).value!==false).toBe(true);
  // The ordinary fallback may populate real read caches after proof rejection.
});
test("independent review: throwing finalizer overrides a pending return after restoring state",()=>{
  const [completion,context]=evaluateCode(`
    const box={value:x}; let returned=0; let caught=0;
    function transaction() { const old=box.value; try { box.value=x+1; return 7; }
      finally { box.value=old; throw 11; } }
    try { returned=transaction(); } catch(error) { caught=error; }
    const restored=box.value===x; const noReturn=returned===0; const thrown=caught===11;
  `,setVariablesInScope(nodeInitialExecutionContext,{x:integer(-100,100)}));
  expect(completion).toBe(Undefined);
  for(const name of ["restored","noReturn","thrown"]) expect(context.value.scope[name]).toMatchObject({value:true});
});
test("independent review: returning a primitive before rollback captures its earlier value",()=>{
  const [completion,context]=evaluateCode(`
    const box={value:x}; function transaction() { const old=box.value;
      try { box.value=x+3; return box.value; } finally { box.value=old; } }
    const returned=transaction(); const restored=box.value===x;
    const stale=returned===box.value; const captured=returned===x+3;
  `,setVariablesInScope(nodeInitialExecutionContext,{x:integer(-100,100)}));
  expect(completion).toBe(Undefined);
  expect(context.value.scope.restored).toMatchObject({value:true});
  expect(context.value.scope.stale).toMatchObject({value:false});
  expect(context.value.scope.captured).toMatchObject({value:true});
});
