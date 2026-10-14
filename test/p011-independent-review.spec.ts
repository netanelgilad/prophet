import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { copySync } from "fs-extra";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { ESString } from "../src/string/String";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";

// Independent frozen-source review: b920a64c9679cc537ec74d708b7647c268b6cd8e.
const root=join(__dirname,"..");
const logs=join(root,"logs/p011-independent",process.env.PROPHET_REVIEW_RUN||"manual");
let sequence=0;
function native(body:string,input:any=null):any {
  mkdirSync(logs,{recursive:true});
  const binary=process.env.PROPHET_NODE_BINARY||process.execPath;
  const source='if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(require("fs").readFileSync(0,"utf8"));'+body;
  const argv=["--no-global-search-paths","-e",source];
  const start=new Date().toISOString();
  const child=spawnSync(binary,argv,{cwd:root,input:JSON.stringify(input),encoding:"utf8",timeout:20000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
  const prefix=join(logs,"native-"+sequence++);
  writeFileSync(prefix+".json",JSON.stringify({binary,argv,cwd:root,input,start,end:new Date().toISOString(),timeoutMs:20000,env:{NODE_OPTIONS:"",NODE_PATH:""},status:child.status,signal:child.signal,error:child.error&&String(child.error)},null,2));
  writeFileSync(prefix+".stdout",child.stdout);writeFileSync(prefix+".stderr",child.stderr);
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");return JSON.parse(child.stdout);
}
function run(source:string,inputs:{[key:string]:Any}={}){return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));}
function both(source:string){expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',source)).toBe(true);const[d,s]=run(source);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function spelling(n:number){return Number.isNaN(n)?"NaN":Object.is(n,-0)?"-0":String(n);}

test("independent systematic signed32 and IEEE exponent matrix",()=>{
  // Bounded preparation: fixed 6 centers x 2 signs x 17 offsets and 210 exponents.
  const values=[NaN,Infinity,-Infinity,0,-0,Number.MIN_VALUE,-Number.MIN_VALUE,Number.MAX_VALUE,-Number.MAX_VALUE];
  for(const center of [0,Math.pow(2,31),Math.pow(2,32),Math.pow(2,33),Math.pow(2,52),Math.pow(2,53)])
    for(const sign of [-1,1])for(const delta of [-4,-3,-2,-1.5,-1,-0.9,-0.5,-0.1,0,0.1,0.5,0.9,1,1.5,2,3,4])values.push(sign*(center+delta));
  for(let e=-1074;e<=1023;e+=10)for(const sign of [-1,1])for(const mantissa of [1,1.5,1.9999999999999998])values.push(sign*mantissa*Math.pow(2,e));
  const rows=Array.from(new Set(values.map(spelling)));
  const expected=native('process.stdout.write(JSON.stringify(input.map(s=>{const x=Function("return ("+s+")")();const n=~x;return {n,positiveZero:!Object.is(n,-0),twice:~~x};})));',rows);
  rows.forEach((text,i)=>{const input=Function("return ("+text+")")();const[d,s]=run('const n=~input;const twice=~n;',{input:ESNumber(input)});
    expect(d).toBe(Undefined);expect((s.value.scope.n as any).value).toBe(expected[i].n);expect(Object.is((s.value.scope.n as any).value,-0)).toBe(false);expect((s.value.scope.twice as any).value).toBe(expected[i].twice);
    if(i<213||i%31===0){const[c,t]=run(`const n=~(${text});`);expect(c).toBe(Undefined);expect((t.value.scope.n as any).value).toBe(expected[i].n);}});
  writeFileSync(join(logs,"matrix.json"),JSON.stringify({rows,expected},null,2));console.log("P011_REVIEW_MATRIX",rows.length);
},30000);

test("independent primitive grammar conversions",()=>{
  const rows=['true','false','null','undefined','""','"\\t\\n  -4294967297.9 "','"0x80000000"','"0Xffffffff"','"0b111"','"0o777"','"+0x1"','"-0x1"','"1e309"','"-0"','"NaN"','"1n"','"1_0"','"5\\u0000"','"\\ufeff2\\u00a0"'];
  const expected=native('process.stdout.write(JSON.stringify(input.map(s=>~Function("return "+s)())));',rows);
  rows.forEach((s,i)=>{const[d,t]=run(`const n=~(${s});`);expect(d).toBe(Undefined);expect((t.value.scope.n as any).value).toBe(expected[i]);});
});

const effects=[
 'let trace="";const box={n:1};function operand(){trace="o";box.n=8;return box;}box.valueOf=function(){trace=trace+"v";return this.n;};const n=~operand();const answer=n===-9&&trace==="ov";',
 'let trace="";const x={valueOf(){trace="v";this.toString=function(){trace=trace+"s";return "4294967297.9";};return function(){};},toString(){throw "stale";}};const answer=~x===-2&&trace==="vs";',
 'let trace="";const x={valueOf:false,toString(){trace="s";return -1.9;}};const answer=~x===0&&trace==="s";',
 'let trace="";const x={valueOf(){trace="v";return {};},toString(){trace=trace+"s";return [];}};let caught=false;try{~x;}catch(e){caught=e instanceof TypeError;}const answer=caught&&trace==="vs";',
 'let trace="";const x={valueOf(){trace="v";throw "guest";},toString(){trace="bad";}};let caught=false;try{~x;}catch(e){caught=e==="guest";}finally{trace=trace+"f";}const answer=caught&&trace==="vf";',
 'let trace="";const x={valueOf(){trace="v";return {};},toString(){trace=trace+"s";throw "guest";}};let caught=false;try{~x;}catch(e){caught=e==="guest";}const answer=caught&&trace==="vs";',
 'let count=0;const x={valueOf(){count=count+1;return count;}};const alias=x;const first=~x;const second=~alias;const answer=first===-2&&second===-3&&count===2;',
 'function C(){}C.prototype.valueOf=function(){this.n=4;C.prototype.toString=function(){return this.n;};return {};};const x=new C();const answer=~x===-5&&x.n===4;',
 'let trace="";const x={valueOf(){trace="v";return {};},toString:null};let caught=false;try{~x;}catch(e){caught=e instanceof TypeError;}const answer=caught&&trace==="v";',
 'let trace="";const x={valueOf(){trace="v";return undefined;},toString(){throw "bad";}};const answer=~x===-1&&trace==="v";',
 'let mark=0;function operand(){mark=1;throw "O";}let caught=false;try{~operand();}catch(e){caught=e==="O";}const answer=caught&&mark===1;',
 'function C(){}const x=new C();const answer=!false&&+"3"===3&&-3===-3&&typeof missing==="undefined"&&void x===undefined&&x instanceof C&&2+3===5&&9/3===3&&7%4===3;'
];
effects.forEach((s,i)=>test("independent native effect protocol "+i,()=>both(s)));

test("independent finite two-condition fallback correlations and mandatory unknown",()=>{
 const source='let count=0;const x={valueOf(){count=count+1;if(a)return b?2147483648:-1;this.toString=b?function(){return "4294967297";}:function(){return null;};return {};}};const n=~x;const answer=count===1&&(a?(b?n===2147483647:n===0):(b?n===-2:n===-1));const unknown=n===-1;';
 for(const a of [false,true])for(const b of [false,true])both(`const a=${a},b=${b};`+source);
 const[d,s]=run(source,{a:ESBoolean(),b:ESBoolean()});expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();
});

test("independent persistent prototype aliases and prior snapshot",()=>{
 const[d,before]=run('function C(){}C.prototype.valueOf=function(){return 7;};const x=new C(),alias=x;');expect(d).toBe(Undefined);
 const[e,after]=evaluateCode('if(a)C.prototype.valueOf=function(){this.mark=1;return -1;};const n=~alias;const answer=a?n===0&&x.mark===1:n===-8;',setVariablesInScope(before,{a:ESBoolean()}));expect(e).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});
 const[f,old]=evaluateCode('const n=~x;const answer=n===-8&&x.mark===undefined;',before);expect(f).toBe(Undefined);expect(old.value.scope.answer).toMatchObject({value:true});
});

