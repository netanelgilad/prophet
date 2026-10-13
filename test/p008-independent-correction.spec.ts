import { spawnSync } from "child_process";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { Any, Undefined } from "../src/types";
import { getStringPrototype } from "../src/string/String";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { encodeGraph } from "../src/cli/graph";

// Correction review for worker 06eefd516e65bbc5d02b6bf94ddbed383f59c8d7.
// The original 26 probes remain byte-for-byte unchanged in their original spec.
function native(body: string, input: any = null): any {
  const child=spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", 'if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(process.argv[1]);'+body,JSON.stringify(input)],
    {cwd:join(__dirname,".."),encoding:"utf8",timeout:15000,maxBuffer:4*1024*1024,
      env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}
function nativeAnswer(source:string) {
  return native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',source);
}
function run(source:string,inputs:{[key:string]:Any}={}) {
  return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));
}
function leaves(value:any,context?:any):any[] {
  return isForkedCompletion(value) ? leaves(value.consequent[0],value.consequent[1]).concat(leaves(value.alternate[0],value.alternate[1])) : [[value,context]];
}

test("native-discovered prototype own names guard every unmodeled read and own presence",()=>{
  const names:string[]=native('process.stdout.write(JSON.stringify(Object.getOwnPropertyNames(String.prototype).sort()));');
  const supported=["length","constructor","concat","slice","toString","trim","toLowerCase","valueOf"];
  expect(names).toHaveLength(52);
  // P009 supersedes only lowercase's old deferred checkpoint. Keep the native
  // name discovery and every residual guard; assert its actual supported result.
  const lowercase='const answer=typeof String.prototype.toLowerCase === "function" && Object.prototype.hasOwnProperty.call(String.prototype,"toLowerCase") && String.prototype.toLowerCase.call("ABC") === "abc";';
  expect(nativeAnswer(lowercase)).toBe(true);
  const [completed,lowered]=run(lowercase);
  expect(completed).toBe(Undefined);
  expect(lowered.value.scope.answer).toMatchObject({value:true});
  for(const name of names.filter(n=>!supported.includes(n))) {
    for(const expression of ['String.prototype['+JSON.stringify(name)+']','Object.prototype.hasOwnProperty.call(String.prototype,'+JSON.stringify(name)+')']) {
      const [completion,after]=run('let trace="prefix";const answer='+expression+';trace="wrong";');
      expect(completion).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
      expect(after.value.scope.trace).toMatchObject({value:"prefix"});
    }
  }
});

for(const field of ["caller","arguments"]) for(const write of [false,true]) for(const reverse of [false,true]) {
  test('restricted alias '+field+' '+(write?'write':'read')+' order '+reverse,()=>{
    const operation=write ? 't.'+field+'=(trace=trace+"rhs");' : 'const read=t.'+field+';';
    const source='let trace="";let caught=false;const t=String.prototype.trim;try{if('+ (reverse?'!flag':'flag') +'){trace="prefix";'+operation+'trace="wrong";}else trace="sibling";}catch(e){caught=e instanceof TypeError;}finally{trace=trace+"!";}';
    for(const flag of [false,true]) {
      const expected=nativeAnswer('const flag='+flag+';'+source+'const answer={trace,caught};');
      expect(expected).toEqual(flag!==reverse ? {trace:write?'prefixrhs!':'prefix!',caught:true} : {trace:'sibling!',caught:false});
    }
    const [completion,context]=run(source,{flag:ESBoolean()});
    const paths=leaves(completion,context);expect(paths).toHaveLength(2);
    const stopped=paths.find(p=>p[0].type==='ExecutionBoundary');const normal=paths.find(p=>p[0]===Undefined);
    expect(stopped[0]).toMatchObject({kind:'unsupported'});
    expect(stopped[1].value.scope.trace).toMatchObject({value:write?'prefixrhs':'prefix'});
    expect(stopped[1].value.scope.caught).toMatchObject({value:false});
    expect(normal[1].value.scope.trace).toMatchObject({value:'sibling!'});
  });
}

