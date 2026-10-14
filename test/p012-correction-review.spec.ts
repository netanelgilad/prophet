import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { copySync } from "fs-extra";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext, createFileSystemModel, fileSystemDirectory, fileSystemUnobservedFile } from "../src";
import { Any, ESNumber, Undefined, isThrownValue, WithProperties } from "../src/types";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ESObject } from "../src/Object";
import { ExecutionContext, setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { writeProperty, getProperties } from "../src/execution-context/Heap";
import { mergeContexts } from "../src/execution-context/branches";
import { resolveBoolean } from "../src/symbolic";
import { createConsoleModel } from "../src/node/console";
import { effectPaths } from "../src/effects";
import { isESFunction } from "../src/Function/Function";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { runFile } from "../src/cli/runtime";

// New correction holdouts for b582e2c746863d4c02697bdd28db461098aee226.
// Original 29 probes and writer 30 regression probes remain unchanged/disclosed.
const root=join(__dirname,"..");
const logs=process.env.PROPHET_P012_CORRECTION_REVIEW_LOG_ROOT||join(root,"logs/p012-correction-independent/manual-"+Date.now());
let sequence=0;
function save(name:string,value:any){mkdirSync(logs,{recursive:true});writeFileSync(join(logs,name),JSON.stringify(value,null,2));}
function native(source:string){
 const binary=process.env.PROPHET_NODE_BINARY||process.execPath;
 const argv=['--no-global-search-paths','-e','if(process.version!=="v24.21.0")throw Error(process.version);const fs=require("fs"),stat=fs.statSync(process.argv[1]),alias=stat,second=fs.statSync(process.argv[1]);'+source+';process.stdout.write(JSON.stringify(answer));',join(root,'package.json')];
 const env={PATH:process.env.PATH||'',HOME:process.env.HOME||'',TMPDIR:process.env.TMPDIR||'',NODE_OPTIONS:'',NODE_PATH:''};
 const start=new Date().toISOString();const child=spawnSync(binary,argv,{cwd:root,env,encoding:'utf8',timeout:20000,maxBuffer:1024*1024});
 save('native-'+sequence+++'.json',{binary,argv,cwd:root,env,start,end:new Date().toISOString(),capMs:20000,status:child.status,signal:child.signal,error:child.error&&String(child.error),stdout:child.stdout,stderr:child.stderr});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');expect(JSON.parse(child.stdout)).toBe(true);
}
function setup(inputs:{[name:string]:Any}={}){
 // Undeclared-size file: presence/admission guards stay on unknown metadata.
 const model=createFileSystemModel({root:fileSystemDirectory({file:fileSystemUnobservedFile(),dir:fileSystemDirectory({})}),cwd:'/'});
 const[d,state]=evaluateCode('const stat=fs.statSync("/file"),alias=stat,second=fs.statSync("/file");const plain={};',setVariablesInScope(nodeInitialExecutionContext,{fs:model.module,...inputs}));expect(d).toBe(Undefined);
 return {state,stat:state.value.scope.stat as any,second:state.value.scope.second as any,plain:state.value.scope.plain as any};
}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function proof(source:string,state:any){const[d,s]=evaluateCode('const valid='+source+';',state);expect(d).toBe(Undefined);expect(resolveBoolean(s.value.scope.valid as any,s.value.knowledge)).toBe(true);}
function history(state:any){for(const path of effectPaths(state.value.effects,state.value.knowledge)){const fs=path.events.filter(e=>e.call.operation.startsWith('fs.'));expect(fs.map(e=>e.kind)).toEqual(['call','return','call','return']);for(let i=0;i<fs.length;i+=2)expect(fs[i].call).toBe(fs[i+1].call);}}

for(const [literal,value]of [['false',ESBoolean(false)],['""',ESString('')],['-Infinity',ESNumber(-Infinity)]] as Array<[string,Any]>)test('additional falsy/extreme own value '+literal,()=>{
 const source='Object.prototype.size=101;const answer=stat.size==='+literal+'&&alias.size==='+literal+';';native('stat.size='+literal+';'+source);
 const {state,stat}=setup();const seeded=writeProperty(stat,'size',value,state);const[d,s]=evaluateCode(source,seeded);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});expect(getProperties(stat,s).size).toBe(value);expect(getProperties(stat,state)).not.toHaveProperty('size');history(s);
});
for(const [name,value,literal]of [['boolean',ESBoolean(),'true'],['string',ESString(),'"some"'],['number',ESNumber(),'91']] as Array<[string,Any,string]>)test('open supplied value keeps identity and mandatory unknown '+name,()=>{
 const {state,stat,second}=setup({provided:value});const seeded=writeProperty(second,'size',value,writeProperty(stat,'size',value,state));
 const[d,s]=evaluateCode('const a=stat.size,b=second.size;const stable=a===b&&a===provided;const unknown=a==='+literal+';',seeded);expect(d).toBe(Undefined);if(name==='number')expect((s.value.scope.stable as any).value).toBeUndefined();else expect(s.value.scope.stable).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();expect(s.value.scope.a).toBe(value);history(s);
});