for(const input of [ESNumber(),ESString(),{type:"bigint",value:"8"} as any,{type:"symbol"} as any,{type:"exotic"} as any,ESString(" ".repeat(65536)+"8")])
for(const stage of ["direct","valueOf","toString"])test(`independent ${input.type} ${stage} supported/throw/stop histories`,()=>{
 const console=createConsoleModel();
 const expr=stage==="direct"?'input':stage==="valueOf"?'{valueOf(){trace=trace+"v";box.n=2;console.log("v");return input;}}':'{valueOf(){trace=trace+"v";box.n=2;console.log("v");return {};},toString(){trace=trace+"s";box.n=3;console.log("s");return input;}}';
 const all=leaves(run(`let trace="",caught=false,cleaned=false;const box={n:0};function operand(){trace="o";box.n=1;console.log("o");if(b)throw "G";return a?${expr}:8;}try{const n=~operand();trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("f");}`,{input,a:ESBoolean(),b:ESBoolean(),console:console.module}));
 expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const[v,s]of all){const stop=v.type==="ExecutionBoundary";expect(s.value.scope.cleaned).toMatchObject({value:!stop});
  if(stop){expect(v.kind).toBe(input.type==="string"&&(input as any).value?"budget":"unsupported");expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.trace).toMatchObject({value:stage==="direct"?"o":stage==="valueOf"?"ov":"ovs"});const[d,t]=evaluateCode(`const check=box.n===${stage==="direct"?1:stage==="valueOf"?2:3};`,s);expect(d).toBe(Undefined);expect(t.value.scope.check).toMatchObject({value:true});}
  else{const[d,t]=evaluateCode('const check=b?caught==="G"&&trace==="o":!caught&&trace==="o-9";',s);expect(d).toBe(Undefined);expect(t.value.scope.check).toMatchObject({value:true});}
  expect(console.inspectOutput(s).every(p=>p.chunks.length===(stop?(stage==="direct"?1:stage==="valueOf"?2:3):2))).toBe(true);
 }
});

