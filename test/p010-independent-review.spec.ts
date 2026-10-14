import { spawnSync } from "child_process";
import { join } from "path";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { copySync } from "fs-extra";
import { createHash } from "crypto";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESString } from "../src/string/String";
import { stringLastIndexOf } from "../src/string/lastIndexOf";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { Any, ESNull, ESNumber, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { loadTest262, runTest262Variant } from "./test262/runner";

// Independent review of fcb650fdaf3c1994e2d01beb6a2984592d964965.
// Every native expectation is computed in a separate pinned process before VM use.
const root = join(__dirname, "..");
const logRoot = join(root, "logs/p010-independent", process.env.PROPHET_REVIEW_RUN || "manual");
let sequence = 0;
function native(body: string, input: any = null): any {
  mkdirSync(logRoot, {recursive:true});
  const source = 'if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(require("fs").readFileSync(0,"utf8"));' + body;
  const binary = process.env.PROPHET_NODE_BINARY || process.execPath;
  const child = spawnSync(binary, ["-e", source], {cwd:root, input:JSON.stringify(input), encoding:"utf8", timeout:20000,
    maxBuffer:16*1024*1024, env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
  const prefix = join(logRoot, "native-" + sequence++);
  writeFileSync(prefix+".json", JSON.stringify({binary,argv:["-e",source],cwd:root,input,status:child.status,signal:child.signal,error:child.error&&String(child.error)},null,2));
  writeFileSync(prefix+".stdout",child.stdout); writeFileSync(prefix+".stderr",child.stderr);
  expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}
function run(source:string, inputs:{[key:string]:Any}={}) { return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs)); }
function both(source:string) {
  expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',source)).toBe(true);
  const [done,state]=run(source);expect(done).toBe(Undefined);expect(state.value.scope.answer).toMatchObject({value:true});
}
function leaves(result:any):any[] {return isForkedCompletion(result[0])?leaves(result[0].consequent).concat(leaves(result[0].alternate)):[result];}
const quote=(s:string)=>JSON.stringify(s).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");

test("independent native UTF-16 position cross product, direct and parsed",()=>{
  const texts=["","a","ababa","aaaaaa","abcabc","undefinednulltrue123", "éÉe\u0301é","\0a\0", "😀x😀", "\ud800a\udc00\ud800", "\udc00\ud800\udc00", "\uffff\u2028\u2029"];
  const needles=["","a","aba","aa","bc","absent","undefined","null","é","e\u0301","😀","\ud800","\udc00","\ude00","\0"];
  const positions=["","undefined","NaN","null","true","false",'"2.9"','"no"','"0x3"',"-Infinity","Infinity","-9","-0.9","-0","0","0.9","1.9","2","3.9","99"];
  const rows:any[]=[]; for(const text of texts)for(const needle of needles)for(const position of positions)rows.push({text,needle,position});
  const expected=native('process.stdout.write(JSON.stringify(input.map(r=>r.position===""?r.text.lastIndexOf(r.needle):r.text.lastIndexOf(r.needle,Function("return "+r.position)()))));',rows);
  rows.forEach((r,i)=>{
    const args:Any[]=[ESString(r.needle)];
    if(r.position!=="") {const p=Function("return "+r.position)();args.push(p===undefined?Undefined:p===null?ESNull:typeof p==="number"?ESNumber(p):typeof p==="boolean"?ESBoolean(p):ESString(p));}
    const result=stringLastIndexOf(ESString(r.text),args,nodeInitialExecutionContext).next();
    expect(result.done).toBe(true);expect((result.value as any)[0].value).toBe(expected[i]);
    if(i%13===0 || r.position==="-0") {
      const [done,after]=run(`const answer=${quote(r.text)}.lastIndexOf(${quote(r.needle)}${r.position?","+r.position:""});`);
      expect(done).toBe(Undefined);expect((after.value.scope.answer as any).value).toBe(expected[i]);
    }
  });
  both('const answer="undefined".lastIndexOf()===0 && "abc".lastIndexOf("",-0)===0 && 1/"abc".lastIndexOf("",-0)===Infinity;');
  console.log("INDEPENDENT_UTF16_MATRIX",rows.length);
},30000);

const programs=[
  `let trace="";const old=String.prototype.lastIndexOf;
   function arg(x){trace=trace+x;String.prototype.lastIndexOf=function(){"use strict";return 88;};return 2;}
   const r={toString(){trace=trace+"r";return "ababa";}};
   const s={toString(){trace=trace+"s";return "aba";}};const p={valueOf(){trace=trace+"p";return 2;}};
   const n=old.call(r,s,p,arg("x"));const answer=n===2&&trace==="xrsp"&&"a".lastIndexOf("")===88&&old.call("aba","a")===2;`,
  `function C(){};C.prototype.toString=function(){this.mark="r";C.prototype.valueOf=function(){return this.mark+"aba";};return {};};
   const r=new C();const s={toString(){p.valueOf=function(){p.toString=function(){return "3.9";};return {};};return "a";}};
   const p={valueOf(){throw "old";},toString(){throw "old";}};
   const answer=String.prototype.lastIndexOf.call(r,s,p)===3;`,
  `let trace="";const p={valueOf(){trace=trace+"v";return {};},toString(){trace=trace+"s";return undefined;}};
   const answer="ababa".lastIndexOf("aba",p)===2&&trace==="vs";`,
  `let trace="";const p={valueOf:null,toString(){trace="s";return false;}};const answer="aba".lastIndexOf("a",p)===0&&trace==="s";`,
  `const f=String.prototype.lastIndexOf,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}
   const answer=caught&&f.name==="lastIndexOf"&&f.length===1&&f.prototype===undefined&&own.call(f,"name")&&own.call(f,"length")&&!own.call(f,"prototype")&&!own.call(f,"call")&&f.call(12321,2)===3;`,
  `let mark=0,caught=false;function extra(){mark=1;throw "arg";}try{String.prototype.lastIndexOf.call(null,"a",0,extra());}catch(e){caught=e==="arg";}
   const answer=caught&&mark===1;`,
  `let mark=0,caught=false;const x={toString(){mark=1;return "a";}};try{String.prototype.lastIndexOf.call(undefined,x);}catch(e){caught=e instanceof TypeError;}
   const answer=caught&&mark===0;`,
  `let trace="",caught=false;try{"a".lastIndexOf("long needle",{valueOf(){trace="v";return {};},toString(){trace=trace+"s";throw "end";}});}catch(e){caught=e==="end";}
   const answer=caught&&trace==="vs";`
];
programs.forEach((s,i)=>test("independent native ordinary coercion/identity "+i,()=>both(s)));
for(const stage of ["receiver","search","position"])test("independent abrupt conversion "+stage,()=>both(`
 let trace="",caught=false;const r={toString(){trace=trace+"r";${stage==="receiver"?'throw "stop";':'return "ababa";'}}};
 const s={toString(){trace=trace+"s";${stage==="search"?'throw "stop";':'return "aba";'}}};
 const p={valueOf(){trace=trace+"p";throw "stop";}};
 try{String.prototype.lastIndexOf.call(r,s,p);}catch(e){caught=e==="stop";}
 const answer=caught&&trace===${quote(stage==="receiver"?"r":stage==="search"?"rs":"rsp")};`));

test("independent correlated receiver/search/position choices prove only justified result",()=>{
  const source=`let calls=0;const r={toString(){calls=calls+1;return a?"ababa":"😀😀";}};
   const s={toString(){calls=calls+1;return a?"aba":"😀";}};const p={valueOf(){calls=calls+1;return b?0:Infinity;}};
   const n=String.prototype.lastIndexOf.call(r,s,p);const answer=calls===3&&(b?n===0:n===2);const unknown=n===0;`;
  for(const a of [false,true])for(const b of [false,true])both(`const a=${a},b=${b};`+source);
  const [done,after]=run(source,{a:ESBoolean(),b:ESBoolean()});expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
});

for(const operand of ["receiver","search"])for(const oversized of [false,true])test(`independent late ${operand} ${oversized} branches effects and current heap`,()=>{
  const console=createConsoleModel();
  const source=`let trace="",caught=false,cleaned=false;const saved=String.prototype.lastIndexOf;const box={n:0};
   const r={toString(){trace="r";console.log("r");return ${operand==="receiver"?'a?input:"aba"':'"aba"'};}};
   const s={toString(){trace=trace+"s";console.log("s");return ${operand==="search"?'a?input:"a"':'"a"'};}};
   const p={valueOf(){trace=trace+"p";console.log("p");box.n=7;String.prototype.lastIndexOf=function(){"use strict";return 9;};if(b)throw "P";return 2;}};
   try{const n=saved.call(r,s,p);trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}`;
  const result=run(source,{input:ESString(oversized?"a".repeat(65537):undefined),a:ESBoolean(),b:ESBoolean(),console:console.module});
  const all=leaves(result);expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
  for(const [v,state]of all){const stop=v.type==="ExecutionBoundary";
    if(stop){expect(v.kind).toBe(oversized?"budget":"unsupported");expect(state.value.scope.trace).toMatchObject({value:"rsp"});expect(state.value.scope.caught).toMatchObject({value:false});}
    expect(state.value.scope.cleaned).toMatchObject({value:!stop});
    expect(console.inspectOutput(state).every(path=>path.chunks.length===(stop?3:4))).toBe(true);
    const [done,current]=evaluateCode('const checked=box.n===7&&"x".lastIndexOf("")===9&&saved.call("aba","a")===2;',state);
    expect(done).toBe(Undefined);expect(current.value.scope.checked).toMatchObject({value:true});
    if(!stop){const [d,s]=evaluateCode('const valid=b?caught==="P"&&trace==="rsp":caught===false&&trace==="rsp2";',state);expect(d).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});}
  }
  // Concrete native controls for the same ordering and throws; open text is an explicit VM domain.
  both('const a=true,b=true,input="'+(oversized?'a'.repeat(65537):'abc')+'";const console={log(){}};'+source+'const answer=caught==="P"&&trace==="rsp"&&cleaned&&box.n===7;');
});