test('object aliases mutate current fields without replacing old snapshots',()=>{
 const source='const old=stat.size;old.n=13;alias.size={n:21};const answer=old===provided&&provided.n===13&&second.size===old&&stat.size!==old&&alias.size.n===21;';native('const provided={n:7};stat.size=provided;second.size=provided;'+source);
 const provided=ESObject({n:ESNumber(7)});const {state,stat,second}=setup({provided});const seeded=writeProperty(second,'size',provided,writeProperty(stat,'size',provided,state));
 const[d,s]=evaluateCode(source,seeded);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});proof('stat.size===provided&&stat.size.n===7&&second.size===provided',seeded);expect(getProperties(provided,state).n).toMatchObject({value:7});history(s);
});

test('legacy method identity agrees with ordinary reader and captures before argument replacement',()=>{
 const source='const captured=stat.size;function arg(){alias.size=function(){return 999;};second.size=alias.size;return 5;}const result=stat.size(arg());const answer=captured===plain.size&&captured!==stat.size&&stat.size===second.size&&result===42&&plain.size.call(stat,5)===42&&stat.size()===999;';
 native('const plain={};const f=function(n){return this===stat?n+37:0;};stat.size=f;second.size=f;plain.size=f;'+source);
 const {state,stat,second,plain}=setup();let calls=0;const legacy={implementation:function*(self:Any,args:Any[],context:any){calls++;expect(self).toBe(stat);expect(args[0]).toMatchObject({value:5});return [ESNumber(42),context] as [Any,any];}};
 const seeded=writeProperty(plain,'size',legacy,writeProperty(second,'size',legacy,writeProperty(stat,'size',legacy,state)));
 const[d,s]=evaluateCode(source,seeded);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});expect(calls).toBe(2);expect(getProperties(stat,seeded).size).toBe(legacy);history(s);
});

test('modeled native Stats method identity, borrowing, brands and snapshot replacements',()=>{
 const source='const captured=stat.size;const same=captured===stat.isFile&&captured===second.size;const file=stat.size();const dir=fs.statSync("/dir");const borrowed=second.size.call(dir);alias.size=function(){return 77;};const answer=same&&file&&!borrowed&&captured.call(stat)&&second.size()&&stat.size()===77;';
 native('stat.size=stat.isFile;second.size=stat.isFile;const captured=stat.size;const answer=captured===stat.isFile&&captured===second.size&&stat.size()&&second.size();');
 const {state,stat,second}=setup();const[d,ready]=evaluateCode('const f=stat.isFile;',state);expect(d).toBe(Undefined);const seeded=writeProperty(second,'size',ready.value.scope.f,writeProperty(stat,'size',ready.value.scope.f,ready));const[end,s]=evaluateCode(source,seeded);expect(end).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});proof('stat.size===f&&second.size===f',seeded);
});

