import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext, createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ESObject } from "../src/Object";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { getProperties, writeProperty } from "../src/execution-context/Heap";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { createConsoleModel } from "../src/node/console";
import { effectPaths } from "../src/effects";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { loadTest262, runTest262Variant, test262Root } from "./test262/runner";

// Exact-source independent review: 3ef28e197fbfae2b5081346e901d85b780c965e0.
// Native execution is an oracle only. All guest source stays beside its assertions.
const root=join(__dirname,"..");
const logs=process.env.PROPHET_P012_REVIEW_LOG_ROOT||join(root,"logs/p012-independent/manual");
let sequence=0;
function save(name:string,value:any){mkdirSync(logs,{recursive:true});writeFileSync(join(logs,name),JSON.stringify(value,null,2));}
function native(body:string,input:any=null):any {
 const binary=process.env.PROPHET_NODE_BINARY||process.execPath;
 const source='if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(require("fs").readFileSync(0,"utf8"));'+body;
 const env={PATH:process.env.PATH||"",HOME:process.env.HOME||"",TMPDIR:process.env.TMPDIR||"",NODE_OPTIONS:"",NODE_PATH:""};
 const argv=['--no-global-search-paths','-e',source],start=new Date().toISOString();
 const child=spawnSync(binary,argv,{cwd:root,input:JSON.stringify(input),env,encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024});
 save('native-'+sequence+++'.json',{binary,argv,cwd:root,env,input,start,end:new Date().toISOString(),timeoutMs:20000,status:child.status,signal:child.signal,error:child.error&&String(child.error),stdout:child.stdout,stderr:child.stderr});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe('');return JSON.parse(child.stdout);
}
function run(source:string,inputs:{[key:string]:Any}={}){return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function both(source:string){expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',source)).toBe(true);const[d,s]=run(source);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});}

// Held-out endpoints and code-unit combinations, with literal argument identity preserved.
test('held-out native/VM UTF16 and numeric-string matrix',()=>{
 const texts=['\udfff\ud800\0\uffff','A𝄞\ud800Z','\u0301é\r\n','\u2028\ufeff\udc00',''];
 const ends=['undefined','null','false','true','-0','NaN','Infinity','-Infinity','5e-324','-5e-324','2.9999999999999996','9007199254740992','"\\ufeff2\\u00a0"','"0o3"','"+0x2"','"1_0"','"1e309"','"-0"','({valueOf(){return undefined;}})'];
 const rows:string[]=[];for(const t of texts){rows.push(JSON.stringify(t).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+'.substring()');for(const a of ends)for(const b of ends)rows.push(JSON.stringify(t).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')+'.substring('+a+','+b+')');}
 const expected=native('process.stdout.write(JSON.stringify(input.map(s=>Function("return "+s)())));',rows);
 rows.forEach((source,i)=>{const[d,s]=run('const answer='+source+';');expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:expected[i]});});
 save('matrix.json',{rows,expected});expect(rows).toHaveLength(1810);
},30000);

const programs=[
 'let trace="";const box={text:"A😀BC"};const r={toString(){trace=trace+"r";return box.text;}};const s={valueOf(){trace=trace+"s";box.text="changed";return 1.9;}};const e={valueOf(){trace=trace+"e";return 2.9;}};const out=String.prototype.substring.call(r,s,e);const answer=out==="\\ud83d"&&box.text==="changed"&&trace==="rse";',
 'let t="";function C(){}C.prototype.toString=function(){t=t+"r";this.valueOf=function(){t=t+"v";return "abcdef";};return {};};const r=new C();const s={valueOf(){t=t+"s";e.toString=function(){t=t+"n";return "3";};return 1;}};const e={valueOf:0,toString(){throw "old";}};const out=String.prototype.substring.call(r,s,e);const answer=t==="rvsn"&&out==="bc";',
 'let idx=0;const f=String.prototype.substring;function extra(){String.prototype.substring=function(){"use strict";return "new";};return {valueOf(){throw "coerced";}};}const n="abcdef".substring(++idx,4,extra());const answer=idx===1&&n==="bcd"&&"abcdef".substring(1)==="new"&&f.call("abcdef",1,4)==="bcd";',
 'let trace="",caught=false;function arg(){trace="a";throw "G";}try{String.prototype.substring.call(undefined,arg());}catch(e){caught=e;}const answer=trace==="a"&&caught==="G";',
 'const f=String.prototype.substring,own=Object.prototype.hasOwnProperty;let caught=false;try{new f({valueOf(){throw "unused";}});}catch(e){caught=e instanceof TypeError;}const answer=caught&&f.name==="substring"&&f.length===2&&!own.call(f,"prototype")&&own.call(String.prototype,"substring")&&f===String.prototype.substring&&f.call(-123.5,1,4)==="123";',
 'let trace="";const s={valueOf(){trace="v";return function(){};},toString(){trace=trace+"s";return null;}};const e={valueOf(){trace=trace+"e";return true;}};const answer="abcdef".substring(s,e)==="a"&&trace==="vse";',
 'let caught=false,trace="";try{"".substring({valueOf(){trace="s";throw "G";}},{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e;}const answer=caught==="G"&&trace==="s";',
 'let caught=false,trace="";try{"abc".substring(99,{valueOf(){trace="v";return [];},toString(){trace=trace+"t";return {};}});}catch(e){caught=e instanceof TypeError;}const answer=caught&&trace==="vt";',
 'const x={toString(){this.valueOf=function(){return 42;};return {};},valueOf(){return 99;}};const answer=String(x)==="42"&&"x".concat(x)==="x42"&&"abc".lastIndexOf("b",{valueOf(){return {};},toString(){return "3";}})===1;'
];
programs.forEach((s,i)=>test('held-out ordered native/VM '+i,()=>both(s)));

test('finite end identity, correlation, late fallback and persistent snapshots',()=>{
 const[d,before]=run('const f=String.prototype.substring;function C(){}C.prototype.valueOf=function(){return 1;};const x=new C();const box={n:0};const alias=box;');expect(d).toBe(Undefined);
 const[e,after]=evaluateCode('if(a){C.prototype.valueOf=function(){alias.n=7;return {};};C.prototype.toString=function(){return "2";};String.prototype.substring=function(){"use strict";return "new";};}const end=a?undefined:{valueOf(){return undefined;}};const n=f.call("abcdef",x,end);const answer=a?n==="cdef"&&box.n===7&&"x".substring()==="new":n==="a"&&box.n===0;const unknown=n==="a";',setVariablesInScope(before,{a:ESBoolean()}));
 expect(e).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
 const[z,old]=evaluateCode('const answer=f.call("abcdef",x,3)==="bc"&&box.n===0&&"abc".substring(1)==="bc";',before);expect(z).toBe(Undefined);expect(old.value.scope.answer).toMatchObject({value:true});
});

for(const kind of ['open','budget','late-bigint'])test('held-out conversion siblings current state '+kind,()=>{
 const console=createConsoleModel();const input=kind==='open'?ESString():kind==='budget'?ESString('z'.repeat(65537)):({type:'bigint',value:'123'} as Any);
 const source='let trace="",caught=false,cleaned=false;const box={n:0},alias=box;function C(){}C.prototype.n=0;const f=String.prototype.substring;const r={toString(){trace="r";console.log("r");alias.n=8;C.prototype.n=9;return a?input:"abcde";}};const start={valueOf(){trace=trace+"s";console.log("s");return 4;}};const end={valueOf(){trace=trace+"e";console.log("e");if(b)throw "G";return 1;}};try{const n=f.call(r,start,end);trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("f");}';
 const all=leaves(run(source,{input,a:ESBoolean(),b:ESBoolean(),console:console.module}));expect(all.some(([v])=>v.type==='ExecutionBoundary')).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const[v,s]of all){const stop=v.type==='ExecutionBoundary';if(stop){expect(v.kind).toBe(kind==='budget'?'budget':'unsupported');expect(s.value.scope.trace).toMatchObject({value:kind==='late-bigint'?'r':'rse'});expect(s.value.scope.caught).toMatchObject({value:false});}else{const[d,t]=evaluateCode('const valid=b?caught==="G"&&trace==="rse":!caught&&trace==="rsebcd";',s);expect(d).toBe(Undefined);expect(t.value.scope.valid).toMatchObject({value:true});}
 expect(s.value.scope.cleaned).toMatchObject({value:!stop});expect(console.inspectOutput(s).every(p=>p.chunks.length===(stop?(kind==='late-bigint'?1:3):4))).toBe(true);
 const[d,t]=evaluateCode('const current=box.n===8&&alias===box&&(new C()).n===9;',s);expect(d).toBe(Undefined);expect(t.value.scope.current).toMatchObject({value:true});}
});

for(const hook of [Undefined,ESNull,ESNumber(7)])test('own symbol slot precedes inherited hook and ordinary lookup '+hook.type,()=>{
 const p=ESObject({}),x=ESObject({});p.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(9)]]);x.prototype=p;x.wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);
 const[d,s]=run('let trace="";x.toString=function(){trace="t";return "abcd";};const out=String.prototype.substring.call(x,1,3);',{x});
 if(hook===Undefined||hook===ESNull){expect(d).toBe(Undefined);expect(s.value.scope.out).toMatchObject({value:'bc'});expect(s.value.scope.trace).toMatchObject({value:'t'});}else{expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(s.value.scope.trace).toMatchObject({value:''});}
});