test("independent exact local parse cap with native oversized witness",()=>{
 const rows=[65535,65536,65537].map(n=>" ".repeat(n-1)+"9");
 expect(native('process.stdout.write(JSON.stringify(input.map(x=>~x)));',rows)).toEqual([-10,-10,-10]);
 for(const value of rows)for(const late of [false,true]){const[d,s]=run(`let mark=0;const x=${late?'{valueOf(){mark=1;return {};},toString(){mark=2;return input;}}':'input'};const n=~x;`,{input:ESString(value)});expect(s.value.scope.mark).toMatchObject({value:late?2:0});if(value.length>65536)expect(d).toMatchObject({kind:"budget",type:"ExecutionBoundary"});else{expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:-10});}}
});

test("independent own/inherited symbol absence shadowing and custom hooks",()=>{
 expect(native('const f=h=>h==="number"?8:0;let caught=false;try{~{[Symbol.toPrimitive]:3};}catch(e){caught=e instanceof TypeError;}process.stdout.write(JSON.stringify(caught&&~{[Symbol.toPrimitive]:f}===-9&&~Object.create({[Symbol.toPrimitive]:f})===-9));')).toBe(true);
 for(const inherited of [false,true])for(const hook of [Undefined,ESNull,ESNumber(3)]){
  const x=ESObject({}),p=ESObject({});x.prototype=p;(inherited?p:x).wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);
  const[d,s]=run('let mark=0;input.valueOf=function(){mark=1;return 8;};const n=~input;',{input:x});
  if(hook===Undefined||hook===ESNull){expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:-9});}else{expect(d).toMatchObject({kind:"unsupported"});expect(s.value.scope.mark).toMatchObject({value:0});}
 }
 const p=ESObject({}),x=ESObject({});x.prototype=p;p.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(3)]]);x.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
 const[d,s]=run('input.valueOf=function(){return 8;};const n=~input;',{input:x});expect(d).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:-9});
});

test("independent excluded native primitive/exotic controls",()=>{
 expect(native('const a=[],f=function(){};a.valueOf=f.valueOf=()=>8;let symbol=false;try{~Symbol();}catch(e){symbol=e instanceof TypeError;}process.stdout.write(JSON.stringify(~a===-9&&~f===-9&&~Object("8")===-9&&~8n===-9n&&~{valueOf(){return 8n;}}===-9n&&~{valueOf(){return {};},toString(){return 8n;}}===-9n&&symbol));')).toBe(true);
 for(const expression of ['[]','function(){}']){const all=leaves(run(`let mark=0;const x=${expression};x.valueOf=function(){mark=9;return 8;};if(a){mark=1;const n=~x;}else mark=2;`,{a:ESBoolean()}));expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.mark).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:2});}
 const wrapper=ESObject({});(wrapper as any).stringData=true;expect(run('const n=~input;',{input:wrapper})[0]).toMatchObject({kind:"unsupported"});
});

