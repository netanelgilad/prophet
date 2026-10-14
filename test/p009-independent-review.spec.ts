import { spawnSync } from "child_process";
import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { copySync } from "fs-extra";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESString } from "../src/string/String";
import { stringToLowerCase } from "../src/string/toLowerCase";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { Any, ESNull, ESNumber, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { effectPaths } from "../src/effects";

// Independent acceptance for frozen 5b5727af7b7dc5cfff277eb8f0ccf63df0290516.
// Native values are produced before invoking the VM, in a separate pinned process.
const root = join(__dirname, "..");
function native(body: string, input: any = null): any {
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", 'if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(process.argv[1]);' + body, JSON.stringify(input)],
    {cwd: root, encoding: "utf8", timeout: 20000, maxBuffer: 16 * 1024 * 1024,
      env: {...process.env, NODE_OPTIONS: "", NODE_PATH: ""}});
  expect(child.error).toBeUndefined(); expect(child.status).toBe(0); expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}
function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function both(source: string) {
  expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));', source)).toBe(true);
  const [completion, after] = run(source);
  expect(completion).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value: true});
}
function leaves(result: any): any[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test("independent all ASCII pairs against pinned native mapping", () => {
  const expected = native('process.stdout.write(JSON.stringify(Array.from({length:128},(_,i)=>String.fromCharCode(i).toLowerCase())));');
  for (let a=0; a<128; a++) for (let b=0; b<128; b++) {
    const outcome = stringToLowerCase(ESString(String.fromCharCode(a,b)), [], nodeInitialExecutionContext).next();
    expect(outcome.done).toBe(true);
    expect((outcome.value as any)[0].value).toBe(expected[a]+expected[b]);
  }
  console.log("INDEPENDENT_ASCII_PAIRS", 16384);
});
test("independent deterministic mixed strings through parsed calls", () => {
  const texts = ["", "@AZ[az`09_\0\x7f\n", "HTTP/1.1 X-Header: MIXED\r\n"];
  for (let i=0; i<128; i++) texts.push(Array.from({length: 97}, (_,j)=>String.fromCharCode((i*31+j*73+j*j)%128)).join(""));
  const expected = native('process.stdout.write(JSON.stringify(input.map(x=>x.toLowerCase())));', texts);
  texts.forEach((text,i) => {
    const [done,after] = run('const answer=input.toLowerCase(); const stable=answer.toLowerCase()===answer && input===original;', {input:ESString(text),original:ESString(text)});
    expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:expected[i]});
    expect(after.value.scope.stable).toMatchObject({value:true});
  });
});
const programs = [
  // Callee and call identity are captured before ignored arguments mutate them.
  `const saved=String.prototype.toLowerCase;let trace="";function arg(){trace="a";String.prototype.toLowerCase=function(){"use strict";return "REPLACED";};return {toString(){throw "unused";}};}
   const first="ABC".toLowerCase(arg());const answer=first==="abc" && "ABC".toLowerCase()==="REPLACED" && saved.call("ABC")==="abc" && trace==="a";`,
  // Conversion's fallback must use the current inherited method, with same this.
  `function C(){} C.prototype.toString=function(){this.mark="seen";C.prototype.valueOf=function(){return this.mark==="seen"?"NEW":"WRONG";};return {};};
   C.prototype.valueOf=function(){throw "stale";}; const answer=String.prototype.toLowerCase.call(new C())==="new";`,
  `const lower=String.prototype.toLowerCase;let trace="";const x={toString(){trace=trace+"s";return null;},valueOf(){throw "wrong";}};
   const y={toString(){return undefined;}};const answer=lower.call(x)==="null" && lower.call(y)==="undefined" && trace==="s";`,
  `const lower=String.prototype.toLowerCase;const receiver={toString:null,valueOf(){return -Infinity;}};const answer=lower.call(receiver)==="-infinity" && lower.call(-0)==="0" && lower.call(NaN)==="nan";`,
  `let trace="";let caught=false;const x={toString(){trace="s";return {};},valueOf(){trace=trace+"v";return function(){};}};try{String.prototype.toLowerCase.call(x);}catch(e){caught=e instanceof TypeError;}
   const answer=caught && trace==="sv";`,
  `let trace="";let caught;function arg(){trace="argument";throw "argument throw";}try{String.prototype.toLowerCase.call(undefined,arg());}catch(e){caught=e;}
   const answer=trace==="argument" && caught==="argument throw";`,
  `let a=false,b=false,c=false;const f=String.prototype.toLowerCase;try{f();}catch(e){a=e instanceof TypeError;}try{f.call(null);}catch(e){b=e instanceof TypeError;}try{new f();}catch(e){c=e instanceof TypeError;}
   const own=Object.prototype.hasOwnProperty;const answer=a&&b&&c&&f.length===0&&f.name==="toLowerCase"&&f.prototype===undefined&&own.call(f,"length")&&!own.call(f,"prototype")&&!own.call(f,"call");`,
  `const old=String.prototype.toLowerCase;old.call=function(){"use strict";return "CALL";};const answer=old.call("ABC")==="CALL" && "ABC".toLowerCase()==="abc";`
];
programs.forEach((source,i)=>test("independent native/VM coercion and identity "+i,()=>both(source)));

