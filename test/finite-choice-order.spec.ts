import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { Undefined } from '../src/types';
test('a finite-choice loop guard refines the choice that makes progress possible',()=>{
 const [completion,context]=evaluateCode(`const low=flag?2:0;const high=1;
 let bad=false;if(low<=high) bad=flag;else bad=!flag;`,
 setVariablesInScope(nodeInitialExecutionContext,{flag:ESBoolean()}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.bad).toMatchObject({value:false});
});
test('two correlated numeric choices retain their feasible relational branches',()=>{
 const [completion,context]=evaluateCode(`const low=a?3:0;const high=b?2:-1;
 let bad=false;if(low<=high) bad=a||!b;`,
 setVariablesInScope(nodeInitialExecutionContext,{a:ESBoolean(),b:ESBoolean()}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.bad).toMatchObject({value:false});
});
import { ESNumber } from '../src/types';
test('ordered unequal symbolic numbers form a strict edge for transitive reasoning',()=>{
 const a=ESNumber(),b=ESNumber(),c=ESNumber();
 for(const n of [a,b,c]) n.knowledge=[{kind:'finite',subject:n}];
 const [completion,context]=evaluateCode(`let bad=false;
 if(a!==b && a<=b && b<=c) bad=!(a<c);`,
 setVariablesInScope(nodeInitialExecutionContext,{a,b,c}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.bad).toMatchObject({value:false});
});
test('inequality alone does not establish an order when NaN is possible',()=>{
 const [completion,context]=evaluateCode(`let valid=true;if(a!==b) valid=a<b||a>b;`,
 setVariablesInScope(nodeInitialExecutionContext,{a:ESNumber(),b:ESNumber()}));
 expect(completion).toBe(Undefined);
 expect((context.value.scope.valid as any).value).toBeUndefined();
});
test('excluding a sentinel index retains every nested guard needed by bounds',()=>{
 const a=ESNumber(),b=ESNumber(),target=ESNumber();
 for(const n of [a,b,target]) n.knowledge=[{kind:'finite',subject:n}];
 const [completion,context]=evaluateCode(`const index=a===target?0:(a<target?(b===target?1:-1):-1);
 const answer=index===-1?true:index>=0&&index<2;`,
 setVariablesInScope(nodeInitialExecutionContext,{a,b,target}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.answer).toMatchObject({value:true});
});

test('a relation over selected symbolic numbers retains the selecting guard',()=>{
 const a=ESNumber(),b=ESNumber(),target=ESNumber();
 for(const n of [a,b,target]) n.knowledge=[{kind:'finite',subject:n}];
 const [completion,context]=evaluateCode(`const pivot=flag?a:b;const comparison=pivot<target;
 const answer=flag ? comparison===(a<target) : comparison===(b<target);`,
 setVariablesInScope(nodeInitialExecutionContext,{a,b,target,flag:ESBoolean()}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.answer).toMatchObject({value:true});
});

test('a prior with a selected guard preserves its nested Boolean implication',()=>{
 const [completion,context]=evaluateCode(`const guard=a?b:c;
 const prior=guard ? (a?d:true) : true;
 const answer=prior ? (!a || !b || d) : true;`,
 setVariablesInScope(nodeInitialExecutionContext,{a:ESBoolean(),b:ESBoolean(),c:ESBoolean(),d:ESBoolean()}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.answer).toMatchObject({value:true});
});

test('Boolean identity selections preserve the original condition',()=>{
 const [completion,context]=evaluateCode(`const identity=flag?true:false;
 const inverse=flag?false:true;const answer=identity===flag && inverse===!flag;`,
 setVariablesInScope(nodeInitialExecutionContext,{flag:ESBoolean()}));
 expect(completion).toBe(Undefined);
 expect(context.value.scope.answer).toMatchObject({value:true});
});
