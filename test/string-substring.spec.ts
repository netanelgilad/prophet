import { execFileSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { compareModuleGraph, compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";
import { loadTest262, runTest262Variant, test262Root } from "./test262/runner";
const cwd=join(__dirname,"..");
function run(source:string,inputs:{[key:string]:Any}={}){return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function literal(s:string){return JSON.stringify(s).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");}
const cases:Array<[string,string]>=[['','abcdef'],['undefined','abcdef'],['undefined,undefined','abcdef'],['null,null',''],['false,true','a'],['true,false','a'],['"2.9","4.9"','cd'],['"bad",3','abc'],['NaN,Infinity','abcdef'],['Infinity,-Infinity','abcdef'],['-0,0',''],['-1,99','abcdef'],['2.9,4.9','cd'],['-2.9,-0.9',''],['5,2','cde'],['3,3',''],['99,99',''],['2,{valueOf(){return undefined;}}','ab'],['2,null','ab'],['"0x2","0b100"','cd'],['"1n",2','ab']];
const matrix=cases.map(([args,answer])=>`if("abcdef".substring(${args})!==${literal(answer)})throw "matrix";`).join('\n');
test('native endpoint matrix',()=>withModuleFixture(matrix+'module.exports=true;',f=>expect(nodeModuleObservation(f)).toEqual({kind:'return',value:{type:'boolean',value:true}})));
for(const [args,answer]of cases)test('VM endpoints '+args,()=>{const[d,s]=run(`const answer="abcdef".substring(${args});`);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:answer});});
const programs=[
 'const f=String.prototype.substring;module.exports=f.call(true,1,3)==="ru"&&f.call(12345,1,3)==="23"&&f.call({},1,7)==="object"&&f.call(String.prototype)==="";',
 'let trace="";function arg(t,x){trace=trace+t;return x;}const r={toString(){trace=trace+"r";return "abcdef";}};const a={valueOf(){trace=trace+"s";return 2;}};const b={valueOf(){trace=trace+"e";return 4;}};const extra={valueOf(){throw "wrong";},toString(){throw "wrong";}};const n=String.prototype.substring.call(r,arg("a",a),arg("b",b),arg("x",extra));module.exports=n==="cd"&&trace==="abxrse";',
 'let trace="";const r={toString(){trace="r";this.valueOf=function(){trace=trace+"v";return "abcdef";};return {};},valueOf(){throw "old";}};const s={valueOf(){trace=trace+"s";e.valueOf=function(){trace=trace+"n";return {};};return {};},toString(){trace=trace+"t";return "2.9";}};const e={valueOf(){throw "old";},toString(){trace=trace+"e";return "4.9";}};module.exports=String.prototype.substring.call(r,s,e)==="cd"&&trace==="rvstne";',
 'let trace="";let caught;try{String.prototype.substring.call(null,{valueOf(){trace="wrong";}});}catch(e){caught=e instanceof TypeError;}module.exports=caught&&trace==="";',
 'let trace="";let caught;function extra(){trace="arg";throw "extra";}try{String.prototype.substring.call(null,0,1,extra());}catch(e){caught=e;}module.exports=caught==="extra"&&trace==="arg";',
 'let caught;try{String.prototype.substring.call({toString(){return {};},valueOf(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;',
 'let caught;try{"".substring({valueOf(){return {};},toString(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;',
 'let caught;try{"abc".substring(99,{valueOf(){return {};},toString(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;',
 'const old="abcdef",f=old.substring,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}const meta=f.name==="substring"&&f.length===2&&f.prototype===undefined&&own.call(String.prototype,"substring")&&own.call(f,"name")&&own.call(f,"length")&&!own.call(f,"prototype")&&!own.call(f,"call");String.prototype.substring=function(){"use strict";return "new";};module.exports=caught&&meta&&old.substring(2)==="new"&&f.call(old,2)==="cdef";',
 'let idx=5;const tmp="hello.txt";const n=tmp.substring(++idx);module.exports=n==="txt"&&idx===6;',
 'const f=String.prototype.substring;function arg(){String.prototype.substring=function(){"use strict";return "new";};return 2;}module.exports="abcd".substring(arg())==="cd"&&"abcd".substring(2)==="new"&&f.call("abcd",2)==="cd";',
 'function C(){}C.prototype.toString=function(){return "abcdef";};C.prototype.valueOf=function(){return 2;};const x=new C();const n=String.prototype.substring.call(x,x,4);C.prototype.valueOf=function(){return 1;};module.exports=n==="cd"&&String.prototype.substring.call(x,x,4)==="bcd";',
 'const f=String.prototype.substring;f.call=function(){"use strict";return "custom";};module.exports=f.call("abc",1)==="custom"&&"abc".substring(1)==="bc";',
 'const x={"1n":2,plain:4,9007199254740993:3};const {"1n":start,plain:end}=x;module.exports="abcdef".substring(start,end)==="cd"&&x["9007199254740992"]===3;'
];
programs.forEach((source,i)=>{test('native ordered conversion/identity '+i,()=>withModuleFixture(source,f=>expect(nodeModuleObservation(f)).toEqual({kind:'return',value:{type:'boolean',value:true}})));test('VM ordered conversion/identity '+i,()=>expect(compareModule(source).actual).toEqual({kind:'return',value:{type:'boolean',value:true}}));});
// Exhaustive endpoint cross-products over short UTF-16 strings (including split halves).
const texts=['','a','\0é','😀','x😀y','\ud800a\udfff','e\u0301','\u2028\u2029'];
const endpoints=[-Infinity,-2,-0.9,-0,0,1,1.9,2,3,9,Infinity,NaN];
let utf16Answers: string[][][] | undefined;
function utf16Oracle(): string[][][] {
  if (utf16Answers) return utf16Answers;
  const node=process.env.PROPHET_NODE_BINARY||process.execPath;
  expect(execFileSync(node,['--version'],{cwd,encoding:'utf8'}).trim()).toBe('v24.21.0');
  const source='const texts='+JSON.stringify(texts)+',ends='+JSON.stringify(endpoints.map(x=>String(x)))+';process.stdout.write(JSON.stringify(texts.map(s=>ends.map(a=>ends.map(b=>s.substring(Number(a),Number(b)))))));';
  const output=execFileSync(node,['-e',source],{cwd,encoding:'utf8',timeout:10000});
  const dir=process.env.PROPHET_P012_LOG_ROOT||join(cwd,'logs/p012/candidates');
  mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'utf16-native-source.js'),source);writeFileSync(join(dir,'utf16-native.json'),output);
  utf16Answers=JSON.parse(output);return utf16Answers!;
}
test('native UTF-16 cross-product saved oracle',()=>{
  const answers=utf16Oracle();
  for(let t=0;t<texts.length;t++)for(let a=0;a<endpoints.length;a++)for(let b=0;b<endpoints.length;b++)expect(answers[t][a][b].length).toBeLessThanOrEqual(texts[t].length);
});
test('VM UTF-16 exhaustive endpoint cross-product',()=>{
  const answers=utf16Oracle();
  for(let t=0;t<texts.length;t++)for(let a=0;a<endpoints.length;a++)for(let b=0;b<endpoints.length;b++){
    const [done,state]=run('const answer=input.substring(start,end);',{input:ESString(texts[t]),start:ESNumber(endpoints[a]),end:ESNumber(endpoints[b])});
    expect(done).toBe(Undefined);expect(state.value.scope.answer).toMatchObject({value:answers[t][a][b]});
  }
});
test('finite conversions preserve correlations and mandatory unknown',()=>{const[d,s]=run('let calls=0;const r={toString(){calls=calls+1;return a?"abcdef":"xyz";}};const start={valueOf(){calls=calls+1;return a?2:0;}};const end={valueOf(){calls=calls+1;return a?4:1;}};const n=String.prototype.substring.call(r,start,end);const valid=calls===3&&(a?n==="cd":n==="x");const unknown=n==="cd";',{a:ESBoolean()});expect(d).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();});
test('aliases replacement and prior prototype/heap snapshot',()=>{const[d,before]=run('const f=String.prototype.substring;function C(){}C.prototype.valueOf=function(){return 2;};const x=new C();',{a:ESBoolean()});expect(d).toBe(Undefined);const[e,after]=evaluateCode('if(a){String.prototype.substring=function(){"use strict";return "new";};C.prototype.valueOf=function(){return 1;};}const n="abcdef".substring(x,4);const alias=f.call("abcdef",x,4);const valid=a?n==="new"&&alias==="bcd":n==="cd"&&alias==="cd";',before);expect(e).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});const[z,old]=evaluateCode('const n="abcdef".substring(x,4);',before);expect(z).toBe(Undefined);expect(old.value.scope.n).toMatchObject({value:'cd'});});
for(const operand of ['receiver','start','end'])for(const throwing of [false,true])test(`late open ${operand} permits later effects/throw ${throwing}`,()=>{const[d,s]=run(`let trace="",caught=false,cleaned=false;const r={toString(){trace="r";return ${operand==='receiver'?'input':'"abcdef"'};}};const start={valueOf(){trace=trace+"s";return ${operand==='start'?'input':'2'};}};const end={valueOf(){trace=trace+"e";${throwing?'throw "E";':`return ${operand==='end'?'input':'4'};`}}};try{String.prototype.substring.call(r,start,end);}catch(e){caught=e;}finally{cleaned=true;}`,{input:operand==='receiver'?ESString():ESNumber()});expect(s.value.scope.trace).toMatchObject({value:'rse'});if(throwing){expect(d).toBe(Undefined);expect(s.value.scope.caught).toMatchObject({value:'E'});expect(s.value.scope.cleaned).toMatchObject({value:true});}else{expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});}});
for(const length of [65535,65536,65537])for(const args of ['0,1','Infinity,Infinity','4,2'])test(`copy admission ${length} ${args}`,()=>{const[d,s]=run(`let trace="";const start={valueOf(){trace="s";return ${args.split(',')[0]};}};const end={valueOf(){trace=trace+"e";return ${args.split(',')[1]};}};const n=input.substring(start,end);`,{input:ESString('a'.repeat(length))});expect(s.value.scope.trace).toMatchObject({value:'se'});if(length>65536)expect(d).toMatchObject({type:'ExecutionBoundary',kind:'budget'});else{expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:args==='0,1'?'a':args==='4,2'?'aa':''});}});
for(const text of ['', 'a'.repeat(65537)])test('empty/oversized receiver permits end throw '+text.length,()=>{const[d,s]=run('let trace="",caught;try{input.substring({valueOf(){trace="s";return Infinity;}},{valueOf(){trace=trace+"e";throw "E";}});}catch(e){caught=e;}',{input:ESString(text)});expect(d).toBe(Undefined);expect(s.value.scope.trace).toMatchObject({value:'se'});expect(s.value.scope.caught).toMatchObject({value:'E'});});
for(const input of [ESString(),ESString([ESString('a')]),ESNumber(),ESString('a'.repeat(65537))])test('mixed supported/throw/open/budget effects '+input.type+String(typeof(input as any).value),()=>{
 const console=createConsoleModel();const result=run('let trace="",caught=false,cleaned=false;const box={n:0},alias=box;const f=String.prototype.substring;const r={toString(){trace="r";console.log("r");alias.n=7;String.prototype.substring=function(){"use strict";return "new";};return a?input:"abcdef";}};const start={valueOf(){trace=trace+"s";console.log("s");return 2;}};const end={valueOf(){trace=trace+"e";console.log("e");if(b)throw "G";return 4;}};try{const n=f.call(r,start,end);trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}',{input,a:ESBoolean(),b:ESBoolean(),console:console.module});
 const all=leaves(result);expect(all.some(([v])=>v.type==='ExecutionBoundary')).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);for(const[v,s]of all){const stopped=v.type==='ExecutionBoundary';if(stopped){expect(s.value.scope.trace).toMatchObject({value:'rse'});expect(s.value.scope.caught).toMatchObject({value:false});expect(v.kind).toBe(typeof(input as any).value==='string'?'budget':'unsupported');}else{const[d,z]=evaluateCode('const valid=b?caught==="G"&&trace==="rse":!caught&&trace==="rsecd";',s);expect(d).toBe(Undefined);expect(z.value.scope.valid).toMatchObject({value:true});}expect(s.value.scope.cleaned).toMatchObject({value:!stopped});expect(console.inspectOutput(s).every(p=>p.chunks.length===(stopped?3:4))).toBe(true);const[d,z]=evaluateCode('const valid=box.n===7&&"abc".substring(1)==="new"&&f.call("abc",1)==="bc";',s);expect(d).toBe(Undefined);expect(z.value.scope.valid).toMatchObject({value:true});}
});
for(const input of [{type:'bigint',value:'9007199254740993'} as any,{type:'symbol'} as any,{type:'exotic'} as any])for(const operand of ['receiver','start','end'])test(`late primitive ${input.type} ${operand}`,()=>{const[d,s]=run(`let trace="",caught=false,cleaned=false;const r={toString(){trace="r";return ${operand==='receiver'?'input':'"abc"'};}};const start={valueOf(){trace=trace+"s";return {};},toString(){trace=trace+"t";return ${operand==='start'?'input':'1'};}};const end={valueOf(){trace=trace+"e";return ${operand==='end'?'input':'2'};}};try{String.prototype.substring.call(r,start,end);}catch(e){caught=true;}finally{cleaned=true;}`,{input});expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(s.value.scope.trace).toMatchObject({value:operand==='receiver'?'r':operand==='start'?'rst':'rste'});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});});
for(const operand of ['receiver','start','end'])for(const expression of ['[]','function(){}','1n'])test(`genuine earlier conversion stop ${operand} ${expression}`,()=>{const result=run(`let trace="",caught=false,cleaned=false;const x=${expression==='1n'?' {valueOf(){trace=trace+"x";return 1n;},toString(){trace=trace+"x";return 1n;}}':expression};if(a){try{String.prototype.substring.call(${operand==='receiver'?'x':'{toString(){trace="r";return "abc";}}'},${operand==='start'?'x':'{valueOf(){trace=trace+"s";return 1;}}'},${operand==='end'?'x':'{valueOf(){trace=trace+"e";return 2;}}'});}catch(e){caught=true;}finally{cleaned=true;}}else trace="sibling";`,{a:ESBoolean()});const all=leaves(result);expect(all).toHaveLength(2);const stop=all.find(([v])=>v.type==='ExecutionBoundary');expect(stop[0].kind).toBe('unsupported');expect(stop[1].value.scope.trace).toMatchObject({value:(operand==='receiver'?'':operand==='start'?'r':'rs')+(expression==='1n'?'x':'')});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:'sibling'});});
for(const inherited of [false,true])for(const hook of [Undefined,ESNull,ESNumber(1)])for(const operand of ['receiver','start','end'])test(`current symbol hook ${operand} ${inherited} ${hook.type}`,()=>{const input=ESObject({}),proto=ESObject({});(inherited?proto:input).wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);if(inherited)input.prototype=proto;const[d,s]=run(`let trace="";input.toString=function(){trace="r";return "abc";};input.valueOf=function(){trace="n";return 1;};const n=String.prototype.substring.call(${operand==='receiver'?'input':'"abc"'},${operand==='start'?'input':'0'},${operand==='end'?'input':'2'});`,{input});if(hook===Undefined||hook===ESNull){expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:operand==='receiver'?'ab':operand==='start'?'b':'a'});}else{expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(s.value.scope.trace).toMatchObject({value:''});}});
test('own nullish hook shadows inherited custom hook',()=>{const p=ESObject({}),input=ESObject({});p.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(1)]]);input.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNull]]);input.prototype=p;const[d,s]=run('input.valueOf=function(){return 1;};const n="abc".substring(input,2);',{input});expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:'b'});});
for(const expression of ['String.prototype.substring.bind','String.prototype.substring.hasOwnProperty','String.prototype.substring.caller','String.prototype.substring.arguments','String.prototype.substring.name="x"','String.prototype.substring.length=3','Object.keys(String.prototype.substring)','({...String.prototype.substring})','"x".indexOf'])test('truthful residual '+expression,()=>{const result=run(`let trace="";if(a){trace="prefix";const n=(${expression});trace="wrong";}else trace="sibling";`,{a:ESBoolean()});const all=leaves(result);expect(all.find(([v])=>v.type==='ExecutionBoundary')[1].value.scope.trace).toMatchObject({value:'prefix'});expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:'sibling'});});
test('native conservative exotics and BigInt/Symbol controls',()=>withModuleFixture('const f=String.prototype.substring;const a=[];a.valueOf=()=>1;a.toString=()=>"abc";const fn=()=>{};fn.valueOf=()=>1;fn.toString=()=>"abc";const o=Object.create({[Symbol.toPrimitive](h){return h==="number"?1:"abc";}});let caught=0;for(const x of [1n,Symbol(),{valueOf(){return 1n;}}])try{f.call("abc",x);}catch(e){if(e instanceof TypeError)caught++;}module.exports=[a,fn,o].every(x=>f.call(x,1,2)==="b"&&f.call("abc",x,2)==="b")&&f.call(123n,1)==="23"&&caught===3&&f.call(new String("abc"),1)==="bc"&&"a".repeat(65537).substring(Infinity)==="";',f=>expect(nodeModuleObservation(f)).toEqual({kind:'return',value:{type:'boolean',value:true}})));
// Whole-file discovery uses native standard harness/includes; incompatible VM files stay whole and inactive.
const prefix='built-ins/String/prototype/substring/';
const activeCandidates=["S15.5.4.15_A1_T10.js", "S15.5.4.15_A1_T11.js", "S15.5.4.15_A1_T13.js", "S15.5.4.15_A1_T14.js", "S15.5.4.15_A1_T4.js", "S15.5.4.15_A1_T7.js", "S15.5.4.15_A1_T8.js", "S15.5.4.15_A3_T10.js", "S15.5.4.15_A3_T5.js", "S15.5.4.15_A3_T6.js", "S15.5.4.15_A3_T7.js", "S15.5.4.15_A6.js", "S15.5.4.15_A7.js", "this-value-not-obj-coercible.js"];
test('native whole upstream candidates',()=>{
 const rows:any[]=[];const node=process.env.PROPHET_NODE_BINARY||process.execPath;expect(execFileSync(node,['--version'],{cwd,encoding:'utf8'}).trim()).toBe('v24.21.0');
 for(const name of readdirSync(join(test262Root,'test',prefix)).filter(n=>n.endsWith('.js')).sort()){const f=loadTest262(prefix+name),runs:any[]=[];for(const variant of ['sloppy','strict']){const source='const fs=require("fs"),vm=require("vm");const root=process.argv[1],file=process.argv[2],strict=process.argv[3];const ctx=vm.createContext({});for(const h of '+JSON.stringify(['sta.js','assert.js',...f.attrs.includes])+')vm.runInContext(fs.readFileSync(root+"/harness/"+h,"utf8"),ctx,{timeout:1000});vm.runInContext((strict==="strict"?"\\\"use strict\\\";\\n":"")+fs.readFileSync(file,"utf8"),ctx,{timeout:1000});';const argv=['--no-global-search-paths','-e',source,test262Root,join(test262Root,'test',prefix+name),variant];const start=new Date().toISOString();const result=spawnSync(node,argv,{cwd,encoding:'utf8',timeout:10000});runs.push({variant,argv,cwd,start,end:new Date().toISOString(),timeoutMs:10000,environment:{NODE_OPTIONS:process.env.NODE_OPTIONS,NODE_PATH:process.env.NODE_PATH},status:result.status,signal:result.signal,error:result.error&&String(result.error),stdout:result.stdout,stderr:result.stderr});expect(result.status).toBe(0);}rows.push({path:prefix+name,sha256:createHash('sha256').update(f.contents).digest('hex'),attrs:f.attrs,runs});}
 expect(rows).toHaveLength(43);const dir=process.env.PROPHET_P012_LOG_ROOT||join(cwd,'logs/p012/candidates');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'native-whole.json'),JSON.stringify(rows,null,2));
},30000);
test('whole upstream VM dispositions',()=>{const rows:any[]=[];for(const name of readdirSync(join(test262Root,'test',prefix)).filter(n=>n.endsWith('.js')).sort()){const f=loadTest262(prefix+name),runs:any[]=[];for(const variant of ['sloppy','strict'] as Array<'sloppy'|'strict'>){let error:any;try{runTest262Variant(f,variant);}catch(e){error=e;}if(activeCandidates.includes(name))expect(error).toBeUndefined();else expect(error).toBeDefined();runs.push({variant,kind:error?'inactive':'supported',error:error&&{name:error.name,message:error.message,stack:error.stack}});}rows.push({path:prefix+name,sha256:createHash('sha256').update(f.contents).digest('hex'),attrs:f.attrs,runs});}const dir=process.env.PROPHET_P012_LOG_ROOT||join(cwd,'logs/p012/candidates');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'vm-whole.json'),JSON.stringify(rows,null,2));expect(rows).toHaveLength(43);});