test("independent finite nullish/normal choices and late fallback throws", () => {
  const source=`let count=0;let value;const o={toString(){count=count+1;return {};},valueOf(){count=count+1;if(b)throw "STOP";return "FaLlBaCk";}};
    try{value=String.prototype.toLowerCase.call(a?null:o);}catch(e){value=a ? e instanceof TypeError : e;}
    const answer=a ? value===true && count===0 : count===2 && (b?value==="STOP":value==="fallback");const unknown=value==="fallback";`;
  for (const a of [false,true]) for(const b of [false,true]) both(`const a=${a},b=${b};`+source);
  const [done,after]=run(source,{a:ESBoolean(),b:ESBoolean()});
  expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:true});
  expect((after.value.scope.unknown as any).value).toBeUndefined();
});

test("independent three-way open/throw/normal frontier preserves current heap and ordered effects", () => {
  const source=`const lower=String.prototype.toLowerCase;let trace="";let caught=false;let cleaned=false;
    console.log("before");const o={toString(){trace="converted";console.log("convert");String.prototype.toLowerCase=function(){"use strict";return "changed";};if(a)return input;if(b)throw "GUEST";return "OK";}};
    try{const value=lower.call(o);trace=trace+value;}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}`;
  const result=run(source,{a:ESBoolean(),b:ESBoolean(),input:ESString(),console:createConsoleModel().module});
  const all=leaves(result);expect(all).toHaveLength(2);
  expect(all.filter(([v])=>v.type==="ExecutionBoundary")).toHaveLength(1);
  for(const [value,context] of all){
    const stopped=value.type==="ExecutionBoundary";
    expect(context.value.scope.cleaned.value).toBe(!stopped);
    if(stopped) {expect(context.value.scope.trace.value).toBe("converted");expect(context.value.scope.caught.value).toBe(false);}
    else {const [done,after]=evaluateCode('const proof=b ? trace==="converted" && caught==="GUEST" : trace==="convertedok" && caught===false;',context);
      expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});}
    expect(effectPaths(context.value.effects).every(path=>path.events.filter(e=>e.kind==="call" && e.call.operation==="console.log").length===(stopped?2:3))).toBe(true);
    const [done,after]=evaluateCode('const current="ABC".toLowerCase();const retained=lower.call("ABC");',context);
    expect(done).toBe(Undefined);expect(after.value.scope.current).toMatchObject({value:"changed"});expect(after.value.scope.retained).toMatchObject({value:"abc"});
  }
});

test("independent boundary priority, Unicode and output budget with sibling mutation", () => {
  const texts=["A".repeat(65535),"A".repeat(65536),"A".repeat(65535)+"\u0080","\u0130","ΟΣ","ΟΣΑ","\ud800","\udfff","😀","\x80".repeat(65537),"A".repeat(65537)];
  // Send lengths for the large native controls to avoid OS single-argument limits.
  expect(native('process.stdout.write(JSON.stringify([65535,65536,65537].map(n=>"A".repeat(n).toLowerCase().length)));')).toEqual([65535,65536,65537]);
  expect(native('process.stdout.write(JSON.stringify(input.map(x=>x.toLowerCase())));',texts.slice(3,9))).toEqual(["i\u0307","ος","οσα","\ud800","\udfff","😀"]);
  for(const text of texts){
    const result=run('let count=0;const x={toString(){count=count+1;return selected?input:"OK";}};const value=String.prototype.toLowerCase.call(x);count=count+1;', {input:ESString(text),selected:ESBoolean()});
    const all=leaves(result);
    const expectedKind=text.length>65536?"budget":/[^\x00-\x7f]/.test(text)?"unsupported":undefined;
    if(expectedKind){
      expect(all).toHaveLength(2);const stopped=all.find(([v])=>v.type==="ExecutionBoundary")!;
      expect(stopped[0].kind).toBe(expectedKind);expect(stopped[1].value.scope.count.value).toBe(1);
      expect(all.find(([v])=>v===Undefined)![1].value.scope.count.value).toBe(2);
    }else{
      expect(result[0]).toBe(Undefined);
      const [done,after]=evaluateCode('const proof=selected?value===expected:value==="ok";',setVariablesInScope(result[1],{expected:ESString("a".repeat(text.length))}));
      expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});
    }
  }
});