for(const reverse of [false,true])test('nested correlated present values and absent branch '+reverse,()=>{
 const a=ESBoolean(),b=ESBoolean();const {state,stat,second}=setup({a,b});
 const one=writeProperty(second,'size',ESString('left'),writeProperty(stat,'size',ESNumber(31),state));
 const two=writeProperty(second,'size',ESString('right'),writeProperty(stat,'size',Undefined,state));
 const present=mergeContexts(b,state,one,two);const joined=mergeContexts(a,state,reverse?state:present,reverse?present:state);
 let reads=0;const context=ExecutionContext({...joined.value,validateRead(o:Any,n:string){if(o===stat&&n==='size')reads++;}});
 const all=leaves(evaluateCode('let mark=1;const n=alias.size;mark=2;const answer=b?n===31&&second.size==="left":n===undefined&&second.size==="right";const unknown=n===31;',context));
 expect(reads).toBe(1);expect(all).toHaveLength(2);for(const[d,s]of all){if(d===Undefined){expect(s.value.scope.answer).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();proof(reverse?'!a':'a',s);expect(s.value.scope.mark).toMatchObject({value:2});}else{expect(d).toMatchObject({kind:'unsupported',message:"Unmodeled host property 'size': Node Stats fields"});expect(s.value.scope.mark).toMatchObject({value:1});proof(reverse?'a':'!a',s);}history(s);}
 proof('stat.isFile()&&second.isFile()',state);expect(getProperties(stat,state)).not.toHaveProperty('size');
});

for(const reverse of [false,true])test('conditional own guest callee retains caller prefix and throw/stop siblings '+reverse,()=>{
 const a=ESBoolean(),b=ESBoolean(),c=ESBoolean();const console=createConsoleModel();const {state,stat}=setup({a,b,c,console:console.module});
 const[d,ready]=evaluateCode('let trace="",caught=false,cleaned=false;const box={n:0};function C(){}C.prototype.n=0;function supplied(x){trace=trace+"s";if(b)throw "G";return this===stat&&x===4;}const f=supplied;',state);expect(d).toBe(Undefined);
 const seeded=writeProperty(stat,'size',ready.value.scope.f,ready);const joined=mergeContexts(a,ready,reverse?ready:seeded,reverse?seeded:ready);
 const source='function read(){trace="p";box.n=8;C.prototype.n=9;console.log("p");if(c)return "x".charAt;return alias.size(4);}try{const result=read();trace=trace+result;}catch(e){caught=e;}finally{cleaned=true;console.log("f");}';
 const all=leaves(evaluateCode(source,joined));expect(all.filter(([v])=>v.type==='ExecutionBoundary')).toHaveLength(2);expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const[v,s]of all){const stop=v.type==='ExecutionBoundary';proof('box.n===8&&(new C()).n===9',s);if(stop){expect(s.value.scope.trace).toMatchObject({value:'p'});expect(s.value.scope.caught).toMatchObject({value:false});proof(v.message.indexOf('Stats')>=0?(reverse?'a&&!c':'!a&&!c'):'c',s);}else proof('b?caught==="G"&&trace==="ps":!caught&&trace==="pstrue"',s);expect(s.value.scope.cleaned).toMatchObject({value:!stop});expect(console.inspectOutput(s).every(p=>p.chunks.map(x=>x.value).join('')===(stop?'p\n':'p\nf\n'))).toBe(true);history(s);}
 native('stat.size=function(x){if(x)throw "G";return true;};let caught=false,cleaned=false;try{alias.size(4);}catch(e){caught=e;}finally{cleaned=true;}const answer=caught==="G"&&cleaned;');
});