test("independent reached BigInt metadata prevents fabricated Number across literal forms",()=>{
 const literals=['0n','1n','0xffn','0XABn','0b101n','0B11n','0o77n','0O10n','9007199254740993n'];
 const rows:any[]=[];
 for(const literal of literals){const ast:any=parseECMACompliant(literal+';');const node=ast.body[0].expression;expect(Object.prototype.hasOwnProperty.call(node,"bigint")).toBe(true);rows.push({literal,node});
  for(const expression of [literal,`{valueOf(){mark=2;return ${literal};}}`,`{valueOf(){mark=2;return {};},toString(){mark=3;return ${literal};}}`]){
   const all=leaves(run(`let mark=0,caught=false,cleaned=false;if(a){try{mark=1;const n=~(${expression});mark=9;}catch(e){caught=true;}finally{cleaned=true;}}else mark=4;`,{a:ESBoolean()}));expect(all).toHaveLength(2);const[v,s]=all.find(([v])=>v.type==="ExecutionBoundary");expect(v).toMatchObject({kind:"unsupported",message:"BigInt literal evaluation is not yet supported"});expect(s.value.scope.mark).toMatchObject({value:expression.includes("toString")?3:expression.includes("valueOf")?2:1});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:4});
  }
 }
 expect(native('process.stdout.write(JSON.stringify(input.map(s=>typeof Function("return "+s)()==="bigint")));',literals)).toEqual(literals.map(()=>true));
 mkdirSync(logs,{recursive:true});writeFileSync(join(logs,"bigint-parser.json"),JSON.stringify(rows,null,2));
 const[d,s]=run('let mark=1;const x=1n;mark=2;');expect(d).toMatchObject({kind:"unsupported"});expect(s.value.scope.mark).toMatchObject({value:1});
 both('function unused(){return 1n;}const flagged=/a/i;const answer=0xff===255&&0b101===5&&0o77===63&&1.5===1.5&&"1n"==="1n"&&/1n/.test("1n")&&typeof flagged==="object";');
 for(const expression of ['1','"1n"','/1n/'])expect(Object.prototype.hasOwnProperty.call((parseECMACompliant(expression+';').body[0] as any).expression,"bigint")).toBe(false);
});

test("independent prior unsupported operand bypass and disclosed legacy embedding checkpoints",()=>{
 const[d,s]=run('let mark=0;function operand(){mark=1;return "x".indexOf;}const n=~operand();');expect(d).toMatchObject({message:"String.prototype.indexOf is not yet supported"});expect(s.value.scope.mark).toMatchObject({value:1});
 for(const category of ["partial","cycle"]){const input=ESObject({});if(category==="partial")input.unknownProperties="partial";else input.prototype=input;let error:any;try{run('let mark=1;const n=~input;',{input});}catch(e){error=e;}expect(error).toBeDefined();expect(error.message).toMatch(category==="partial"?/Unmodeled host/:/Cyclic/);expect(analysisFailureContext(error)!.value.scope.mark).toMatchObject({value:1});}
});

test("independent unmarked noncomputed BigInt keys cannot supply fabricated Number operands",()=>{
 const programs=[
  'const x={9007199254740993n:8};const n=~x["9007199254740993"];',
  'const {9007199254740993n:x}={"9007199254740993":8};const n=~x;'
 ];
 const expected=native('process.stdout.write(JSON.stringify(input.map(s=>Function(s+"return n;")())));',programs);expect(expected).toEqual([-9,-9]);
 const observations=programs.map(source=>{try{const[d,s]=run(source);return {source,completion:(d as any).type,message:(d as any).message,n:(s.value.scope.n as any)&& (s.value.scope.n as any).value};}catch(e){return {source,error:String(e)};}});
 writeFileSync(join(logs,"bigint-key-observations.json"),JSON.stringify({expected,observations},null,2));
 observations.forEach((r,i)=>{if(r.completion==="undefined")expect(r.n).toBe(expected[i]);else expect(r.completion==="ExecutionBoundary"||!!r.error).toBe(true);});
});

