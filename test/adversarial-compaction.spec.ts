import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber, TESNumber, TESBoolean, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";
beforeAll(assertPinnedNode);
const compact=`function compact(values) {
  let write=0;
  for(let read=0;read<values.length;read++) {
    if(values[read]>=0) { values[write]=values[read]; write=write+1; }
  }
  values.length=write;
  return values;
}`;
function finite() { const n=ESNumber();n.knowledge=[{kind:'finite',subject:n}];return n; }
function scenario(length:number, source=compact) {
  const names=Array.from({length},(_,i)=>'x'+i);
  const inputs:{[key:string]:TESNumber}={};names.forEach(name=>inputs[name]=finite());
  // Enumerate specifications of the output, not concrete input values. Each
  // implication covers an entire sign region of independently symbolic Numbers.
  const properties=[];
  for(let mask=0;mask<(1<<length);mask++) {
    const kept=names.filter((_,i)=>(mask&(1<<i))!==0);
    const guard=names.map((name,i)=>`${name}${mask&(1<<i)?'>=':'<'}0`).join('&&')||'true';
    const checks=[`alias.length===${kept.length}`,...kept.map((name,i)=>`alias[${i}]===${name}`),`alias[${kept.length}]===undefined`];
    properties.push(`(${guard}?(${checks.join('&&')}):true)`);
  }
  const code=`${source}
    const values=[${names.join(',')}]; const alias=values; const snapshot=values.slice(0);
    const returned=compact(values);
    const violation=!(returned===alias && ${properties.join('&&')});
    const snapshotViolation=!(${names.map((name,i)=>`snapshot[${i}]===${name}`).join('&&')||'true'});
    const first=alias[0];`;
  return {code,inputs};
}
for(let n=0;n<=4;n++) test(`compaction preserves exact survivors and order for ${n} symbolic values`,()=>{
  const {code,inputs}=scenario(n);
  const [completion,context]=evaluateCode(code,setVariablesInScope(nodeInitialExecutionContext,inputs));
  expect(completion).toBe(Undefined);
  expect(context.value.uncaught).toBeUndefined();
  expect(context.value.scope.violation).toMatchObject({value:false});
  expect(context.value.scope.snapshotViolation).toMatchObject({value:false});
  for(const name of Object.keys(inputs)) expect((context.value.scope[name] as TESNumber).value).toBeUndefined();
});
const skipped=compact.replace('write=write+1; }','write=write+1; } else { write=write+1; }');
const duplicate=compact.replace('values[write]=values[read]','values[write]=values[0]');
for(const [name,source] of [['advance on rejection',skipped],['duplicate first',duplicate]])
 test(`${name} must not receive stable-filter proof`,()=>{
  const {code,inputs}=scenario(3,source);
  const [completion,context]=evaluateCode(code,setVariablesInScope(nodeInitialExecutionContext,inputs));
  expect(completion).toBe(Undefined);
  expect((context.value.scope.violation as TESBoolean).value).toBeUndefined();
 });
test('pinned Node independently verifies aliases snapshots signed zeros and broken witnesses',()=>{
  const source=compact+skipped.replace('function compact','function skipped')+duplicate.replace('function compact','function duplicate');
  const output=execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,['-e',source+`
    const cases=[[],[-1,-2],[1,2],[-1,2,-3,4],[-0,0,-1,Number.MAX_VALUE],[2,2,-1,2]];
    const checks=cases.map(input=>{const original=input.slice(),alias=input;
      const returned=compact(input),expected=original.filter(x=>x>=0);
      return returned===alias && input.length===expected.length && input.every((x,i)=>Object.is(x,expected[i]));});
    function bad(fn,input){const expected=input.filter(x=>x>=0);fn(input);
      return input.length!==expected.length || input.some((x,i)=>!Object.is(x,expected[i]));}
    console.log(JSON.stringify([checks,bad(skipped,[-1,2]),bad(skipped,[1,2]),bad(duplicate,[-1,2]),bad(duplicate,[2,2])]));`
  ],{encoding:'utf8'});
  expect(JSON.parse(output)).toEqual([[true,true,true,true,true,true],true,false,true,false]);
});