test('fresh-size admission precedes inherited callable and arguments; other guards stay prior behavior',()=>{
 const {state,stat}=setup();const seeded=writeProperty(stat,'size',Undefined,state);
 const[d,s]=evaluateCode('let mark=1;Object.prototype.size=function(){mark=9;};const own=stat.size;second.size(mark=7);',seeded);expect(d).toMatchObject({kind:'unsupported',message:"Unmodeled host property 'size': Node Stats fields"});expect(s.value.scope.own).toBe(Undefined);expect(s.value.scope.mark).toMatchObject({value:1});history(s);
 // Marked Stats objects now retain reached guards as typed boundary
 // completions; legacy host failures keep their checkpoint. Both shapes must
 // preserve the mark=3 prefix and classified message.
 for(const expr of ['second.size=1','second.mtime','stat.mode','stat._checkModeProperty','Object.keys(stat)','stat.isDirectory.call({})']){
  let error:any,completion:any,after:any;try{[completion,after]=evaluateCode('let mark=3;'+expr+';',seeded);}catch(e){error=e;}
  if(error){expect(analysisFailureContext(error)!.value.scope.mark).toMatchObject({value:3});}
  else{expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(after.value.scope.mark).toMatchObject({value:3});}
 }
 native('const own=stat.size;Object.prototype.size=()=>999;let caught;try{stat.isFile.call(null);}catch(e){caught=e.name;}const answer=stat.size===own&&caught==="TypeError";');
});

