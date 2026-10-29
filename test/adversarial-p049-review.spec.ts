import {evaluateCode,nodeInitialExecutionContext,hasExecutionBoundary} from '../src';
import {setVariablesInScope} from '../src/execution-context/ExecutionContext';
import {ESBoolean} from '../src/boolean/ESBoolean';
import {Any,ESNumber,TESNumber,Undefined} from '../src/types';
import {selectValue} from '../src/symbolic';
function run(source:string,inputs:{[key:string]:Any}={flag:ESBoolean(),other:ESBoolean()}) {
 return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));
}
function prove(source:string) {
 const [completion,context]=run(source);
 expect(completion).toBe(Undefined);
 expect(context.value.uncaught).toBeUndefined();
 expect(context.value.scope.proof).toMatchObject({value:true});
}
test('independent conditional member review: numeric-string aliases and absent properties',()=>{
 prove(`const a=[5,6];const key=flag?0:'1';a[key]=9;
 const proof=(flag?a[0]===9&&a[1]===6:a[0]===5&&a[1]===9)&&a[other?'missing':'absent']===undefined;`);
});
test('independent conditional member review: RHS mutation cannot change retained key or receiver',()=>{
 prove(`let target={a:0,b:0};const original=target;let which=flag?'a':'b';let calls=0;
 function rhs(){calls=calls+1;which='other';target={a:5,b:5};return 7;}
 original[which]=rhs();
 const proof=calls===1&&target.a===5&&target.b===5&&(flag?original.a===7&&original.b===0:original.a===0&&original.b===7);`);
});
test('independent conditional member review: receiver and key choices retain correlations',()=>{
 prove(`const a={x:1,y:2};const b={x:3,y:4};const receiver=flag?a:b;
 receiver[flag?'x':'y']=8;
 const proof=flag?a.x===8&&a.y===2&&b.x===3&&b.y===4:a.x===1&&a.y===2&&b.x===3&&b.y===8;`);
});
test('independent conditional member review: negative zero and noncanonical numeric string keys',()=>{
 prove(`const a=[4];a[flag?-0:'01']=9;
 const proof=flag?a[0]===9&&a['01']===undefined:a[0]===4&&a['01']===9;`);
});
test('independent conditional length review: regrowth after divergent shape join remains unsupported',()=>{
 expect(()=>run('const a=[1,2,3];a.length=flag?0:1;a.length=3;'))
 .toThrow('Array assignment requires known element structure');
});
test('independent conditional length review: branch-local truncation removes old elements after regrowth',()=>{
 prove(`const a=[1,2,3];const alias=a;
 if(flag){a.length=0;a.length=3;}else{a.length=1;a.length=3;}
 const proof=alias.length===3&&a[1]===undefined&&a[2]===undefined&&(flag?a[0]===undefined:a[0]===1);`);
});
test('independent conditional length review: effectful RHS executes once and assignment returns value',()=>{
 prove(`let calls=0;const a=[1,2,3];function length(){calls=calls+1;return flag?1:2;}
 const returned=(a.length=length());
 const proof=calls===1&&(flag?returned===1&&a.length===1:returned===2&&a.length===2);`);
});
test('independent conditional member review: throwing key skips RHS on exactly that path',()=>{
 prove(`let calls=0;let caught=false;const a=[0];
 function key(){if(flag)throw 'key';return 0;}
 function rhs(){calls=calls+1;return 9;}
 try{a[key()]=rhs();}catch(e){caught=e==='key';}
 const proof=flag?caught&&calls===0&&a[0]===0:!caught&&calls===1&&a[0]===9;`);
});
test('independent floor review: ToNumber branch values preserve signed zero and exceptional numbers',()=>{
 const [completion,context]=run(`const a=Math.floor(flag?-0:0);const b=Math.floor(other?Infinity:-Infinity);
 const reciprocal=1/a; const proof=flag?reciprocal===-Infinity:reciprocal===Infinity;`);
 expect(completion).toBe(Undefined);expect(context.value.scope.proof).toMatchObject({value:true});
 expect((context.value.scope.b as TESNumber).value).toBeUndefined();
});
test('independent floor review: fallback coercion and argument effects retain exact order',()=>{
 prove(`let trace='';function input(){trace=trace+'a';return {valueOf:function(){trace=trace+'v';return {};},toString:function(){trace=trace+'s';return flag?'-0.1':'2.9';}};}
 function ignored(){trace=trace+'i';return 0;}
 const n=Math.floor(input(),ignored());
 const proof=trace==='aivs'&&(flag?n===-1:n===2);`);
});
test('independent floor review: failed coercion stops before fallback and preserves thrown value',()=>{
 prove(`let trace='';let caught=false;
 try{Math.floor({valueOf:function(){trace=trace+'v';throw 3;},toString:function(){trace=trace+'s';return '4';}});}catch(e){caught=e===3;}
 const proof=caught&&trace==='v';`);
});
test('independent finite dispatch review: deep choice rejects rather than exploring its valid prefix',()=>{
 let key:Any=ESNumber(0);
 for(let i=0;i<18;i++)key=selectValue(ESBoolean(),key,ESNumber(i+1));
 const [completion]=run('const a=[1];a[key]=2;',{key});
 expect(hasExecutionBoundary(completion)).toBe(true);
});
test('independent finite dispatch review: boolean and object keys remain explicit unsupported coercion gaps',()=>{
 for(const source of [`const a={};const result=a[flag?true:false];`,
   `const a={};const result=a[flag?{toString:function(){return 'x';}}:'x'];`])
   expect(()=>run(source)).toThrow('Computed property access requires a concrete number or string');
});