test("unchanged mrmime lookup native output and completed activation", () => {
  const module = readFileSync(join(__dirname,"fixtures/mrmime-2.0.1/package/index.js"),"utf8");
  const result = compareModuleGraph({"entry.cjs":'const mime=require("./mrmime");module.exports=mime.lookup("hello.txt")==="text/plain"&&mime.lookup(" TXT ")==="text/plain"&&mime.lookup("thing.JSON")==="application/json";',"mrmime.js":module});
  expect(result.loaded).toMatchObject({type:"boolean",value:true});
  const records = Array.from(result.context.value.environments.values()).filter(record => record.has("tmp") && record.has("idx"));
  expect(records).toHaveLength(3);
  expect(records[0].get("tmp")!.value).toMatchObject({value:"hello.txt"});
  expect(records[0].get("idx")!.value).toMatchObject({value:6});
});
test("deferred callee lookup precedes argument increment", () => {
  const [done,state]=run('let idx=5;const n="hello.txt".indexOf(++idx);');
  expect(done).toMatchObject({type:"ExecutionBoundary",message:"String.prototype.indexOf is not yet supported"});
  expect(state.value.scope.idx).toMatchObject({value:5});
});
test("finite explicit undefined end differs from returned undefined", () => {
  const [done,state]=run('const end=a?undefined:{valueOf(){return undefined;}};const n="abcd".substring(2,end);const valid=a?n==="cd":n==="ab";const unknown=n==="cd";', {a:ESBoolean()});
  expect(done).toBe(Undefined);expect(state.value.scope.valid).toMatchObject({value:true});expect((state.value.scope.unknown as any).value).toBeUndefined();
});
for(const operand of ["receiver","start","end"]) test("wrapper admission "+operand,()=>{
  const input=ESObject({});(input as any).stringData=true;
  const [done,state]=run(`let trace="";input.toString=function(){trace="wrong";return "abc";};input.valueOf=function(){trace="wrong";return 1;};const n=String.prototype.substring.call(${operand==="receiver"?"input":'"abc"'},${operand==="start"?"input":"0"},${operand==="end"?"input":"2"});`,{input});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(state.value.scope.trace).toMatchObject({value:""});
});
test("current inherited numeric fallback mutation",()=>{
  const source='function C(){}C.prototype.valueOf=function(){this.n=1;C.prototype.toString=a?function(){return this.n===1?"2":"wrong";}:function(){return undefined;};return {};};C.prototype.toString=function(){throw "old";};const x=new C();const n="abcdef".substring(x,4);const valid=a?n==="cd":n==="abcd";';
  const [done,state]=run(source,{a:ESBoolean()});expect(done).toBe(Undefined);expect(state.value.scope.valid).toMatchObject({value:true});
  for(const a of [false,true])withModuleFixture('const a='+a+';'+source+'module.exports=valid;',file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}}));
});