test("independent open receiver permits later search throw and position stays untouched",()=>{
 const [done,state]=run('let trace="",caught=false;try{String.prototype.lastIndexOf.call(input,{toString(){trace="s";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}const answer=caught==="S"&&trace==="s";',{input:ESString()});
 expect(done).toBe(Undefined);expect(state.value.scope.answer).toMatchObject({value:true});
});
test("independent open position is unknown even for empty text and needle",()=>{
 const [done,state]=run('let mark=0;const p={valueOf(){mark=1;return input;}};const n="".lastIndexOf("",p);',{input:ESNumber()});
 expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(state.value.scope.mark).toMatchObject({value:1});
});

test("independent inherited current heap and snapshot isolation",()=>{
 const [done,before]=run('function C(){}C.prototype.toString=function(){return "aba";};const r=new C();const f=String.prototype.lastIndexOf;',{a:ESBoolean()});expect(done).toBe(Undefined);
 const [next,after]=evaluateCode('if(a)C.prototype.toString=function(){return "bbb";};const n=f.call(r,"a");const answer=a?n===-1:n===2;',before);
 expect(next).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});
 const [old,snapshot]=evaluateCode('const n=f.call(r,"a");',before);expect(old).toBe(Undefined);expect(snapshot.value.scope.n).toMatchObject({value:2});
});