test('independent finite dispatch review: cyclic key stops before RHS execution',()=>{
 const key=ESNumber();key.expression={kind:'select',condition:ESBoolean(),consequent:key,alternate:ESNumber(0)};
 const [completion,context]=run('let calls=0;const a=[1];function rhs(){calls=calls+1;return 2;}a[key]=rhs();',{key});
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.calls).toMatchObject({value:0});
});
test('independent compaction review: kept negative zero retains its sign through an alias',()=>{
 prove(`const values=[flag?-1:-0,0];const alias=values;let write=0;
 for(let read=0;read<values.length;read++){if(values[read]>=0){values[write]=values[read];write=write+1;}}
 values.length=write;
 const proof=flag?alias.length===1&&1/alias[0]===Infinity:alias.length===2&&1/alias[0]===-Infinity&&1/alias[1]===Infinity;`);
});
test('independent compaction review: rejection mutation has a concrete failing result',()=>{
 prove(`const values=[-3,7];let write=0;
 for(let read=0;read<values.length;read++){if(values[read]>=0)values[write]=values[read];write=write+1;}
 values.length=write;
 const proof=values.length!==1&&values[0]!==7;`);
});
test('independent undefined comparison review: defined sibling keeps its distinct relational result',()=>{
 prove(`const value=flag?undefined:0;const compared=value<1;
 const proof=flag?compared===false:compared===true;`);
});
test('independent undefined comparison review: object coercion is not silently elided',()=>{
 expect(()=>run(`const object={valueOf:function(){throw 9;}};const result=undefined<object;`))
 .toThrow('Symbolic relational coercion for these operands is not yet supported');
});

import {compareNumbers,choiceOf,resolveBoolean,assume} from '../src/symbolic';
import {Knowledge} from '../src/symbolic/model';
function numericChoice(yes:TESNumber,no:TESNumber):TESNumber {
 return {...ESNumber(),expression:{kind:'select',condition:ESBoolean(),consequent:yes,alternate:no}};
}
test('independent finite comparison review: NaN alternatives never satisfy relational guards',()=>{
 for(const operator of ['<','<=','>','>=']) {
 const [completion,context]=run(`const number=flag?NaN:1;const matched=number ${operator} 2;
 const proof=flag?matched===false:matched===${operator==='<'||operator==='<='};`);
 expect(completion).toBe(Undefined);expect(context.value.scope.proof).toMatchObject({value:true});
 }
});
test('independent finite comparison review: shared conditions preserve infinities and signed zero',()=>{
 prove(`const a=flag?Infinity:-Infinity;const b=flag?0:-Infinity;
 let bad=false;if(a>b)bad=!flag;else bad=flag;
 const z=other?-0:0;const proof=!bad&&z<=0&&z>=0;`);
});
test('independent finite comparison review: an opaque alternative cannot become a concrete comparison proof',()=>{
 const flag=ESBoolean(),open=ESNumber();
 const left=selectValue(flag,open,ESNumber(0)) as TESNumber;
 const result=compareNumbers(left,ESNumber(1),'<');
 expect(resolveBoolean(result,[])).toBeUndefined();
 expect(resolveBoolean(result,assume([],flag,false))).toBe(true);
 expect(resolveBoolean(result,assume([],flag,true))).toBeUndefined();
});
test('independent finite comparison review: depth and node limits retain opaque results',()=>{
 let deep=ESNumber(0);for(let n=0;n<9;n++)deep=numericChoice(deep,ESNumber(2));
 function tree(depth:number):TESNumber{return depth===0?numericChoice(ESNumber(0),ESNumber(2)):numericChoice(tree(depth-1),tree(depth-1));}
 for(const value of [deep,tree(5)]) {
 const result=compareNumbers(value,ESNumber(1),'<');
 expect(result.value).toBeUndefined();expect(choiceOf(result)).toBeUndefined();
 expect(result.expression).toMatchObject({kind:'compare'});
 }
});
test('independent finite comparison review: excessive assumptions decline guarded expansion',()=>{
 const facts:Array<Knowledge[number]>=[];
 for(let i=0;i<257;i++)facts.push({kind:'truth',condition:ESBoolean(),truth:true});
 const result=compareNumbers(numericChoice(ESNumber(0),ESNumber(2)),ESNumber(1),'<',facts);
 expect(result.value).toBeUndefined();expect(choiceOf(result)).toBeUndefined();
});
test('independent finite comparison review: Cartesian expansion budget declines without a partial proof',()=>{
 function tree(depth:number):TESNumber{return depth===0?numericChoice(ESNumber(0),ESNumber(2)):numericChoice(tree(depth-1),tree(depth-1));}
 const result=compareNumbers(tree(3),tree(3),'<');
 expect(result.value).toBeUndefined();expect(choiceOf(result)).toBeUndefined();
 expect(result.expression).toMatchObject({kind:'compare'});
});

