import {execFileSync} from 'child_process';
import {evaluateCode,nodeInitialExecutionContext} from '../src';
import {ExecutionContext,setVariablesInScope} from '../src/execution-context/ExecutionContext';
import {hasExecutionBoundary} from '../src/execution-context/Completion';
import {symbolicNumberArray} from '../src/array/symbolic';
import {ESNumber,Undefined} from '../src/types';
import {assertPinnedNode} from './commonjs/oracle';
beforeAll(assertPinnedNode);
const program=`function weighted(values) {
  let low=0; let mid=0; let high=0;
  for(let i=0;i<values.length;i++) {
    if(values[i]<0) low=low+1; else if(values[i]===0) mid=mid+2; else high=high+3;
  }
  return 6*low+3*mid+2*high !== 6*values.length;
}`;
function run(source=program, finite=true) {
  const element=ESNumber(); if(finite) element.knowledge=[{kind:'finite',subject:element}];
  const input=symbolicNumberArray({minimumLength:0,maximumLength:1000000,element});
  const initial=setVariablesInScope(nodeInitialExecutionContext,{input});
  const result=evaluateCode(source+' const result=weighted(input);',ExecutionContext({...initial.value,evaluationBudget:{remaining:65}}));
  return {completion:result[0],context:result[1],input};
}
test('three weighted counters conserve a fully symbolic million-element domain',()=>{
  const {completion,context,input}=run();
  expect(completion).toBe(Undefined);
  expect(context.value.scope.result).toMatchObject({value:false});
  expect(input.shape.sequence.indexedReads.size).toBe(0);
  expect(input.shape.sequence.reads.size).toBe(0);
});
test.each(['low','mid','high'])('%s stays symbolic',counter=>{
  const {completion,context}=run(program.replace('6*low+3*mid+2*high !== 6*values.length',counter));
  expect(completion).toBe(Undefined);
  expect(context.value.scope.result).toMatchObject({type:'number'});
  expect((context.value.scope.result as any).value).toBeUndefined();
});
test('renamed counters and reordered weighted terms retain the proof',()=>{
  const {completion,context}=run(program.replace(/low/g,'a').replace(/mid/g,'b').replace(/high/g,'c')
    .replace('6*a+3*b+2*c','2*c+6*a+3*b'));
  expect(completion).toBe(Undefined);
  expect(context.value.scope.result).toMatchObject({value:false});
});
test.each([
 ['skipped zeros',program.replace('mid=mid+2','mid=mid+0')],
 ['late deviation',program.replace('if(values[i]<0)','if(i===999999) {} else if(values[i]<0)')],
 ['unrelated mutation',program.replace('for(let','let extra=7; for(let').replace('if(values[i]<0)','extra=extra+1; if(values[i]<0)')],
])('%s cannot receive a false proof',(_name,source)=>{
 const {completion,context}=run(source);
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.result).toBeUndefined();
});
test('NaN-containing domain remains outside finite-array induction',()=>{
 const {completion,context}=run(program,false);
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.result).toBeUndefined();
});
test('native controls cover empty signed zeros extremes and mutant witnesses',()=>{
 const source=program+program.replace('weighted','broken').replace('high=high+3','high=high+4');
 const output=execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source+
 `console.log(JSON.stringify([weighted([]),weighted([-0,0,-1,1,Number.MAX_VALUE,-Number.MAX_VALUE]),broken([1]),broken([0])]))`],{encoding:'utf8'});
 expect(JSON.parse(output)).toEqual([false,false,true,false]);
});

test('different coprime scales prove the same normalized partition invariant',()=>{
 const source=program.replace('low=low+1','low=low+2').replace('mid=mid+2','mid=mid+3')
   .replace('high=high+3','high=high+5').replace('6*low+3*mid+2*high !== 6*values.length','15*low+10*mid+6*high !== 30*values.length');
 const {completion,context}=run(source);
 expect(completion).toBe(Undefined);
 expect(context.value.scope.result).toMatchObject({value:false});
});
test('preloop aliases retain zero after weighted summary',()=>{
 const source=program.replace('for(let','const beforeLow=low; const beforeMid=mid; const beforeHigh=high; for(let')
  .replace('return 6*low','return beforeLow!==0 || beforeMid!==0 || beforeHigh!==0 || 6*low');
 const {completion,context}=run(source);
 expect(completion).toBe(Undefined);
 expect(context.value.scope.result).toMatchObject({value:false});
});
test.each([
 ['scale beyond candidate bound',program.replace('high=high+3','high=high+17')],
 ['wrong index successor',program.replace('i++)','i=i+2)')],
 ['four mutable zero candidates',program.replace('for(let','let spare=0; for(let')],
 ['negative increment',program.replace('low=low+1','low=low-1')],
])('%s retains a bounded unsupported path',(_name,source)=>{
 const {completion,context}=run(source);
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.result).toBeUndefined();
});
test('ordinary concrete empty and signed-zero arrays match native outcomes',()=>{
 const [completion,context]=evaluateCode(program+' const empty=weighted([]); const zeros=weighted([-0,0]); const mixed=weighted([-2,0,3]);',nodeInitialExecutionContext);
 expect(completion).toBe(Undefined);
 expect(context.value.uncaught).toBeUndefined();
 expect(context.value.scope.empty).toMatchObject({value:false});
 expect(context.value.scope.zeros).toMatchObject({value:false});
 expect(context.value.scope.mixed).toMatchObject({value:false});
});

test('wrong increment completes with an unknown conservation predicate',()=>{
 const {completion,context}=run(program.replace('high=high+3','high=high+4'));
 expect(completion).toBe(Undefined);
 expect(context.value.uncaught).toBeUndefined();
 expect(context.value.scope.result).toMatchObject({type:'boolean'});
 expect((context.value.scope.result as any).value).toBeUndefined();
});