for(const expr of ['String.prototype.substring.bind','String.prototype.substring.caller','String.prototype.substring.name="bad"','Object.keys(String.prototype.substring)','"abc".indexOf'])test('held-out partial metadata '+expr,()=>{
 const all=leaves(run('let n=0;if(a){n=1;'+expr+';n=9;}else n=2;',{a:ESBoolean()}));expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==='ExecutionBoundary')[1].value.scope.n).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.n).toMatchObject({value:2});
});

function fsSetup(){return createFileSystemModel({root:fileSystemDirectory({file:fileSystemFile('abc'),dir:fileSystemDirectory({})}),cwd:'/'});}
function stats(){const model=fsSetup();const[d,s]=run('const stat=fs.statSync("/file");const alias=stat;',{fs:model.module});expect(d).toBe(Undefined);return {model,state:s,stat:s.value.scope.stat as any};}

test('fresh Stats guard preserves caller heap console prototype and FS identities',()=>{
 const model=fsSetup(),console=createConsoleModel();const source='let mark=0,caught=false,cleaned=false;const box={n:0},alias=box;function C(){}C.prototype.n=0;function read(){mark=1;alias.n=8;C.prototype.n=9;console.log("prefix");const stat=fs.statSync(b?"/missing":"/file");stat.size;mark=9;}if(a){try{read();}catch(e){caught=e.code;}finally{cleaned=true;}}else mark=2;';
 const all=leaves(run(source,{fs:model.module,console:console.module,a:ESBoolean(),b:ESBoolean()}));expect(all.some(([v])=>v.type==='ExecutionBoundary')).toBe(true);
 for(const[v,s]of all){const stop=v.type==='ExecutionBoundary';if(stop){expect(v.message).toBe("Unmodeled host property 'size': Node Stats fields");expect(s.value.scope.mark).toMatchObject({value:1});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});expect(console.inspectOutput(s).every(p=>p.chunks.length===1)).toBe(true);}else{const[d,t]=evaluateCode('const valid=a?caught==="ENOENT"&&cleaned&&mark===1:mark===2&&!caught&&!cleaned;',s);expect(d).toBe(Undefined);expect(t.value.scope.valid).toMatchObject({value:true});}
 const[d,t]=evaluateCode('const current=a?box.n===8&&alias===box&&(new C()).n===9:box.n===0;',s);expect(d).toBe(Undefined);expect(t.value.scope.current).toMatchObject({value:true});
 for(const path of effectPaths(s.value.effects)){const events=path.events.filter(e=>e.call.operation==='fs.statSync');if(events.length){expect(events.map(e=>e.kind)).toEqual(['call',stop?'return':'throw']);expect(events[0].call).toBe(events[1].call);}}
 }
});

