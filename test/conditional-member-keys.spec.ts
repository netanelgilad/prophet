import {execFileSync} from 'child_process';
import {evaluateCode,nodeInitialExecutionContext,hasExecutionBoundary} from '../src';
import {setVariablesInScope} from '../src/execution-context/ExecutionContext';
import {ESBoolean} from '../src/boolean/ESBoolean';
import {Any,ESNumber,Undefined} from '../src/types';
import {Array as ESArray} from '../src/array/Array';
import {assertPinnedNode} from './commonjs/oracle';
beforeAll(assertPinnedNode);
function run(source:string,inputs:{[name:string]:Any}={flag:ESBoolean()}) {
 return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));
}
function proof(source:string) {
 const [completion,context]=run(source);
 expect(completion).toBe(Undefined);
 expect(context.value.scope.proof).toMatchObject({value:true});
}
test('conditional numeric and string keys retain reads and writes through aliases',()=>{
 proof(`const a=[10,20]; const alias=a; const key=flag?0:1;
 a[key]=7; const proof=alias[key]===7 && (flag ? a[1]===20 : a[0]===10);`);
 proof(`const a={left:10,right:20}; const key=flag?'left':'right';
 a[key]=7; const proof=a[key]===7 && (flag ? a.right===20 : a.left===10);`);
});
test('evaluated receiver and key precede RHS and retain assignment reference',()=>{
 proof(`let trace=''; const first=[1,2]; const second=[3,4]; let target=first;
 function object(){trace=trace+'o';return target;}
 function key(){trace=trace+'k';return flag?0:1;}
 function rhs(){trace=trace+'r';target=second;return 9;}
 const assigned=object()[key()]=rhs();
 const proof=trace==='okr' && assigned===9 && target===second &&
 second[0]===3 && second[1]===4 && (flag?first[0]===9:first[1]===9);`);
});
test('conditional lengths truncate the shared receiver and return assigned value',()=>{
 proof(`const a=[10,20,30];const alias=a;const n=flag?1:2;
 const assigned=(a.length=n); const proof=assigned===n && alias.length===n &&
 alias[0]===10 && alias[2]===undefined && (flag?alias[1]===undefined:alias[1]===20);`);
});
test('computed method calls preserve receiver and key effects',()=>{
 proof(`let calls=0;const obj={n:7,a:function(){return this.n;},b:function(){return this.n+1;}};
 function key(){calls=calls+1;return flag?'a':'b';}
 const answer=obj[key()]();const proof=calls===1 && (flag?answer===7:answer===8);`);
});
test('opaque numeric keys still reject instead of guessing a finite choice',()=>{
 expect(()=>run('const a=[1,2];const result=a[index];',{index:ESNumber()})).toThrow('Computed property access requires a concrete number or string');
});
test('Node checks exact source evaluation order for both key branches',()=>{
 for(const flag of [true,false]) {
 const source=`const flag=${flag};let trace='';let target=[1,2];const original=target;
 function object(){trace+='o';return target;}function key(){trace+='k';return flag?0:1;}
 function rhs(){trace+='r';target=[3,4];return 9;}const result=object()[key()]=rhs();
 console.log(JSON.stringify([trace,result,original,target]));`;
 expect(JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source],{encoding:'utf8'})))
 .toEqual(['okr',9,flag?[9,2]:[1,9],[3,4]]);
 }
});

test('nested keys preserve correlated guards rather than crossing branches',()=>{
 const [completion,context]=run(`const a=[11,22,33];const key=flag?(other?0:1):2;
 a[key]=99;const proof=a[key]===99 && (flag?(other?a[1]===22:a[0]===11):a[0]===11);`,{flag:ESBoolean(),other:ESBoolean()});
 expect(completion).toBe(Undefined);expect(context.value.scope.proof).toMatchObject({value:true});
});

test('a throwing key skips RHS and preserves the earlier receiver effect',()=>{
 proof(`let trace='';const a=[1,2];function object(){trace=trace+'o';return a;}
 function key(){trace=trace+'k';if(flag)throw 42;return 1;}
 function rhs(){trace=trace+'r';return 9;}
 let caught=false;try{object()[key()]=rhs();}catch(e){caught=e===42;}
 const proof=flag?(trace==='ok' && caught && a[1]===2):(trace==='okr' && !caught && a[1]===9);`);
});

test('mixed-length heap supports a later array mutation',()=>{
 proof(`const a=[1,2];a.length=flag?0:1;a[0]=7;const proof=a.length===1 && a[0]===7 && a[1]===undefined;`);
});

function choice(yes:Any,no:Any):Any {
 return {...ESNumber(),expression:{kind:'select',condition:ESBoolean(),consequent:yes,alternate:no}} as Any;
}
test('dispatch preflight rejects excessive depth before invoking RHS',()=>{
 let key:Any=ESNumber(0);for(let i=0;i<18;i++)key=choice(key,ESNumber(1));
 const [completion,context]=run('let rhs=0;const a=[1,2];a[key]=(rhs=1);',{key});
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.rhs).toMatchObject({value:0});
});
test('dispatch preflight caps total expanded tree work independently of depth',()=>{
 function tree(depth:number):Any{return depth===0?ESNumber(0):choice(tree(depth-1),tree(depth-1));}
 const [completion,context]=run('let rhs=0;const a=[1];a[key]=(rhs=1);',{key:tree(8)});
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.rhs).toMatchObject({value:0});
});
test('cyclic choices fail boundedly before user continuation',()=>{
 const key=choice(ESNumber(0),ESNumber(1));(key as any).expression.consequent=key;
 const [completion,context]=run('let rhs=0;const a=[1,2];a[key]=(rhs=1);',{key});
 expect(hasExecutionBoundary(completion)).toBe(true);
 expect(context.value.scope.rhs).toMatchObject({value:0});
});
test('unsupported key and length leaves cannot be silently discarded',()=>{
 expect(()=>run('const a=[1,2];a[flag?0:true]=9;')).toThrow('Computed property access requires a concrete number or string');
 expect(()=>run('const a=[1,2];a.length=flag?0:-1;')).toThrow('Array length requires a concrete valid length');
});
test('unknown and segmented arrays retain their missing-position boundary',()=>{
 expect(()=>run('const result=input[0];',{input:ESArray()})).toThrow('Indexed reads require known element positions');
 expect(()=>run('const result=input[0];',{input:ESArray([ESArray([ESNumber(1)])],'segments')})).toThrow('Indexed reads require known element positions');
});
