import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { evaluateCode, nodeInitialExecutionContext, isForkedCompletion,
  createFileSystemModel, fileSystemDirectory, fileSystemUnobservedFile } from "../src";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { resolveBoolean } from "../src/symbolic";
import { ESObject } from "../src/Object";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties, ownPropertyPresence, writeProperty } from "../src/execution-context/Heap";
import { mergeContexts } from "../src/execution-context/branches";
import { createConsoleModel } from "../src/node/console";
import { effectPaths } from "../src/effects";

// P012-R1 was disclosed by frozen independent review 5273aa2. These are writer
// correction regressions, not a new independent holdout or initial Stats model.
const root=join(__dirname,"..");
const logs=process.env.PROPHET_P012_CORRECTION_LOG_ROOT||join(root,"logs/p012/correction1/manual");
let sequence=0;
function native(body:string):any {
  const binary=process.env.PROPHET_NODE_BINARY||process.execPath;
  const source='if(process.version!=="v24.21.0")throw Error(process.version);const fs=require("fs");const stat=fs.statSync(process.argv[1]),alias=stat;'+body;
  const argv=['--no-global-search-paths','-e',source,join(root,'package.json')];
  const env={PATH:process.env.PATH||"",HOME:process.env.HOME||"",TMPDIR:process.env.TMPDIR||"",NODE_OPTIONS:"",NODE_PATH:""};
  const start=new Date().toISOString();
  const child=spawnSync(binary,argv,{cwd:root,env,encoding:"utf8",timeout:10000,maxBuffer:1024*1024});
  mkdirSync(logs,{recursive:true});writeFileSync(join(logs,"native-"+sequence+++".json"),JSON.stringify({binary,argv,cwd:root,env,start,end:new Date().toISOString(),status:child.status,signal:child.signal,error:child.error&&String(child.error),timeoutMs:10000,stdout:child.stdout,stderr:child.stderr},null,2));
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");return JSON.parse(child.stdout);
}
function setup(inputs:{[name:string]:Any}={}) {
  // An undeclared-size file keeps presence semantics on genuinely unknown
  // metadata; the bounded modeled size has its own focused spec.
  const model=createFileSystemModel({root:fileSystemDirectory({file:fileSystemUnobservedFile(),dir:fileSystemDirectory({})}),cwd:"/"});
  const [done,state]=evaluateCode('const stat=fs.statSync("/file");const alias=stat;const second=fs.statSync("/file");const dir=fs.statSync("/dir");',setVariablesInScope(nodeInitialExecutionContext,{fs:model.module,...inputs}));
  expect(done).toBe(Undefined);
  return {state,stat:state.value.scope.stat as any,second:state.value.scope.second as any,dir:state.value.scope.dir as any};
}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function histories(state:any,operations:string[],outcomes:string[]){
  const all=effectPaths(state.value.effects,state.value.knowledge);expect(all.length).toBeGreaterThan(0);
  for(const path of all){const events=path.events.filter(e=>e.call.operation.startsWith("fs."));expect(events.length).toBe(operations.length*2);for(let i=0;i<operations.length;i++){expect(events[i*2].kind).toBe("call");expect(events[i*2].call.operation).toBe(operations[i]);expect(events[i*2+1].kind).toBe(outcomes[i]);expect(events[i*2].call).toBe(events[i*2+1].call);}}
}
const initialOps=['fs.statSync','fs.statSync','fs.statSync'];
const cases:Array<[string,Any,string]>=[
  ['17',ESNumber(17),'answer===17'],['0',ESNumber(0),'answer===0&&1/answer===Infinity'],
  ['-0',ESNumber(-0),'answer===0&&1/answer===-Infinity'],['undefined',Undefined,'answer===undefined'],
  ['null',ESNull,'answer===null'],['true',ESBoolean(true),'answer===true'],
  ['"known"',ESString('known'),'answer==="known"'],['NaN',ESNumber(NaN),'answer!==answer'],
  ['Infinity',ESNumber(Infinity),'answer===Infinity']
];
for(const [literal,,proof]of cases)test('native own presence '+literal,()=>expect(native('stat.size='+literal+';const answer=stat.size;process.stdout.write(JSON.stringify(Object.hasOwn(stat,"size")&&('+proof+')));')).toBe(true));
for(const [literal,value,proof]of cases)test('VM provided own presence '+literal,()=>{
  const {state,stat}=setup();const seeded=writeProperty(stat,"size",value,state);
  const [done,after]=evaluateCode('const answer=stat.size;const valid='+proof+';',seeded);
  expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});
  expect(ownPropertyPresence(stat,"size",after)).toMatchObject({value:true});
  expect(getProperties(stat,state)).not.toHaveProperty('size');
  histories(after,initialOps,['return','return','return']);
});
for(const replacement of [false,true]) {
  const source='let mark=1;'+(replacement?'alias.size=23;':'')+'const answer=stat.size;';
  test('native disclosed R1 '+replacement,()=>expect(native('stat.size=17;'+source+'process.stdout.write(JSON.stringify({answer,mark,own:Object.hasOwn(stat,"size")}));')).toEqual({answer:replacement?23:17,mark:1,own:true}));
  test('VM disclosed R1 '+replacement,()=>{
    const {state,stat}=setup();const seeded=writeProperty(stat,'size',ESNumber(17),state);
    const [done,after]=evaluateCode(source,seeded);expect(done).toBe(Undefined);
    expect(after.value.scope.answer).toMatchObject({value:replacement?23:17});expect(after.value.scope.mark).toMatchObject({value:1});
    expect(getProperties(stat,after).size).toMatchObject({value:replacement?23:17});
    expect(getProperties(stat,seeded).size).toMatchObject({value:17});expect(getProperties(stat,state)).not.toHaveProperty('size');
    histories(after,initialOps,['return','return','return']);
  });
}
test('native conditional replacement and two instances',()=>expect(native('const second=fs.statSync(process.argv[1]);stat.size=17;second.size=29;function check(a){stat.size=17;if(a)alias.size=23;return stat.size===(a?23:17)&&second.size===29;}process.stdout.write(JSON.stringify(check(false)&&check(true)));')).toBe(true));
test('current aliases, finite choices, snapshots and two instances',()=>{
  const {state,stat,second}=setup({a:ESBoolean()});const seeded=writeProperty(second,'size',ESNumber(29),writeProperty(stat,'size',ESNumber(17),state));
  const [done,after]=evaluateCode('if(a)alias.size=23;const answer=stat.size;const valid=(a?answer===23:answer===17)&&second.size===29&&alias===stat&&second!==stat;const unknown=answer===23;',seeded);
  expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
  const [old,before]=evaluateCode('const valid=alias.size===17&&second.size===29;',seeded);expect(old).toBe(Undefined);expect(before.value.scope.valid).toMatchObject({value:true});
  histories(after,initialOps,['return','return','return']);
});
test('known object/function identities and open assigned value are not narrowed',()=>{
  expect(native('const provided={n:7};stat.size=provided;const object=stat.size===provided&&stat.size.n===7;stat.size=function(){return this===stat?31:0;};process.stdout.write(JSON.stringify(object&&alias.size()===31));')).toBe(true);
  const {state,stat}=setup({provided:ESObject({n:ESNumber(7)})});
  const seeded=writeProperty(stat,'size',state.value.scope.provided,state);
  const [done,after]=evaluateCode('const object=stat.size===provided&&stat.size.n===7;alias.size=function(){return this===stat?31:0;};const valid=object&&stat.size()===31;',seeded);
  expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});
  const open=writeProperty(stat,'size',ESNumber(),state);const [normal,last]=evaluateCode('const n=stat.size;const unknown=n===17;',open);
  expect(normal).toBe(Undefined);expect((last.value.scope.n as any).value).toBeUndefined();expect((last.value.scope.unknown as any).value).toBeUndefined();
});
for(const reverse of [false,true])test('conditional own presence preserves known and genuinely unknown paths '+reverse,()=>{
  const selected=ESBoolean();const {state,stat}=setup({selected});const seeded=writeProperty(stat,'size',Undefined,state);
  const joined=mergeContexts(selected,state,reverse?state:seeded,reverse?seeded:state);
  let reads=0;const initial=ExecutionContext({...joined.value,validateRead(object:Any,name:string){if(object===stat&&name==='size')reads++;}});
  const all=leaves(evaluateCode('let mark=1,caught=false,cleaned=false;try{const n=alias.size;mark=2;}catch(e){caught=true;}finally{cleaned=true;}',initial));
  expect(reads).toBe(1);expect(all).toHaveLength(2);
  const stop=all.find(([v])=>v.type==='ExecutionBoundary'),normal=all.find(([v])=>v===Undefined);
  expect(stop[0]).toMatchObject({kind:'unsupported',message:"Unmodeled host property 'size': Node Stats fields"});
  expect(stop[1].value.scope.mark).toMatchObject({value:1});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});
  expect(normal[1].value.scope.mark).toMatchObject({value:2});expect(normal[1].value.scope.caught).toMatchObject({value:false});expect(normal[1].value.scope.cleaned).toMatchObject({value:true});
  histories(stop[1],initialOps,['return','return','return']);histories(normal[1],initialOps,['return','return','return']);
});
for(const reverse of [false,true])test('selected seeded/fresh objects retain prefixes, caller/prototype/console and guest failures '+reverse,()=>{
  const console=createConsoleModel();const {state,stat}=setup({a:ESBoolean(),b:ESBoolean(),c:ESBoolean(),console:console.module});
  const seeded=writeProperty(stat,'size',ESNumber(17),state);
  const source=`let trace="",caught=false,cleaned=false;const box={n:0},shared=box;function C(){}C.prototype.n=0;
    function read(){trace="p";shared.n=8;C.prototype.n=9;console.log("p");if(b)fs.statSync("/missing");if(c)return "x".indexOf;const current=${reverse?'!a':'a'}?stat:second;return current.size;}
    try{const answer=read();trace=trace+answer;}catch(e){caught=e.code;}finally{cleaned=true;console.log("f");}`;
  const all=leaves(evaluateCode(source,seeded));expect(all.some(([v])=>v.type==='ExecutionBoundary')).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
  for(const [value,after]of all){const stop=value.type==='ExecutionBoundary';
    if(stop){const proof=value.message.includes('Node Stats fields')?`${reverse?'a':'!a'}&&!b&&!c`:'!b&&c';const [checked,current]=evaluateCode('const valid='+proof+';',after);expect(checked).toBe(Undefined);expect(resolveBoolean(current.value.scope.valid as any,current.value.knowledge)).toBe(true);expect(value.message).toMatch(/Node Stats fields|String.prototype.indexOf/);expect(after.value.scope.trace).toMatchObject({value:'p'});expect(after.value.scope.caught).toMatchObject({value:false});}
    else {const [done,last]=evaluateCode('const valid=b?caught==="ENOENT"&&trace==="p":!caught&&trace==="p17";',after);expect(done).toBe(Undefined);expect(last.value.scope.valid).toMatchObject({value:true});}
    expect(after.value.scope.cleaned).toMatchObject({value:!stop});expect(console.inspectOutput(after).every(p=>p.chunks.map(x=>x.value).join('')===(stop?'p\n':'p\nf\n'))).toBe(true);
    const [done,last]=evaluateCode('const valid=box.n===8&&shared===box&&(new C()).n===9;',after);expect(done).toBe(Undefined);expect(last.value.scope.valid).toMatchObject({value:true});
    for(const path of effectPaths(after.value.effects,after.value.knowledge)){const fs=path.events.filter(e=>e.call.operation==='fs.statSync');expect(fs.length===6||fs.length===8).toBe(true);for(let i=0;i<fs.length;i+=2){expect(fs[i].kind).toBe('call');expect(fs[i+1].kind).toBe(i===6?'throw':'return');expect(fs[i].call).toBe(fs[i+1].call);}}
  }
});
test('inherited size never substitutes for unknown own metadata; fresh writes remain legacy',()=>{
  expect(native('const actual=stat.size;Object.prototype.size=actual+1;process.stdout.write(JSON.stringify(Object.hasOwn(stat,"size")&&stat.size===actual));')).toBe(true);
  const {state,stat}=setup();const seeded=writeProperty(stat,'size',ESNumber(17),state);
  const [done,after]=evaluateCode('Object.prototype.size=99;let mark=1;const known=stat.size;second.size;',seeded);
  expect(done).toMatchObject({type:'ExecutionBoundary',message:"Unmodeled host property 'size': Node Stats fields"});expect(after.value.scope.known).toMatchObject({value:17});expect(after.value.scope.mark).toMatchObject({value:1});
  // Fresh writes now stop as the same retained typed boundary as fresh reads.
  const [writeStop,writeAfter]=evaluateCode('let mark=1;second.size=23;',seeded);
  expect(writeStop).toMatchObject({type:'ExecutionBoundary',kind:'unsupported',message:expect.stringMatching(/Unmodeled host property.*'size'/)});
  expect(writeAfter.value.scope.mark).toMatchObject({value:1});
  const [old,before]=evaluateCode('let mark=1;stat.size;',state);expect(old).toMatchObject({type:'ExecutionBoundary'});expect(before.value.scope.mark).toMatchObject({value:1});
});

// Supplied legacy method representations keep the ordinary reader's stable identity.
test("provided legacy method keeps callability and repeated read identity",()=>{
  expect(native('stat.size=function(){return 31;};process.stdout.write(JSON.stringify(stat.size===alias.size&&stat.size()===31));')).toBe(true);
  const {state,stat}=setup();
  const legacy={implementation:function*(_self:Any,_args:Any[],context:any){return [ESNumber(31),context] as [Any,any];}};
  const seeded=writeProperty(stat,'size',legacy,state);
  const [done,after]=evaluateCode('const first=stat.size;const last=alias.size;const valid=first===last&&stat.size()===31;',seeded);
  expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});
});