test('Stats brand/method replacements, other reads/writes remain predecessor behavior',()=>{
 const {state}=stats();const[d,s]=evaluateCode('const dir=fs.statSync("/dir");const f=stat.isDirectory;stat.isDirectory=function(){return "replacement";};const answer=alias.isDirectory()==="replacement"&&f.call(stat)===false&&f.call(dir)===true&&stat.isFile();',state);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});
 for(const expr of ['stat.size=4','stat.mtime','stat.mode','stat.unknown','Object.keys(stat)','stat.isFile.call({})']){let error:any;try{evaluateCode('let mark=1;'+expr+';',state);}catch(e){error=e;}expect(error).toBeDefined();expect(analysisFailureContext(error)!.value.scope.mark).toMatchObject({value:1});}
 expect(native('const fs=require("fs"),s=fs.statSync(input);const f=s.isFile;s.isFile=()=>"own";let invalid;try{f.call(null);}catch(e){invalid=e.name;}process.stdout.write(JSON.stringify({own:s.isFile(),brand:f.call(s),invalid}));',join(root,'package.json'))).toEqual({own:'own',brand:true,invalid:'TypeError'});
});

// P012-R1: a size admission guard must not mask a value already known in the heap.
// Seeding a known data property is state preparation, not implementation of Stats.size.
for(const replacement of [false,true])test('P012-R1 known current own Stats size remains readable '+replacement,()=>{
 const {state,stat}=stats();const seeded=writeProperty(stat,'size',ESNumber(17),state);
 const source='let mark=1;'+(replacement?'alias.size=23;':'')+'const answer=stat.size;';
 const[d,s]=evaluateCode(source,seeded);
 save('R1-'+replacement+'.json',{source,initialKnownSize:17,replacement,native:native('const fs=require("fs"),stat=fs.statSync(input),alias=stat;stat.size=17;'+source+'process.stdout.write(JSON.stringify(answer));',join(root,'package.json')),completion:d,currentSize:(getProperties(stat,s).size as any).value,mark:(s.value.scope.mark as any).value});
 expect(getProperties(stat,state)).not.toHaveProperty('size');expect(getProperties(stat,s).size).toMatchObject({value:replacement?23:17});expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:replacement?23:17});
});