for (const input of [{type:"bigint",value:"9007199254740993"} as any,{type:"symbol"} as any,{type:"exotic"} as any]) {
  for (const operand of ["receiver","start","end"]) test(`late ${input.type} ${operand} retains console, supported and guest-throw alternatives`,()=>{
    const console=createConsoleModel();
    const result=run(`let trace="",caught=false,cleaned=false;const box={n:0},alias=box;
      const r={toString(){trace="r";alias.n=7;console.log("r");${operand==="receiver"?'if(b)throw "G";return a?input:"abcdef";':'return "abcdef";'}}};
      const start={valueOf(){trace=trace+"s";console.log("s");${operand==="start"?'if(b)throw "G";return a?input:2;':'return 2;'}}};
      const end={valueOf(){trace=trace+"e";console.log("e");${operand==="end"?'if(b)throw "G";return a?input:4;':'return 4;'}}};
      try{const n=String.prototype.substring.call(r,start,end);trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("f");}`,
      {input,a:ESBoolean(),b:ESBoolean(),console:console.module});
    const all=leaves(result),prefix=operand==="receiver"?"r":operand==="start"?"rs":"rse";
    expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
    for(const [value,state] of all){
      const stopped=value.type==="ExecutionBoundary";
      if(stopped){expect(value.kind).toBe("unsupported");expect(state.value.scope.trace).toMatchObject({value:prefix});expect(state.value.scope.caught).toMatchObject({value:false});}
      else {const [done,after]=evaluateCode(`const valid=b?caught==="G"&&trace===${literal(prefix)}:!caught&&trace==="rsecd";`,state);expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});}
      expect(state.value.scope.cleaned).toMatchObject({value:!stopped});
      expect(console.inspectOutput(state).every(p=>p.chunks.length===(stopped?prefix.length:(state.value.scope.trace as any).value==="rsecd"?4:prefix.length+1))).toBe(true);
      const [done,after]=evaluateCode('const valid=box.n===7;',state);expect(done).toBe(Undefined);expect(after.value.scope.valid).toMatchObject({value:true});
    }
  });
}
for(const length of [65535,65536])test("whole bounded copy "+length,()=>{
  const text="x".repeat(length-2)+"😀";const [done,state]=run('const n=input.substring();',{input:ESString(text)});
  expect(done).toBe(Undefined);expect(state.value.scope.n).toMatchObject({value:text});
});