test('actual unchanged consumer keeps complete FS histories and honest current activation',()=>{
 const directory=join(logs,'consumer');mkdirSync(directory,{recursive:true});
 for(const [fixture,name]of [['sirv-3.0.2','sirv'],['mrmime-2.0.1','mrmime'],['totalist-3.0.1','totalist'],['polka-url-1.0.0-next.29','@polka/url']])copySync(join(root,'test/fixtures',fixture,'package'),join(directory,'node_modules',name));
 mkdirSync(join(directory,'site'),{recursive:true});writeFileSync(join(directory,'site/hello.txt'),'hello from sirv\n');writeFileSync(join(directory,'entry.cjs'),'module.exports=require("sirv")("./site");');
 const result=runFile({script:'entry.cjs',args:[],maxSteps:100000,runtime:'node@24.21.0'},directory);expect(result.status).toBe('evaluated');
 const all=leaves([result.completion,result.current]);expect(all).toHaveLength(2);expect(all.every(([v])=>isESFunction(v)||isThrownValue(v))).toBe(true);
 const rows:any[]=[];for(const[v,s]of all){// The healthy leaf is the returned request handler closure.
 const stop=isESFunction(v);if(stop){const entries=Array.from(s.value.environments.entries()) as any[];const completed=entries.find(([,record])=>record.has('tmp')&&record.has('idx'));expect(completed[1].get('tmp').value).toMatchObject({value:'hello.txt'});expect(completed[1].get('idx').value).toMatchObject({value:6});const completedHeaders=entries.find(([,record])=>record.has('ctype')&&record.has('headers'));expect(completedHeaders[1].get('ctype').value).toMatchObject({value:'text/plain'});}else expect(getProperties(v.value as WithProperties,s).code).toMatchObject({value:'EMFILE'});
 for(const path of effectPaths(s.value.effects,s.value.knowledge)){const events=path.events;const calls=events.filter(e=>e.kind==='call');rows.push({completion:v.type,events:events.map(e=>({kind:e.kind,operation:e.call.operation,callIndex:calls.findIndex(c=>c.call===e.call)}))});save('consumer-histories.json',rows);expect(events.length).toBe(calls.length*2);for(const call of calls){const matching=events.filter(e=>e.call===call.call);expect(matching.map(e=>e.kind)).toEqual(['call',!stop&&call.call.operation==='fs.readdirSync'?'throw':'return']);}const fs=events.filter(e=>/^(fs\.|Stats\.)/.test(e.call.operation));expect(fs.map(e=>e.call.operation)).toEqual(stop?['fs.readdirSync','fs.readdirSync','fs.statSync','fs.statSync','fs.Stats.isDirectory','fs.Stats.isDirectory']:['fs.readdirSync','fs.readdirSync']);}}
 save('consumer-histories.json',rows);expect(rows.some(r=>r.events.some((e:any)=>e.operation==='fs.readdirSync'))).toBe(true);expect(rows.some(r=>r.events.some((e:any)=>e.operation==='fs.statSync'))).toBe(true);expect(rows.some(r=>r.events.some((e:any)=>e.operation==='fs.Stats.isDirectory'))).toBe(true);
 for(const [path,source]of result.input.sources)if(path.indexOf('/node_modules/')>=0)expect(source.text).toBe(readFileSync(path,'utf8'));
 const binary=process.env.PROPHET_NODE_BINARY||process.execPath,argv=[join(root,'bin/prophet.js'),'--','entry.cjs'];const env={PATH:process.env.PATH||'',HOME:process.env.HOME||'',TMPDIR:process.env.TMPDIR||'',NODE_OPTIONS:'',NODE_PATH:''};const start=new Date().toISOString();
 const child=spawnSync(binary,argv,{cwd:directory,env,encoding:'utf8',timeout:60000,maxBuffer:80*1024*1024});
 save('consumer-cli.json',{binary,argv,cwd:directory,env,start,end:new Date().toISOString(),capMs:60000,status:child.status,signal:child.signal,error:child.error&&String(child.error)});writeFileSync(join(logs,'consumer-cli.stdout'),child.stdout);writeFileSync(join(logs,'consumer-cli.stderr'),child.stderr);
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');const graph=JSON.parse(child.stdout);expect(Object.keys(graph).sort()).toEqual(['nodes','roots']);const nodes=new Map<string,any>(graph.nodes.map((n:any)=>[n.id,n]));
 const field=(ref:any,key:string)=>{const entry=nodes.get(ref.ref).entries.find(([name]:[string])=>name===key);return entry&&entry[1];};const fork=graph.roots.completion;expect(field(fork,'type')).toBe('ForkedCompletion');const endings=[field(fork,'consequent'),field(fork,'alternate')];expect(endings.map(x=>field(field(x,'0'),'type')).sort()).toEqual(['ThrownValue','function']);
 // The healthy leaf is the returned request handler closure.
 const stopped=endings.find(x=>field(field(x,'0'),'type')==='function');const stoppedState=field(stopped,'1');const envEntries=nodes.get(field(stoppedState,'environments').ref).entries;let ctypeRecord:any;for(const[,record]of envEntries){if(nodes.get(record.ref).entries.some(([key]:[string])=>key==='ctype')){ctypeRecord=record;break;}}expect(ctypeRecord).toBeDefined();expect(field(field(field(ctypeRecord,'ctype'),'value'),'value')).toBe('text/plain');
 const failed=endings.find(x=>field(field(x,'0'),'type')==='ThrownValue');expect(field(field(field(field(field(failed,'0'),'value'),'properties'),'code'),'value')).toBe('EMFILE');

},60000);


test('native-matched 100 current replacement and captured-value pairs',()=>{
 const values=['undefined','null','false','""','0','-0','NaN','-Infinity','({n:1})','(function(){return 1;})'];
 const rows:string[]=[];for(const first of values)for(const last of values)rows.push('const first='+first+',last='+last+';stat.size=first;const captured=alias.size;alias.size=last;const current=stat.size;const answer=(first!==first?captured!==captured:captured===first)&&(last!==last?current!==current:current===last)&&(first===0?1/first===1/captured:true)&&(last===0?1/last===1/current:true);');
 native('const rows='+JSON.stringify(rows)+';const answer=rows.every(source=>Function("stat","alias",source+";return answer;")(stat,alias));');
 for(const source of rows){const {state,stat}=setup();const seeded=writeProperty(stat,'size',ESNumber(37),state);const[d,s]=evaluateCode(source,seeded);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});expect(getProperties(stat,seeded).size).toMatchObject({value:37});history(s);}
 save('replacement-matrix.json',{rows,count:rows.length,native:true,vm:true});expect(rows).toHaveLength(100);
});
