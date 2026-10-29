import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { Any, Undefined } from '../src/types';
import { assertPinnedNode } from './commonjs/oracle';
beforeAll(assertPinnedNode);
function run(source:string, inputs:{[name:string]:Any}={flag:ESBoolean(),other:ESBoolean()}) {
 return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));
}
function proof(source:string) {
 const [completion,context]=run(source);
 expect(completion).toBe(Undefined);
 expect(context.value.scope.proof).toMatchObject({value:true});
}
const cases=[
 `const a=[10,20,30];const alias=a;a.length=flag?0:2;const assigned=(a[0]=7);
 const proof=alias===a && assigned===7 && a[0]===7 &&
 (flag?a.length===1 && a[1]===undefined:a.length===2 && a[1]===20);`,
 `const a=[10,20,30];a.length=flag?1:3;a[2]=9;
 const proof=a.length===3 && a[0]===10 && a[2]===9 &&
 (flag?!Object.prototype.hasOwnProperty.call(a,1):a[1]===20);`,
 `const a=[10,20,30];a.extra=99;a.length=flag?1:3;a.length=2;
 const proof=a.length===2 && a.extra===99 && a[2]===undefined &&
 (flag?!Object.prototype.hasOwnProperty.call(a,1):a[1]===20);`,
 `const a=[10,20,30];a.length=flag?1:3;a[other?0:2]=7;a.length=other?1:3;
 const proof=other?a.length===1 && a[0]===7 && a[2]===undefined:
 a.length===3 && a[0]===10 && a[2]===7;`,
 `const a=[10,20,30];a.length=flag?0:2;a.length=4;
 const proof=a.length===4 && !Object.prototype.hasOwnProperty.call(a,3) &&
 (flag?a[0]===undefined:a[0]===10 && a[1]===20);`,
 `const a=[1,2,3];a.length=flag?1:3;a[0]=8;a.length=0;a[1]=9;
 const proof=a.length===2 && a[0]===undefined && a[1]===9 && a[2]===undefined;`
];
for(let i=0;i<cases.length;i++)test('persistent joined-array mutation contract '+i,()=>proof(cases[i]));
test('all declared branch assignments agree with pinned Node',()=>{
 for(const source of cases)for(const flag of [false,true])for(const other of [false,true]){
 const result=execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',
 `const flag=${flag},other=${other};${source};process.stdout.write(String(proof));`],
 {encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
 expect(result).toBe('true');
 }
});
test('writing one element leaves unrelated selected values unknown',()=>{
 const [completion,context]=run('const a=[1,2];a.length=flag?0:2;a[0]=7;const unknown=a[1]===2;');
 expect(completion).toBe(Undefined);expect(context.value.scope.unknown).toMatchObject({value:undefined});
});