for(const where of ["receiver","search","position"])test("independent symbol guards and native witness "+where,()=>{
 for(const inherited of [false,true])for(const hook of [Undefined,ESNull,ESNumber(3)]){
  const proto=ESObject({}),input=ESObject({});if(inherited)input.prototype=proto;(inherited?proto:input).wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);
  const [done,state]=run(`input.toString=function(){return "aba";};input.valueOf=function(){return 2;};let trace="prefix";const n=String.prototype.lastIndexOf.call(${where==="receiver"?"input":'"ababa"'},${where==="search"?"input":'"a"'},${where==="position"?"input":"2"});`,{input});
  if(hook===Undefined||hook===ESNull){expect(done).toBe(Undefined);expect(state.value.scope.n).toMatchObject({value:2});}
  else{expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(state.value.scope.trace).toMatchObject({value:"prefix"});}
 }
 expect(native('const x=Object.create({[Symbol.toPrimitive](h){return h==="number"?2:"aba";}});process.stdout.write(JSON.stringify(String.prototype.lastIndexOf.call(input==="receiver"?x:"ababa",input==="search"?x:"a",input==="position"?x:2)));',where)).toBe(2);
});
for(const expression of ['String.prototype.lastIndexOf.bind','String.prototype.lastIndexOf.hasOwnProperty','String.prototype.lastIndexOf.caller','String.prototype.lastIndexOf.arguments','String.prototype.lastIndexOf.length=2','String.prototype.lastIndexOf.name="new"','Object.keys(String.prototype.lastIndexOf)','({...String.prototype.lastIndexOf})','"a".includes','"a".indexOf'])test("independent conservative metadata "+expression,()=>{
 const all=leaves(run(`let mark=0;if(a){mark=1;const n=(${expression});mark=2;}else mark=3;`,{a:ESBoolean()}));
 expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.mark).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:3});
});