test("independent inherited symbol absence versus exotic stop", () => {
  expect(native('process.stdout.write(JSON.stringify([null,undefined].map(h=>String.prototype.toLowerCase.call({[Symbol.toPrimitive]:h,toString(){return "PASS";}}))));')).toEqual(["pass","pass"]);
  for(const hook of [ESNull,Undefined,ESNumber(7)]){
    const proto=ESObject({});proto.wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);
    const result=run('let count=0;input.toString=function(){count=count+1;return "PASS";};const value=String.prototype.toLowerCase.call(input);',{input:{...ESObject({}),prototype:proto}});
    if(hook===ESNull||hook===Undefined){expect(result[0]).toBe(Undefined);expect(result[1].value.scope.value).toMatchObject({value:"pass"});}
    else {expect(result[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(result[1].value.scope.count).toMatchObject({value:0});}
  }
  for(const expression of ['[]','function(){}']){
    expect(native('process.stdout.write(JSON.stringify(Function(input)()));',`const x=${expression};x.toString=()=>"CUSTOM";return String.prototype.toLowerCase.call(x);`)).toBe("custom");
    const [done,after]=run(`let count=0;const x=${expression};x.toString=function(){count=count+1;return "CUSTOM";};String.prototype.toLowerCase.call(x);`);
    expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(after.value.scope.count).toMatchObject({value:0});
  }
});

for(const expression of ['String.prototype.toLowerCase.caller','String.prototype.toLowerCase.arguments',
  'String.prototype.toLowerCase.caller=123','String.prototype.toLowerCase.arguments=123',
  'String.prototype.toLowerCase.name="changed"','String.prototype.toLowerCase.length=9',
  'String.prototype.toLowerCase.hasOwnProperty','Object.keys(String.prototype.toLowerCase)',
  '({...String.prototype.toLowerCase})','"ABC".toUpperCase',
  'Object.prototype.hasOwnProperty.call(String.prototype,"indexOf")']){
  test("independent conservative metadata/deferred boundary "+expression,()=>{
    const [completion]=run(`let mark=0;if(selected){mark=1;const result=(${expression});mark=2;}else mark=3;`,{selected:ESBoolean()});
    expect(isForkedCompletion(completion)).toBe(true);if(!isForkedCompletion(completion))throw Error("fork");
    expect(completion.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
    expect(completion.consequent[1].value.scope.mark).toMatchObject({value:1});expect(completion.alternate[1].value.scope.mark).toMatchObject({value:3});
  });
}

test("independent complete unchanged upstream candidates on pinned Node", () => {
  const result=native(`const fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
    const root=path.dirname(require.resolve("test262/package.json")),dir=path.join(root,"test/built-ins/String/prototype/toLowerCase");
    const files=fs.readdirSync(dir).filter(x=>x.endsWith(".js")).sort(),hashes={},failures=[];let variants=0;
    for(const file of files){const source=fs.readFileSync(path.join(dir,file),"utf8");hashes[file]=crypto.createHash("sha256").update(source).digest("hex");
      const attrs=require("test262-parser").parseFile({file,contents:source}).attrs;
      for(const strict of [false,true]){variants++;try{const ctx=vm.createContext({});
        for(const inc of ["sta.js","assert.js",...attrs.includes])vm.runInContext(fs.readFileSync(path.join(root,"harness",inc),"utf8"),ctx,{timeout:1000});
        vm.runInContext((strict?'"use strict";\\n':"")+source,ctx,{timeout:1000,filename:file});
      }catch(e){failures.push({file,strict,error:String(e)});}}
    }process.stdout.write(JSON.stringify({files:files.length,variants,hashes,failures}));`);
  expect(result.files).toBe(27);expect(result.variants).toBe(54);expect(result.failures).toEqual([]);
  console.log("INDEPENDENT_UPSTREAM_NATIVE",JSON.stringify(result));
});

test("independent retained actual unchanged sirv CLI graph and both histories", () => {
  const directory=join(process.env.PROPHET_P009_LOG_ROOT||join(root,"logs/p009-independent"),"sirv-fixture");mkdirSync(directory,{recursive:true});
  for(const [fixture,name] of [["sirv-3.0.2","sirv"],["mrmime-2.0.1","mrmime"],["totalist-3.0.1","totalist"],["polka-url-1.0.0-next.29","@polka/url"]])
    copySync(join(__dirname,"fixtures",fixture,"package"),join(directory,"node_modules",name));
  mkdirSync(join(directory,"site"),{recursive:true});writeFileSync(join(directory,"site/hello.txt"),"hello from sirv\n");
  writeFileSync(join(directory,"entry.cjs"),'module.exports=require("sirv")("./site");');
  const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,[join(root,"bin/prophet.js"),"--","entry.cjs"],
    {cwd:directory,encoding:"utf8",timeout:60000,maxBuffer:80*1024*1024,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
  writeFileSync(join(process.env.PROPHET_P009_LOG_ROOT||join(root,"logs/p009-independent"),"cli.stdout.json"),child.stdout);writeFileSync(join(process.env.PROPHET_P009_LOG_ROOT||join(root,"logs/p009-independent"),"cli.stderr.log"),child.stderr);
  console.log("INDEPENDENT_CLI_EXIT",child.status);
  expect(child.error).toBeUndefined();expect(child.status).toBe(2);expect(child.stderr).toBe("prophet: Unmodeled host property 'mtime': Node Stats fields\n");
  const graph=JSON.parse(child.stdout);expect(Object.keys(graph).sort()).toEqual(["nodes","roots"]);
  const nodes=new Map<string,any>(graph.nodes.map((n:any)=>[n.id,n]));
  const field=(ref:any,key:string)=>{const pair=nodes.get(ref.ref).entries.find(([name]:[string])=>name===key);return pair&&pair[1];};
  const fork=graph.roots.completion;expect(field(fork,"type")).toBe("ForkedCompletion");expect(field(fork,"state")).toBe("partial");
  const all=[field(fork,"consequent"),field(fork,"alternate")];expect(all.map(l=>field(field(l,"0"),"type")).sort()).toEqual(["ExecutionBoundary","ThrownValue"]);
  for(const leaf of all){
    const value=field(leaf,"0"),state=field(leaf,"1"),stopped=field(value,"type")==="ExecutionBoundary";
    if(stopped){
      expect(field(value,"message")).toBe("Unmodeled host property 'mtime': Node Stats fields");expect(field(state,"sourceFile")).toMatch(/sirv\/build\.js$/);
      // Completed mrmime activation records remain; these are not current sirv locals.
   const envs=nodes.get(field(state,"environments").ref).entries;let tmp:any,idx:any;
      for(const [,record]of envs){for(const name of ["tmp","idx"]){const binding=nodes.get(record.ref).entries.find(([key]:[string])=>key===name);if(binding){if(name==="tmp")tmp=field(binding[1],"value");else idx=field(binding[1],"value");}}if(tmp&&idx)break;}
      expect(field(tmp,"value")).toBe("hello.txt");expect(field(idx,"value")).toBe(6);
   const currentRecord=envs.find(([key]:[any])=>key.ref===field(state,"environment").ref);const ctype=nodes.get(currentRecord[1].ref).entries.find(([key]:[string])=>key==="ctype");expect(field(field(ctype[1],"value"),"value")).toBe("text/plain");
    }else expect(field(field(field(field(value,"value"),"properties"),"code"),"value")).toBe("EMFILE");
    // Walk only this leaf's effect graph: both call and outcome must be reachable.
    const seen=new Set<string>(),events:any[]=[];
    function walk(x:any){if(!x||typeof x!=="object")return;if(x.ref){if(seen.has(x.ref))return;seen.add(x.ref);const n=nodes.get(x.ref);
      if(n.entries){const kind=n.entries.find(([k]:[string])=>k==="kind"),call=n.entries.find(([k]:[string])=>k==="call");if(kind&&call&&field(call[1],"operation")==="fs.readdirSync")events.push({kind:kind[1],call:call[1].ref});}walk(n);
    }else if(Array.isArray(x))x.forEach(walk);else Object.keys(x).forEach(k=>walk(x[k]));}
    walk(field(state,"effects"));expect(events.map(e=>e.kind).sort()).toEqual(["call",stopped?"return":"throw"].sort());expect(events[0].call).toBe(events[1].call);
  }
});

// P010 migration of the sole superseded deferred read, preserving native/VM evidence.
test("P010 supported lastIndexOf replaces predecessor rejection",()=>both(`const answer=typeof "ABC".lastIndexOf === "function" && "ABCABC".lastIndexOf("BC")===4;`));
