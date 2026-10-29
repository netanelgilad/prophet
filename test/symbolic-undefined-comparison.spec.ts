import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { ESNumber, Undefined } from '../src/types';
for(const operator of ['<','<=','>','>=']) test(`undefined ${operator} symbolic Number is false in both operand orders`,()=>{
 const x=ESNumber();
 const [completion,context]=evaluateCode(`const left=undefined ${operator} x; const right=x ${operator} undefined;`,
  setVariablesInScope(nodeInitialExecutionContext,{x}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.left).toMatchObject({value:false});
 expect(context.value.scope.right).toMatchObject({value:false});
});
test('undefined comparison retains prior operand effects and conditional numeric alternatives',()=>{
 const x=ESNumber();
 const [completion,context]=evaluateCode(`let calls=0; function missing(){calls++;return undefined;}
 const value=x<0 ? undefined : x; const result=missing() < value; const order=calls===1;`,
 setVariablesInScope(nodeInitialExecutionContext,{x}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.result).toMatchObject({value:false});
 expect(context.value.scope.order).toMatchObject({value:true});
});