test("independent lengths and exact comparison limit with native witnesses",()=>{
 const rows:any[]=[];for(const n of [65535,65536,65537])for(const operand of ["text","needle"])rows.push({text:operand==="text"?"a".repeat(n):"",needle:operand==="needle"?"a".repeat(n):"",budget:n>65536});
 for(const candidates of [16383,16384,16385])rows.push({text:"a".repeat(candidates+63),needle:"a".repeat(63)+"b",budget:candidates>16384});
 rows.push({text:"a".repeat(65536),needle:"a".repeat(32768),budget:false});
 const expected=native('process.stdout.write(JSON.stringify(input.map(r=>r.text.lastIndexOf(r.needle))));',rows);
 rows.forEach((r,i)=>{const [done,state]=run('let mark=0;const p={valueOf(){mark=1;return Infinity;}};const n=text.lastIndexOf(needle,p);',{text:ESString(r.text),needle:ESString(r.needle)});
  expect(state.value.scope.mark).toMatchObject({value:1});if(r.budget)expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});else{expect(done).toBe(Undefined);expect(state.value.scope.n).toMatchObject({value:expected[i]});}});
},15000);

// P011 migrates only the now-supported unary path; earlier stops/guest throws remain.
test("independent supported unary after operand fork preserves throw and sibling histories",()=>{
 const source='let mark=0,caught=false,cleaned=false,result;function operand(){mark=1;if(b)throw "G";return 5;}if(a){try{result=~operand();mark=2;}catch(e){caught=e;}finally{cleaned=true;}}else mark=3;';
 const [done,state]=run(source+'const valid=a?(b?caught==="G"&&mark===1:result===-6&&!caught&&mark===2)&&cleaned:mark===3&&!cleaned;',{a:ESBoolean(),b:ESBoolean()});
 expect(done).toBe(Undefined);expect(state.value.scope.valid).toMatchObject({value:true});
 for(const a of [false,true])for(const b of [false,true])expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',`const a=${a},b=${b};`+source+'const answer=a?(b?caught==="G"&&mark===1:result===-6&&!caught&&mark===2)&&cleaned:mark===3&&!cleaned;')).toBe(true);
 const [early,current]=run('let mark=0;function operand(){mark=1;return "x".indexOf;}const n=~operand();');expect(early).toMatchObject({type:"ExecutionBoundary",message:"String.prototype.indexOf is not yet supported"});expect(current.value.scope.mark).toMatchObject({value:1});
});