test("independent actual unchanged sirv CLI every FS history and measured Stats-size frontier",()=>{
 const directory=join(logs,"sirv");mkdirSync(directory,{recursive:true});
 for(const[fixture,name]of [["sirv-3.0.2","sirv"],["mrmime-2.0.1","mrmime"],["totalist-3.0.1","totalist"],["polka-url-1.0.0-next.29","@polka/url"]]){const base=join(__dirname,"fixtures",fixture);const manifest=JSON.parse(readFileSync(join(base,"integrity.json"),"utf8"));for(const file of Object.keys(manifest.files))expect(createHash("sha256").update(readFileSync(join(base,file))).digest("hex")).toBe(manifest.files[file]);copySync(join(base,"package"),join(directory,"node_modules",name));}
 mkdirSync(join(directory,"site"),{recursive:true});writeFileSync(join(directory,"site/hello.txt"),"hello from sirv\n");writeFileSync(join(directory,"entry.cjs"),'module.exports=require("sirv")("./site");');
 const binary=process.env.PROPHET_NODE_BINARY||process.execPath,argv=[join(root,"bin/prophet.js"),"--","entry.cjs"],start=new Date().toISOString();
 const child=spawnSync(binary,argv,{cwd:directory,encoding:"utf8",timeout:60000,maxBuffer:80*1024*1024,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
 writeFileSync(join(logs,"cli.stdout.json"),child.stdout);writeFileSync(join(logs,"cli.stderr.log"),child.stderr);writeFileSync(join(logs,"cli-command.json"),JSON.stringify({binary,argv,cwd:directory,start,end:new Date().toISOString(),timeoutMs:60000,env:{NODE_OPTIONS:"",NODE_PATH:""},status:child.status,signal:child.signal,error:child.error&&String(child.error)},null,2));
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");
 const graph=JSON.parse(child.stdout);expect(Object.keys(graph).sort()).toEqual(["nodes","roots"]);const nodes=new Map<string,any>(graph.nodes.map((n:any)=>[n.id,n]));const field=(r:any,k:string)=>{const pair=nodes.get(r.ref).entries.find(([name]:[string])=>name===k);return pair&&pair[1];};
 const completion=graph.roots.completion;expect(field(completion,"type")).toBe("ForkedCompletion");
 const all=[field(completion,"consequent"),field(completion,"alternate")];expect(all.map(l=>field(field(l,"0"),"type")).sort()).toEqual(["ThrownValue","function"]);
 const records:any[]=[];
 for(const leaf of all){const value=field(leaf,"0"),state=field(leaf,"1"),stop=field(value,"type")==="function";
  if(stop){// The healthy leaf is the returned request handler closure.
   // Completed mrmime activation records remain; these are not current sirv locals.
   const envs=nodes.get(field(state,"environments").ref).entries;let tmp:any,idx:any;
   for(const [,record]of envs){for(const name of ["tmp","idx"]){const binding=nodes.get(record.ref).entries.find(([key]:[string])=>key===name);if(binding){if(name==="tmp")tmp=field(binding[1],"value");else idx=field(binding[1],"value");}}if(tmp&&idx)break;}
   expect(field(tmp,"value")).toBe("hello.txt");expect(field(idx,"value")).toBe(6);
   let ctype:any;for(const[,record]of envs){const binding=nodes.get(record.ref).entries.find(([key]:[string])=>key==="ctype");if(binding){ctype=binding;break;}}expect(ctype).toBeDefined();expect(field(field(ctype[1],"value"),"value")).toBe("text/plain");
   
  }else expect(field(field(field(field(value,"value"),"properties"),"code"),"value")).toBe("EMFILE");
  function paths(r:any):any[][]{const kind=field(r,"kind");if(kind==="empty")return [[]];if(kind==="choice")return paths(field(r,"consequent")).concat(paths(field(r,"alternate")));expect(kind).toBe("event");return paths(field(r,"previous")).map(p=>p.concat([field(r,"event")]));}
  const histories=paths(field(state,"effects"));expect(histories.length).toBeGreaterThan(0);
  for(const history of histories){const events=history.map(e=>({kind:field(e,"kind"),call:field(e,"call"),operation:field(field(e,"call"),"operation")})).filter(e=>e.operation.startsWith("fs."));expect(events.map(e=>[e.operation,e.kind])).toEqual(stop?[["fs.readdirSync","call"],["fs.readdirSync","return"],["fs.statSync","call"],["fs.statSync","return"],["fs.Stats.isDirectory","call"],["fs.Stats.isDirectory","return"]]:[["fs.readdirSync","call"],["fs.readdirSync","throw"]]);for(let i=0;i<events.length;i+=2)expect(events[i].call.ref).toBe(events[i+1].call.ref);records.push({stop,events});}
 }
 writeFileSync(join(logs,"cli-histories.json"),JSON.stringify(records,null,2));
},70000);