const precisePrograms=[
  'const own=Object.prototype.hasOwnProperty;const o={};let n=0;const key={toString(){n=n+1;o.trimEnd=undefined;return "trimEnd";}};const answer=own.call(o,key) && n===1 && o.trimEnd===undefined && !own.call({},"trimEnd");',
  'const own=Object.prototype.hasOwnProperty;const p=String.prototype;const key={toString(){p.padStart=undefined;return "padStart";}};const answer=own.call(p,key) && p.padStart===undefined;',
  'const p=String.prototype;const alias=p;p.trimEnd=function(){"use strict";return "replaced";};const s=" value ";const answer=alias.trimEnd===p.trimEnd && s.trimEnd()==="replaced" && s.trim()==="value";',
  'const own=Object.prototype.hasOwnProperty;Object.prototype.reviewCustom=19;const p=String.prototype;const answer=p.reviewCustom===19 && !own.call(p,"reviewCustom") && !own.call({},"trimEnd") && ({}).trimEnd===undefined && own.call(p,"trim") && own.call(p,"length") && p.constructor===String;',
  'const t=String.prototype.trim;const own=Object.prototype.hasOwnProperty;const answer=own.call(t,"name") && own.call(t,"length") && !own.call(t,"call") && !own.call(t,"prototype") && t.name==="trim" && t.length===0 && t.call(" x ")==="x";',
  'const t=String.prototype.trim;const oldCall=t.call;t.call=function(){return "replacement";};t.prototype={test:1};const answer=t.call()==="replacement" && oldCall.call(t," x ")==="x" && t.prototype.test===1;'
];
precisePrograms.forEach((source,i)=>test('native-backed precise surface '+i,()=>{
  expect(nativeAnswer(source)).toBe(true);const [completion,after]=run(source);
  expect(completion).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});
}));

test("ordinary conditional own presence retains correlation and mandatory unknown",()=>{
  const source='const own=Object.prototype.hasOwnProperty;const o={};if(flag)o.padStart=undefined;const present=own.call(o,"padStart");const proof=flag ? present : !present;const unknown=present;const absent=own.call(o,"trimEnd");';
  for(const flag of [false,true]) expect(nativeAnswer('const flag='+flag+';'+source+'const answer=proof && !absent;')).toBe(true);
  const [completion,after]=run(source,{flag:ESBoolean()});expect(completion).toBe(Undefined);
  expect(after.value.scope.proof).toMatchObject({value:true});expect(after.value.scope.absent).toMatchObject({value:false});
  expect((after.value.scope.unknown as any).value).toBeUndefined();
});

for(const explicitUndefined of [false,true]) test('conditional alias replacement keeps installed path and original snapshot '+explicitUndefined,()=>{
  const [first,before]=run('const p=String.prototype;const alias=p;',{flag:ESBoolean()});expect(first).toBe(Undefined);
  const source='if(flag)alias.trimEnd='+ (explicitUndefined?'undefined':'function(){"use strict";return "custom";}') +';let trace="prefix";const own=Object.prototype.hasOwnProperty.call(p,"trimEnd");const answer='+ (explicitUndefined?'p.trimEnd===undefined':'"x".trimEnd()==="custom"') +';trace="done";';
  const [completion,after]=evaluateCode(source,before);const paths=leaves(completion,after);expect(paths).toHaveLength(2);
  const normal=paths.find(p=>p[0]===Undefined);const stopped=paths.find(p=>p[0].type==='ExecutionBoundary');
  expect(normal[1].value.scope.own).toMatchObject({value:true});expect(normal[1].value.scope.answer).toMatchObject({value:true});
  expect(stopped[1].value.scope.trace).toMatchObject({value:'prefix'});
  const [snapshot]=evaluateCode('const original=alias.trimEnd;',before);expect(snapshot).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
  const [fresh]=run('const original=String.prototype.trimEnd;');expect(fresh).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
});