test('independent complete substring upstream native and VM dispositions',()=>{
 const prefix='built-ins/String/prototype/substring/';const names=readdirSync(join(test262Root,'test',prefix)).filter(n=>n.endsWith('.js')).sort();expect(names).toHaveLength(43);
 const rows:any[]=[];for(const name of names){const f=loadTest262(prefix+name);const hash=createHash('sha256').update(readFileSync(join(test262Root,'test',prefix+name))).digest('hex');
 for(const variant of ['sloppy','strict'] as Array<'sloppy'|'strict'>){const input={root:test262Root,file:join(test262Root,'test',prefix+name),includes:['sta.js','assert.js',...f.attrs.includes],variant};
 expect(native('const fs=require("fs"),vm=require("vm"),c=vm.createContext({});for(const h of input.includes)vm.runInContext(fs.readFileSync(input.root+"/harness/"+h,"utf8"),c,{timeout:1000});vm.runInContext((input.variant==="strict"?"\\\"use strict\\\";\\n":"")+fs.readFileSync(input.file,"utf8"),c,{timeout:1000});process.stdout.write("true");',input)).toBe(true);
 let error:any;try{runTest262Variant(f,variant);}catch(e){error=e;}rows.push({name,variant,hash,attrs:f.attrs,error:error&&String(error),stack:error&&error.stack});}}
 save('upstream.json',rows);expect(rows.filter(r=>!r.error)).toHaveLength(28);expect(rows.filter(r=>r.error)).toHaveLength(58);
},60000);