test("independent all whole upstream candidates in pinned native and whole A11 inactive blocker",()=>{
 const result=native(`const fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");const root=path.dirname(require.resolve("test262/package.json"));
 const dir=path.join(root,"test/built-ins/String/prototype/lastIndexOf");const files=fs.readdirSync(dir).filter(f=>f.endsWith(".js")).sort();const rows=[];
 for(const file of files){const source=fs.readFileSync(path.join(dir,file),"utf8");const parsed=require("test262-parser").parseFile({file,contents:source});const runs=[];
 for(const strict of [false,true]){const ctx=vm.createContext({});try{for(const h of ["sta.js","assert.js",...parsed.attrs.includes])vm.runInContext(fs.readFileSync(path.join(root,"harness",h),"utf8"),ctx,{timeout:1000});vm.runInContext((strict?'"use strict";\\n':"")+source,ctx,{timeout:1000,filename:file});runs.push({strict,exit:0});}catch(e){runs.push({strict,error:String(e)});}}
 rows.push({file,sha256:crypto.createHash("sha256").update(source).digest("hex"),attrs:parsed.attrs,runs});}process.stdout.write(JSON.stringify(rows));`);
 expect(result).toHaveLength(23);for(const row of result)for(const run of row.runs)expect(run.exit).toBe(0);
 const candidate=loadTest262("built-ins/String/prototype/lastIndexOf/S15.5.4.8_A11.js");for(const variant of ["sloppy","strict"] as Array<"sloppy"|"strict">)expect(()=>runTest262Variant(candidate,variant)).toThrow("Unfinished execution");
 writeFileSync(join(logRoot,"whole-candidates.json"),JSON.stringify(result,null,2));
 console.log("INDEPENDENT_CANDIDATES",23,46);
});