import {TESBoolean} from '../src/types';
import {strictEquality} from '../src/symbolic';
function booleanChoice(condition:TESBoolean,yes:TESBoolean,no:TESBoolean):TESBoolean {
 return {...ESBoolean(),expression:{kind:'select',condition,consequent:yes,alternate:no}};
}
test('independent complement review: nested decisions infer only exact complements',()=>{
 const a=ESBoolean(),b=ESBoolean(),other=ESBoolean();
 const condition=booleanChoice(a,booleanChoice(b,ESBoolean(true),ESBoolean(false)),ESBoolean(false));
 const inverse=booleanChoice(a,booleanChoice(b,ESBoolean(false),ESBoolean(true)),ESBoolean(true));
 const changed=booleanChoice(a,booleanChoice(other,ESBoolean(false),ESBoolean(true)),ESBoolean(true));
 const facts:Knowledge=[{kind:'truth',condition,truth:true}];
 expect(resolveBoolean(inverse,facts)).toBe(false);
 expect(resolveBoolean(changed,facts)).toBeUndefined();
 expect(resolveBoolean(inverse,[{kind:'truth',condition,truth:false}])).toBe(true);
});
test('independent complement review: near-complements cannot erase an unresolved leaf',()=>{
 const guard=ESBoolean(),leaf=ESBoolean();
 const a=booleanChoice(guard,ESBoolean(true),ESBoolean(false));
 const b=booleanChoice(guard,leaf,ESBoolean(true));
 expect(resolveBoolean(b,[{kind:'truth',condition:a,truth:true}])).toBeUndefined();
});
test('independent finite equality review: NaN and signed-zero strict equality retain JS semantics',()=>{
 const flag=ESBoolean();
 const a=selectValue(flag,ESNumber(NaN),ESNumber(-0)) as TESNumber;
 const b=selectValue(flag,ESNumber(NaN),ESNumber(0)) as TESNumber;
 const equality=strictEquality(a,b);
 expect(resolveBoolean(equality,assume([],flag,true))).toBe(false);
 expect(resolveBoolean(equality,assume([],flag,false))).toBe(true);
 expect(resolveBoolean(equality,[])).toBeUndefined();
});
test('independent strict-edge review: guarded order excludes NaN without a finite-input assumption',()=>{
 const [completion,context]=run(`let proof=true;
 if(a<=b&&a!==b&&b<=c)proof=a<c;`,{a:ESNumber(),b:ESNumber(),c:ESNumber()});
 expect(completion).toBe(Undefined);expect(context.value.scope.proof).toMatchObject({value:true});
});
test('independent strict-edge review: inequality alone leaves NaN and reverse order possible',()=>{
 const [completion,context]=run(`let conclusion=true;if(a!==b)conclusion=a<b;`,{a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);expect((context.value.scope.conclusion as TESBoolean).value).toBeUndefined();
});
test('independent complement review: excessive truth facts disable new complement inference',()=>{
 const guard=ESBoolean();
 const condition=booleanChoice(guard,ESBoolean(true),ESBoolean(false));
 const inverse=booleanChoice(guard,ESBoolean(false),ESBoolean(true));
 const facts:Array<Knowledge[number]>=[];
 for(let n=0;n<128;n++)facts.push({kind:'truth',condition:ESBoolean(),truth:true});
 facts.push({kind:'truth',condition,truth:true});
 expect(resolveBoolean(inverse,facts)).toBeUndefined();
});
test('independent complement review: oversized decision trees retain unknown rather than claiming complements',()=>{
 let a=ESBoolean(true),b=ESBoolean(false);
 for(let n=0;n<10;n++) {
  const guard=ESBoolean();
  a=booleanChoice(guard,a,ESBoolean(false));
  b=booleanChoice(guard,b,ESBoolean(true));
 }
 expect(resolveBoolean(b,[{kind:'truth',condition:a,truth:true}])).toBeUndefined();
});
test('independent selection-prior review: disjunctive numeric guards prove only their guarded consequences',()=>{
 const [completion,context]=run(`let proof=true;let unjustified=true;
 if(flag?a<0:b<0){proof=flag?a<1:b<1;unjustified=a<1;}`,
 {flag:ESBoolean(),a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);
 expect(context.value.scope.proof).toMatchObject({value:true});
 expect((context.value.scope.unjustified as TESBoolean).value).toBeUndefined();
});
test('independent selection-prior review: false disjunction preserves NaN alternatives',()=>{
 const [completion,context]=run(`let conclusion=true;if(!(flag?a<0:b<0))conclusion=flag?a>=0:b>=0;`,
 {flag:ESBoolean(),a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);
 expect((context.value.scope.conclusion as TESBoolean).value).toBeUndefined();
});
test('independent finite equality review: mixed primitive alternatives retain identity and type',()=>{
 prove(`const value=flag?undefined:1;const matched=value===1;
 let bad=false;if(matched)bad=flag;else bad=!flag;
 const proof=!bad&&(flag?value!==1:value!==undefined);`);
});
test('independent finite equality review: object alternatives compare identity without coercion',()=>{
 prove(`let calls=0;const a={valueOf:function(){calls=calls+1;throw 1;}};const b={};
 const value=flag?a:b;const matched=value===a;
 const proof=calls===0&&(flag?matched:!matched);`);
});
test('independent finite equality review: unresolved leaf equality remains unknown',()=>{
 const flag=ESBoolean(),x=ESNumber(),y=ESNumber();
 const value=selectValue(flag,x,Undefined);
 const result=strictEquality(value,y);
 expect(resolveBoolean(result,assume([],flag,true))).toBeUndefined();
 expect(resolveBoolean(result,assume([],flag,false))).toBe(false);
 expect(resolveBoolean(result,[])).toBeUndefined();
});
test('independent selection-prior review: impossible selected leaf cannot establish an unrelated fact',()=>{
 const [completion,context]=run(`let claim=true;if(flag?false:a<0)claim=b<0;`,
 {flag:ESBoolean(),a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);
 expect((context.value.scope.claim as TESBoolean).value).toBeUndefined();
});
test('independent symbolic numeric dispatch review: selected NaN possibility is not strengthened to total order',()=>{
 const [completion,context]=run(`const selected=flag?a:b;let theorem=true;
 if(selected!==0)theorem=selected<0||selected>0;`,
 {flag:ESBoolean(),a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);expect((context.value.scope.theorem as TESBoolean).value).toBeUndefined();
});
test('independent Boolean equality review: repeated symbolic comparison equals itself but different operands remain unknown',()=>{
 const [completion,context]=run(`const first=a<b;const repeated=a<b;const unrelated=a<c;
 const same=first===repeated;const different=first===unrelated;`,
 {a:ESNumber(),b:ESNumber(),c:ESNumber()});
 expect(completion).toBe(Undefined);expect(context.value.scope.same).toMatchObject({value:true});
 expect((context.value.scope.different as TESBoolean).value).toBeUndefined();
});
test('independent nested-guard review: selected condition retains all numeric alternatives',()=>{
 const [completion,context]=run(`const guard=flag?a<0:b<0;const index=guard?2:-1;
 let proof=true;let unjustified=true;
 if(index!==-1){proof=flag?a<1:b<1;unjustified=a<1;}`,
 {flag:ESBoolean(),a:ESNumber(),b:ESNumber()});
 expect(completion).toBe(Undefined);expect(context.value.scope.proof).toMatchObject({value:true});
 expect((context.value.scope.unjustified as TESBoolean).value).toBeUndefined();
});
