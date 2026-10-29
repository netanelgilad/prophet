import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Any, ESNumber, TESBoolean, TESNumber, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);
function integer(low: number, high: number) {
  const value = ESNumber();
  value.knowledge = [{kind:"integer",subject:value},
    {kind:"order",left:ESNumber(low),right:value,strict:false},
    {kind:"order",left:value,right:ESNumber(high),strict:false}];
  return value;
}
const transaction = `function speculate(left, right, amount, stage) {
  const savedLeft = left.value;
  const savedRight = right.value;
  try {
    left.value = left.value - amount;
    if (stage === 0) throw "debit";
    right.value = right.value + amount;
    if (stage === 1) throw "credit";
    return left;
  } catch (error) {
    return right;
  } finally {
    left.value = savedLeft;
    right.value = savedRight;
    finalizations = finalizations + 1;
  }
}`;
const inverse = transaction.replace('left.value = savedLeft;', 'left.value = left.value + amount;')
  .replace('right.value = savedRight;', 'right.value = right.value - amount;');
function inputs(): {[key:string]:Any} {
  return {a:integer(-1000000,1000000),b:integer(-1000000,1000000),
    amount:integer(0,1000),stage:integer(0,2),alias:ESBoolean()};
}
function run(source: string, given = inputs()) {
  const [completion, context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext,given));
  expect(completion).toBe(Undefined);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}
function scenario(fn: string, target: string) {
  return `${fn}
    let finalizations = 0;
    const left = {value:a}; const distinct = {value:b};
    const right = ${target};
    const oldLeft = left.value; const oldRight = right.value;
    function observe() { return left.value + right.value; }
    const oldTotal = observe();
    const returned = speculate(left,right,amount,stage);
    const violation = left.value !== oldLeft || right.value !== oldRight;
    const observedViolation = observe() !== oldTotal;
    const returnedViolation = returned.value !== (returned === left ? oldLeft : oldRight);
    const returnIdentityViolation = stage === 2 ? returned !== left : returned !== right;
    const finalValue = left.value;`;
}
for (const [name,target] of [['same','left'],['distinct','distinct'],['symbolic','alias ? left : distinct']]) {
  test(`snapshot rollback restores ${name} references across symbolic exception stages`,()=>{
    const scope=run(scenario(transaction,target));
    for(const key of ['violation','observedViolation','returnedViolation','returnIdentityViolation'])
      expect(scope[key]).toMatchObject({value:false});
    expect(scope.finalizations).toMatchObject({value:1});
    expect((scope.finalValue as TESNumber).value).toBeUndefined();
    expect((scope.stage as TESNumber).value).toBeUndefined();
  });
  test(`inverse rollback with ${name} references must not receive a proof`,()=>{
    const scope=run(scenario(inverse,target));
    expect((scope.violation as TESBoolean).value).toBeUndefined();
    expect(scope.finalizations).toMatchObject({value:1});
  });
}
test('restoring snapshots in reversed order is valid even for aliases',()=>{
  const reversed=transaction.replace('left.value = savedLeft;\n    right.value = savedRight;',
    'right.value = savedRight;\n    left.value = savedLeft;');
  const scope=run(scenario(reversed,'alias ? left : distinct'));
  expect(scope.violation).toMatchObject({value:false});
  expect(scope.returnedViolation).toMatchObject({value:false});
});
test('snapshot restore works for unrestricted Number values including NaN',()=>{
  // Strict equality is not a universal restored-value check: NaN !== NaN.
  const scope=run(scenario(transaction,'left'),{...inputs(),a:ESNumber()});
  expect((scope.violation as TESBoolean).value).toBeUndefined();
});
test('a stale observation before finally is not the restored observation',()=>{
  const source=transaction.replace('return left;', 'return left.value;')
    .replace('return right;', 'return right.value;');
  const scope=run(`${source} let finalizations=0; const left={value:a};
    const returned=speculate(left,left,amount,stage);
    const violation=returned!==a; const restored=left.value===a;`);
  expect((scope.violation as TESBoolean).value).toBeUndefined();
  expect(scope.restored).toMatchObject({value:true});
});
test('pinned Node independently witnesses every stage, alias layout and broken outcome',()=>{
  const source=`${transaction}
    ${inverse.replace('function speculate(', 'function broken(')}
    let finalizations=0;
    function check(fn,same,stage,amount){
      const left={value:10},right=same?left:{value:20};
      const a=left.value,b=right.value;
      const returned=fn(left,right,amount,stage);
      return [left.value!==a||right.value!==b,
        returned!==(stage===2?left:right)];
    }
    const results=[];
    for(const same of [false,true]) for(const stage of [0,1,2])
      results.push(check(speculate,same,stage,3),check(broken,same,stage,3));
    results.push(check(broken,false,0,0));
    console.log(JSON.stringify(results));`;
  const actual=JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,
    ['-e',source],{encoding:'utf8'}));
  const expected=[];
  for(const _same of [false,true]) for(const stage of [0,1,2])
    expected.push([false,false],[stage===0,false]);
  expected.push([false,false]);
  expect(actual).toEqual(expected);
});