test("independent unchanged actual CLI retains every FS outcome, source frontier and computed index",()=>{
 const directory=join(logRoot,"sirv");mkdirSync(directory,{recursive:true});
 for(const [fixture,name]of [["sirv-3.0.2","sirv"],["mrmime-2.0.1","mrmime"],["totalist-3.0.1","totalist"],["polka-url-1.0.0-next.29","@polka/url"]]){
  const base=join(__dirname,"fixtures",fixture);const manifest=JSON.parse(readFileSync(join(base,"integrity.json"),"utf8"));
  for(const file of Object.keys(manifest.files))expect(createHash("sha256").update(readFileSync(join(base,file))).digest("hex")).toBe(manifest.files[file]);
  copySync(join(base,"package"),join(directory,"node_modules",name));
 }
 mkdirSync(join(directory,"site"),{recursive:true});writeFileSync(join(directory,"site/hello.txt"),"hello from sirv\n");writeFileSync(join(directory,"entry.cjs"),'module.exports=require("sirv")("./site");');
 const binary=process.env.PROPHET_NODE_BINARY||process.execPath,argv=[join(root,"bin/prophet.js"),"--","entry.cjs"];
 const child=spawnSync(binary,argv,{cwd:directory,encoding:"utf8",timeout:60000,maxBuffer:80*1024*1024,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
 writeFileSync(join(logRoot,"cli.stdout.json"),child.stdout);writeFileSync(join(logRoot,"cli.stderr.log"),child.stderr);writeFileSync(join(logRoot,"cli-command.json"),JSON.stringify({binary,argv,cwd:directory,status:child.status,signal:child.signal},null,2));
 expect(child.error).toBeUndefined();expect(child.status).toBe(2);expect(child.stderr).toBe("prophet: Unmodeled host property 'size': Node Stats fields\n");
 const graph=JSON.parse(child.stdout);expect(Object.keys(graph).sort()).toEqual(["nodes","roots"]);const nodes=new Map<string,any>(graph.nodes.map((n:any)=>[n.id,n]));
 const field=(ref:any,key:string)=>{const pair=nodes.get(ref.ref).entries.find(([name]:[string])=>name===key);return pair&&pair[1];};
 const completion=graph.roots.completion;expect(field(completion,"type")).toBe("ForkedCompletion");
 const all=[field(completion,"consequent"),field(completion,"alternate")];expect(all.map(l=>field(field(l,"0"),"type")).sort()).toEqual(["ExecutionBoundary","ThrownValue"]);
 for(const leaf of all){const value=field(leaf,"0"),state=field(leaf,"1"),stopped=field(value,"type")==="ExecutionBoundary";
  if(stopped){expect(field(value,"message")).toBe("Unmodeled host property 'size': Node Stats fields");expect(field(state,"sourceFile")).toMatch(/sirv\/build\.js$/);
   // Completed mrmime activation records remain; these are not current sirv locals.
   const envs=nodes.get(field(state,"environments").ref).entries;let tmp:any,idx:any;
   for(const [,record]of envs){for(const name of ["tmp","idx"]){const binding=nodes.get(record.ref).entries.find(([key]:[string])=>key===name);if(binding){if(name==="tmp")tmp=field(binding[1],"value");else idx=field(binding[1],"value");}}if(tmp&&idx)break;}
   expect(field(tmp,"value")).toBe("hello.txt");expect(field(idx,"value")).toBe(6);
   const currentRecord=envs.find(([key]:[any])=>key.ref===field(state,"environment").ref);const ctype=nodes.get(currentRecord[1].ref).entries.find(([key]:[string])=>key==="ctype");expect(field(field(ctype[1],"value"),"value")).toBe("text/plain");
  }else expect(field(field(field(field(value,"value"),"properties"),"code"),"value")).toBe("EMFILE");
  // Traverse trace edges only: heap snapshots may refer back to unrelated history.
  function paths(ref:any):any[][]{
   const kind=field(ref,"kind");
   if(kind==="empty")return [[]];
   if(kind==="choice")return paths(field(ref,"consequent")).concat(paths(field(ref,"alternate")));
   expect(kind).toBe("event");return paths(field(ref,"previous")).map(p=>p.concat([field(ref,"event")]));
  }
  const histories=paths(field(state,"effects"));expect(histories.length).toBeGreaterThan(0);
  for(const history of histories){
   const events=history.map(event=>({kind:field(event,"kind"),call:field(event,"call"),operation:field(field(event,"call"),"operation")})).filter(e=>e.operation.startsWith("fs."));
   expect(events.map(e=>[e.operation,e.kind])).toEqual(stopped?
    [["fs.readdirSync","call"],["fs.readdirSync","return"],["fs.statSync","call"],["fs.statSync","return"],["fs.Stats.isDirectory","call"],["fs.Stats.isDirectory","return"]]:
    [["fs.readdirSync","call"],["fs.readdirSync","throw"]]);
   for(let i=0;i<events.length;i+=2)expect(events[i].call.ref).toBe(events[i+1].call.ref);
  }
 }
},70000);

for(const where of ["receiver","search","position"])for(const expression of ['[]','function(){}'])test(`independent conservative ${expression} ${where}`,()=>{
 const call=`String.prototype.lastIndexOf.call(${where==="receiver"?"x":'"ababa"'},${where==="search"?"x":'"a"'},${where==="position"?"x":"2"})`;
 const setup=`let trace="";const x=${expression};x.toString=function(){trace=trace+"s";return "aba";};x.valueOf=function(){trace=trace+"v";return 2;};`;
 expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',setup+`const answer=${call}===2&&trace===${quote(where==="position"?"v":"s")};`)).toBe(true);
 const all=leaves(run(setup+`if(a){trace="prefix";const n=${call};trace="wrong";}else trace="sibling";`,{a:ESBoolean()}));
 expect(all).toHaveLength(2);const stopped=all.find(([v])=>v.type==="ExecutionBoundary");expect(stopped[0].kind).toBe("unsupported");expect(stopped[1].value.scope.trace).toMatchObject({value:"prefix"});expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});