test('source-bound base versus frozen Stats known-property regression control',()=>{
 const bootstrap=`const fs=require("fs"),path=require("path"),cp=require("child_process"),crypto=require("crypto"),babel=require("@babel/core"),loaded=[];
 require.extensions[".ts"]=function(mod,file){const rel=path.relative(input.root,file);const source=cp.execFileSync("git",["show",input.revision+":"+rel],{cwd:input.root,encoding:"utf8"});loaded.push({file:rel,sha256:crypto.createHash("sha256").update(source).digest("hex")});const code=babel.transformSync(source,{filename:file,babelrc:false,configFile:false,plugins:[require.resolve("babel-plugin-macros")],presets:[[require.resolve("@babel/preset-env"),{targets:{node:"current"}}],require.resolve("@babel/preset-typescript")]}).code;mod._compile(code,file);};
 const vm=require(input.root+"/src/index.ts"),heap=require(input.root+"/src/execution-context/Heap.ts"),ctx=require(input.root+"/src/execution-context/ExecutionContext.ts"),types=require(input.root+"/src/types.ts");
 const fsmodel=vm.createFileSystemModel({root:vm.fileSystemDirectory({file:vm.fileSystemFile("abc")}),cwd:"/"});const [d,s]=vm.evaluateCode('const stat=fs.statSync("/file");const alias=stat;',ctx.setVariablesInScope(vm.nodeInitialExecutionContext,{fs:fsmodel.module}));if(d!==types.Undefined)throw Error("setup");const seeded=heap.writeProperty(s.value.scope.stat,"size",types.ESNumber(17),s);const [result,after]=vm.evaluateCode('alias.size=23;const answer=stat.size;',seeded);process.stdout.write(JSON.stringify({loaded,completion:result.type,message:result.message,answer:after.value.scope.answer&&after.value.scope.answer.value,current:heap.getProperties(s.value.scope.stat,after).size.value}));`;
 const results:any[]=[];for(const revision of ['22c109dd0bf67336f023f113055c3a63871684a6','3ef28e197fbfae2b5081346e901d85b780c965e0'])results.push(native(bootstrap,{root,revision}));
 save('base-vs-frozen.json',results);expect(results[0]).toMatchObject({completion:'undefined',answer:23,current:23});expect(results[1]).toMatchObject({completion:'ExecutionBoundary',message:"Unmodeled host property 'size': Node Stats fields",current:23});
},60000);

test('unchanged mrmime native Unicode controls retain predecessor lowercase boundary',()=>{
 const path=join(root,'test/fixtures/mrmime-2.0.1/package/index.js');const source=readFileSync(path,'utf8');const names=['hello.txt','folder/name.JSON','é.txt','😀.txt','\ud800.txt'];
 const expected=native('const mime=require(input.path);process.stdout.write(JSON.stringify(input.names.map(x=>mime.lookup(x))));',{path,names});expect(expected).toEqual(['text/plain','application/json','text/plain','text/plain','text/plain']);
 const rows:any[]=[];for(let i=0;i<names.length;i++){const entry='const mime=require("./mime");module.exports=mime.lookup('+JSON.stringify(names[i])+');';const[d,s]=createCommonJSLoader({'/entry.cjs':entry,'/mime.js':source}).load('/entry.cjs',nodeInitialExecutionContext);
 rows.push({name:names[i],native:expected[i],completion:(d as any).type,message:(d as any).message,value:(d as any).value,source:s.value.sourceFile});if(i<2){expect(d).toMatchObject({type:'string',value:expected[i]});}else{expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect((d as any).message).toMatch(/ASCII/);}}
 save('mrmime-controls.json',rows);
});