test('unbounded or fractional failure stages do not imply an exhaustive three-stage dispatch',()=>{
  for(const stage of [ESNumber(),integer(0,3)]) {
    const scope=run(scenario(transaction,'distinct'),{...inputs(),stage});
    expect(scope.violation).toMatchObject({value:false});
    expect((scope.returnIdentityViolation as TESBoolean).value).toBeUndefined();
  }
});

import { integerDomainEquality } from "../src/symbolic/integer-domain";
import { Knowledge } from "../src/symbolic/model";
function exclusion(value: TESNumber, literal: number): Knowledge[number] {
  return {kind:'truth',truth:false,condition:{...ESBoolean(),
    expression:{kind:'strict-equal',left:value,right:ESNumber(literal)}}};
}
test('bounded integer exclusion leaves a singleton without fixing unrelated inputs',()=>{
  const x=integer(-2,2),y=integer(-2,2);
  const facts=[-2,-1,1,2].map(n=>exclusion(x,n));
  expect(integerDomainEquality(x,ESNumber(-0),facts)).toBe(true);
  expect(integerDomainEquality(ESNumber(1),x,facts)).toBe(false);
  expect(integerDomainEquality(y,ESNumber(0),facts)).toBeUndefined();
});
test('integer domain reasoning respects open fractional bounds and unknown interiors',()=>{
  const x=integer(0,3);
  x.knowledge=x.knowledge!.concat(
    {kind:'order',left:ESNumber(0.5),right:x,strict:true},
    {kind:'order',left:x,right:ESNumber(2),strict:true});
  expect(integerDomainEquality(x,ESNumber(1),[])).toBe(true);
  expect(integerDomainEquality(integer(0,2),ESNumber(1),[])).toBeUndefined();
});
test('inconsistent, excessive and unsafe domains decline finite exclusion inference',()=>{
  const x=integer(0,1);
  expect(integerDomainEquality(x,ESNumber(0),[exclusion(x,0),exclusion(x,1)])).toBeUndefined();
  expect(integerDomainEquality(x,ESNumber(0),Array(257).fill(exclusion(x,1)))).toBeUndefined();
  expect(integerDomainEquality(integer(0,64),ESNumber(0),[])).toBeUndefined();
  expect(integerDomainEquality(integer(0,Number.MAX_VALUE),ESNumber(0),[])).toBeUndefined();
});
test('single zero domain does not rewrite signed zero or admit NaN',()=>{
  const x=integer(0,0);
  expect(integerDomainEquality(x,ESNumber(-0),[])).toBe(true);
  expect(x.value).toBeUndefined();
  expect(integerDomainEquality(ESNumber(),ESNumber(0),[])).toBeUndefined();
  expect(integerDomainEquality(x,ESNumber(NaN),[])).toBeUndefined();
});