test("deferred intrinsic blocks inherited fallback while ordinary objects retain it",()=>{
  const source='Object.prototype.padStart=function(){"use strict";return "fallback";};let trace="prefix";const result="x".padStart();trace="wrong";';
  expect(nativeAnswer(source+'const answer=result;')).toBe('x');
  const [completion,after]=run(source);expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
  expect(after.value.scope.trace).toMatchObject({value:'prefix'});
  const [ordinary,done]=run('Object.prototype.padStart=function(){return "fallback";};const answer=({}).padStart();');
  expect(ordinary).toBe(Undefined);expect(done.value.scope.answer).toMatchObject({value:'fallback'});
});

for(const operation of ['Object.keys(String.prototype);','Object.keys(String.prototype.trim);','const copy={...String.prototype};','const copy={...String.prototype.trim};']) {
  test('typed own inspection preserves a guest throw sibling '+operation,()=>{
    const [completion,after]=run('let trace="";if(flag){trace="prefix";'+operation+'trace="wrong";}else{trace="guest";throw "guest";}',{flag:ESBoolean()});
    const paths=leaves(completion,after);expect(paths).toHaveLength(2);
    expect(paths.find(p=>p[0].type==='ExecutionBoundary')[1].value.scope.trace).toMatchObject({value:'prefix'});
    expect(paths.find(p=>p[0].type==='ThrownValue')[1].value.scope.trace).toMatchObject({value:'guest'});
  });
}

test("private deferred-name registry is not a public graph field",()=>{
  const graph=encodeGraph({prototype:getStringPrototype()});const serialized=JSON.stringify(graph);
  expect(Object.keys(graph).sort()).toEqual(['nodes','roots']);
  for(const word of ['partialIntrinsics','deferredPrototypeNames','trimEnd','padStart']) expect(serialized.includes(word)).toBe(false);
  expect(serialized.includes('unmodeledOwnAbsence')).toBe(false);
});

test("unknown extra trim metadata now stops conservatively after RHS effects",()=>{
  const source='const t=String.prototype.trim;let trace="";function rhs(){trace="rhs";return 17;}if(flag){t.extra=rhs();trace="wrong";}else trace="sibling";';
  expect(nativeAnswer('const flag=true;'+source+'const answer=t.extra;')).toBe(17);
  const [completion,after]=run(source,{flag:ESBoolean()});const paths=leaves(completion,after);
  const stopped=paths.find(p=>p[0].type==='ExecutionBoundary');expect(stopped).toBeDefined();expect(stopped[1].value.scope.trace).toMatchObject({value:'rhs'});
  expect(paths.find(p=>p[0]===Undefined)[1].value.scope.trace).toMatchObject({value:'sibling'});
});

test("reviewer sequence-expression false alarm stops before RHS effects",()=>{
  const [completion,after]=run('let trace="";String.prototype.trim.extra=(trace="rhs",17);');
  expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported',message:"Can't resolve type of ast type SequenceExpression"});
  expect(after.value.scope.trace).toMatchObject({value:''});
});

test("conditional receiver and converted key preserve closed-object absence",()=>{
  const source='let trace="";const receiver=flag ? String.prototype : {};const key={toString(){trace="key";return "padStart";}};const present=Object.prototype.hasOwnProperty.call(receiver,key);trace=trace+"done";';
  for(const flag of [false,true]) expect(nativeAnswer('const flag='+flag+';'+source+'const answer=present;')).toBe(flag);
  const [completion,after]=run(source,{flag:ESBoolean()});const paths=leaves(completion,after);
  expect(paths).toHaveLength(2);
  const stopped=paths.find(p=>p[0].type==='ExecutionBoundary');expect(stopped[1].value.scope.trace).toMatchObject({value:'key'});
  const normal=paths.find(p=>p[0]===Undefined);expect(normal[1].value.scope.present).toMatchObject({value:false});
  expect(normal[1].value.scope.trace).toMatchObject({value:'keydone'});
});
