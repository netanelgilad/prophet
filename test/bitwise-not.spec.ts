import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { loadTest262, runTest262Variant, variantsFor, test262Root } from "./test262/runner";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { analysisFailureContext } from "../src/execution-context/analysis-failure";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";
function run(source:string,inputs:{[name:string]:Any}={}) {return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
const matrix:Array<[string,number]>=[
 ["NaN",-1],["Infinity",-1],["-Infinity",-1],["0",-1],["-0",-1],["0.9",-1],["-0.9",-1],
 ["1.9",-2],["-1.9",0],["-5.4321",4],["2147483647",-2147483648],["2147483648",2147483647],
 ["2147483649",2147483646],["-2147483648",2147483647],["-2147483649",-2147483648],
 ["4294967295",0],["4294967296",-1],["4294967297",-2],["-4294967295",-2],
 ["-4294967296",-1],["-4294967297",0],["8589934591",0],["8589934592",-1],["8589934593",-2],
 ["9007199254740991",0],["9007199254740992",-1],["-9007199254740991",-2],
 ["1.7976931348623157e308",-1],["-1.7976931348623157e308",-1],["1e100",-1],["5e-324",-1],
 ["true",-2],["false",-1],["null",-1],["undefined",-1],['""',-1],['"  -5.9  "',4],
 ['"0xffffffff"',0],['"0b101"',-6],['"0o10"',-9],['"foo"',-1],['"Infinity"',-1],['"-0"',-1],['"1n"',-1]
];
test("native explicit signed32 Number matrix",()=>withModuleFixture(matrix.map(([x,y])=>`if (~(${x}) !== ${y}) throw ${JSON.stringify("matrix "+x)};`).join("\n")+'module.exports=true;',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
for(const [x,y] of matrix)test("VM signed32 "+x,()=>{const [done,s]=run(`const n=~(${x});`);expect(done).toBe(Undefined);expect(s.value.scope.n).toMatchObject({type:"number",value:y});expect(Object.is((s.value.scope.n as any).value,-0)).toBe(false);});
const programs=[
 'let trace="";function operand(){trace="o";return {valueOf(){trace=trace+"v";return 5;},toString(){throw "wrong";}};}const n=~operand();module.exports=n===-6&&trace==="ov";',
 'let trace="";const x={valueOf(){trace="v";this.toString=function(){trace=trace+"s";return "-5.9";};return {};},toString(){throw "old";}};module.exports=~x===4&&trace==="vs";',
 'let trace="";const x={valueOf:7,toString(){trace="s";return true;}};module.exports=~x===-2&&trace==="s";',
 'const x={valueOf(){return {};},toString:1};let caught=false;try{~x;}catch(e){caught=e instanceof TypeError;}module.exports=caught;',
 'let trace="";const x={valueOf(){trace="v";throw "V";},toString(){trace="wrong";}};let caught;try{~x;}catch(e){caught=e;}module.exports=trace==="v"&&caught==="V";',
 'let trace="";const x={valueOf(){trace="v";return {};},toString(){trace=trace+"s";throw "S";}};let caught;try{~x;}catch(e){caught=e;}module.exports=trace==="vs"&&caught==="S";',
 'let trace="";function operand(){trace="o";throw "O";}let caught;try{~operand();}catch(e){caught=e;}module.exports=caught==="O"&&trace==="o";',
 'function C(){}C.prototype.valueOf=function(){return 5;};const x=new C(),alias=x;const first=~x;C.prototype.valueOf=function(){this.n=1;return -1;};module.exports=first===-6&&~alias===0&&x.n===1;',
 'const x={valueOf(){return null;},toString(){throw "wrong";}};module.exports=~x===-1;',
 'let count=0;const x={valueOf(){count=count+1;return {};},toString(){count=count+1;return undefined;}};module.exports=~x===-1&&count===2;',
 'module.exports=~{}===-1&&~{valueOf:null,toString(){return "3";}}===-4;'
];
for(const [i,source]of programs.entries()){
 test("native ordinary coercion "+i,()=>withModuleFixture(source,f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
 test("VM ordinary coercion "+i,()=>expect(compareModule(source).actual).toEqual({kind:"return",value:{type:"boolean",value:true}}));
}
test("finite choice correlations and mandatory unknown",()=>{const [done,s]=run('const x=a?5:-1;const n=~x;const valid=a?n===-6:n===0;const unknown=n===0;const again=~n;const twice=a?again===5:again===-1;',{a:ESBoolean()});expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});expect(s.value.scope.twice).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();});
test("coercion finite choice current effects without replay",()=>{const [done,s]=run('let count=0;const x={valueOf(){count=count+1;return a?5:-1;}};const n=~x;const valid=(a?n===-6:n===0)&&count===1;',{a:ESBoolean()});expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});});
for(const input of [ESNumber(),ESString(),{type:"bigint",value:"1"} as any,{type:"symbol"} as any,{type:"exotic"} as any])for(const stage of ["direct","valueOf","toString"])test(`typed ${input.type} at ${stage} keeps effects and siblings`,()=>{
 const console=createConsoleModel();const expr=stage==="direct"?'input':stage==="valueOf"?'{valueOf(){trace=trace+"v";console.log("v");return input;}}':'{valueOf(){trace=trace+"v";console.log("v");return {};},toString(){trace=trace+"s";console.log("s");return input;}}';
 const result=run(`let trace="",caught=false,cleaned=false;function operand(){trace="o";console.log("o");return ${expr};}if(a){try{const n=~operand();trace="wrong";}catch(e){caught=true;}finally{cleaned=true;console.log("finally");}}else trace="sibling";`,{input,a:ESBoolean(),console:console.module});
 const all=leaves(result);expect(all).toHaveLength(2);const stop=all.find(([v])=>v.type==="ExecutionBoundary");expect(stop[0]).toMatchObject({kind:"unsupported"});expect(stop[1].value.scope.trace).toMatchObject({value:stage==="direct"?"o":stage==="valueOf"?"ov":"ovs"});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});expect(console.inspectOutput(stop[1]).every(p=>p.chunks.length===(stage==="direct"?1:stage==="valueOf"?2:3))).toBe(true);expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});
for(const length of [65535,65536,65537])for(const late of [false,true])test(`numeric string cap ${length} late ${late}`,()=>{const [done,s]=run(`let mark=0;const x=${late?'{valueOf(){mark=1;return {};},toString(){mark=2;return input;}}':'input'};const n=~x;`,{input:ESString(" ".repeat(length-1)+"1")});expect(s.value.scope.mark).toMatchObject({value:late?2:0});if(length>65536)expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});else{expect(done).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:-2});}});
for(const inherited of [false,true])for(const hook of [Undefined,ESNull,ESNumber(1)])test(`symbol hook absence ${inherited} ${hook.type}`,()=>{const x=ESObject({}),p=ESObject({});(inherited?p:x).wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);if(inherited)x.prototype=p;const [done,s]=run('let mark=0;input.valueOf=function(){mark=1;return 5;};const n=~input;',{input:x});if(hook===Undefined||hook===ESNull){expect(done).toBe(Undefined);expect(s.value.scope.n).toMatchObject({value:-6});expect(s.value.scope.mark).toMatchObject({value:1});}else{expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(s.value.scope.mark).toMatchObject({value:0});}});
for(const expr of ['[]','function(){}'])test("conservative exotic "+expr,()=>{const result=run(`let mark=0;const x=${expr};x.valueOf=function(){mark=2;return 5;};if(a){mark=1;const n=~x;}else mark=3;`,{a:ESBoolean()});const all=leaves(result);expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.mark).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:3});});
test("native excluded BigInt Symbol exotics and oversized string controls",()=>withModuleFixture('const a=[];a.valueOf=function(){return 5;};const f=function(){};f.valueOf=function(){return 5;};let caught=false;try{~Symbol();}catch(e){caught=e instanceof TypeError;}module.exports=~1n===-2n&&~{valueOf(){return 1n;}}===-2n&&~{valueOf(){return {};},toString(){return 1n;}}===-2n&&~a===-6&&~f===-6&&~{[Symbol.toPrimitive](h){return h==="number"?5:0;}}===-6&&~(" ".repeat(65536)+"1")===-2&&caught;',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
test("operand earlier unsupported bypasses conversion",()=>{const [done,s]=run('let mark=0;function operand(){mark=1;return "x".substring;}const n=~operand();');expect(done).toMatchObject({type:"ExecutionBoundary",message:"String.prototype.substring is not yet supported"});expect(s.value.scope.mark).toMatchObject({value:1});});
test("ordinary prototype snapshots remain persistent",()=>{const [done,before]=run('function C(){}C.prototype.valueOf=function(){return 5;};const x=new C();');expect(done).toBe(Undefined);const [d,after]=evaluateCode('C.prototype.valueOf=function(){return -1;};const n=~x;',before);expect(d).toBe(Undefined);expect(after.value.scope.n).toMatchObject({value:0});const [e,old]=evaluateCode('const n=~x;',before);expect(e).toBe(Undefined);expect(old.value.scope.n).toMatchObject({value:-6});});
test("other unary and effectful binary behavior remains",()=>{const [done,s]=run('function C(){}const x=new C();const valid=!false&&+"2"===2&&-2===-2&&typeof x==="object"&&void x===undefined&&x instanceof C;');expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});});
// Shared partial-host/cyclic prototype failures remain explicit legacy gaps.
for(const category of ["partial","cycle"])test("legacy embedding "+category+" retains checkpoint",()=>{const input=ESObject({});if(category==="partial")input.unknownProperties="partial";else input.prototype=input;let error:any;try{run('let mark=1;const n=~input;',{input});}catch(e){error=e;}expect(error).toBeDefined();expect(error.message).toMatch(category==="partial"?/Unmodeled host/:/Cyclic/);expect(analysisFailureContext(error)!.value.scope.mark).toMatchObject({value:1});});

for(const input of [ESNumber(),ESString(" ".repeat(65536)+"1"),{type:"bigint",value:"1"} as any])test("mixed coercion stop guest-throw and supported histories "+input.type,()=>{
 const console=createConsoleModel();const result=run('let trace="",caught=false,cleaned=false;const box={n:0};const x={valueOf(){trace="v";box.n=7;console.log("v");if(b)throw "G";return a?input:5;}};try{const n=~x;trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}',{input,a:ESBoolean(),b:ESBoolean(),console:console.module});
 const all=leaves(result);expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const [value,state] of all){const stopped=value.type==="ExecutionBoundary";expect(state.value.scope.trace).toMatchObject(stopped?{value:"v"}:{});expect(state.value.scope.cleaned).toMatchObject({value:!stopped});if(stopped){expect(state.value.scope.caught).toMatchObject({value:false});expect(value.kind).toBe(input.type==="string"?"budget":"unsupported");}else{const [done,s]=evaluateCode('const valid=b?caught==="G"&&trace==="v":!caught&&trace==="v-6";',state);expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});}const [d,s]=evaluateCode('const current=box.n===7;',state);expect(d).toBe(Undefined);expect(s.value.scope.current).toMatchObject({value:true});expect(console.inspectOutput(state).every(p=>p.chunks.length===(stopped?1:2))).toBe(true);}
});
test("finite boolean conversion correlation",()=>{const [done,s]=run('const n=~a;const valid=a?n===-2:n===-1;const unknown=n===-1;',{a:ESBoolean()});expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});expect((s.value.scope.unknown as any).value).toBeUndefined();});

// Enumerate every whole candidate and preserve exact native and VM dispositions.
test("whole upstream inventory native reference and inactive VM blockers",()=>{
 const prefix="language/expressions/bitwise-not/",dir=join(test262Root,"test",prefix);
 const active=["S11.4.8_A1.js","S11.4.8_A2.1_T1.js","S11.4.8_A2.1_T2.js","S11.4.8_A2.2_T1.js","S11.4.8_A3_T4.js","S9.5_A2.1_T2.js","S9.5_A2.3_T2.js","S9.5_A3.1_T4.js","S9.5_A3.2_T2.js"];
 const rows:any[]=[];
 for(const name of readdirSync(dir).filter(n=>n.endsWith(".js")).sort()){
  const file=loadTest262(prefix+name),runs:any[]=[];
  for(const variant of variantsFor(file)){
   const native=execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,["--no-global-search-paths","-e",'const fs=require("fs"),vm=require("vm"),root=process.argv[1],file=process.argv[2],strict=process.argv[3];const ctx=vm.createContext({});for(const h of ["sta.js","assert.js"])vm.runInContext(fs.readFileSync(root+"/harness/"+h,"utf8"),ctx,{timeout:1000});vm.runInContext((strict==="strict"?"\\"use strict\\";\\n":"")+fs.readFileSync(file,"utf8"),ctx,{timeout:1000});',test262Root,join(dir,name),variant],{cwd:join(__dirname,".."),encoding:"utf8"});
   expect(native).toBe("");let error:any;try{runTest262Variant(file,variant);}catch(e){error=e;}
   if(active.includes(name))expect(error).toBeUndefined();else expect(error).toBeDefined();
   if(error)console.log("P011_INACTIVE_WHOLE",prefix+name,variant,error.name,error.message);
   runs.push({variant,nativeExit:0,vm: error?{kind:"inactive",exit:1,name:error.name,message:error.message}:{kind:"active",exit:0}});
  }
  rows.push({path:prefix+name,sha256:createHash("sha256").update(readFileSync(join(dir,name))).digest("hex"),attrs:file.attrs,runs});
 }
 expect(rows).toHaveLength(16);const logs=join(__dirname,"../logs/p011");mkdirSync(logs,{recursive:true});writeFileSync(join(logs,"whole-candidates.json"),JSON.stringify(rows,null,2));
},30000);

for(const expression of ['1n','0n','0x5an','{valueOf(){mark=2;return 1n;}}','{valueOf(){mark=2;return {};},toString(){mark=3;return 1n;}}'])test("reached BigInt literal never becomes Number "+expression,()=>{
 const result=run(`let mark=0,caught=false,cleaned=false;if(a){try{mark=1;const n=~(${expression});mark=9;}catch(e){caught=true;}finally{cleaned=true;}}else mark=4;`,{a:ESBoolean()});
 const all=leaves(result);expect(all).toHaveLength(2);const stop=all.find(([v])=>v.type==="ExecutionBoundary");expect(stop[0]).toMatchObject({kind:"unsupported",message:"BigInt literal evaluation is not yet supported"});expect(stop[1].value.scope.mark).toMatchObject({value:expression.includes("toString")?3:expression.includes("valueOf")?2:1});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:4});
});

test("current conditional fallback method preserves correlated mutation",()=>{const [done,s]=run('let trace="";const x={valueOf(){trace="v";this.toString=a?function(){trace=trace+"s";return "5";}:function(){trace=trace+"t";return null;};return [];}};const n=~x;const valid=a?n===-6&&trace==="vs":n===-1&&trace==="vt";',{a:ESBoolean()});expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});});
test("native conditional fallback mutation witnesses",()=>withModuleFixture('function check(a){let trace="";const x={valueOf(){trace="v";this.toString=a?function(){trace=trace+"s";return "5";}:function(){trace=trace+"t";return null;};return [];}};const n=~x;return a?n===-6&&trace==="vs":n===-1&&trace==="vt";}module.exports=check(true)&&check(false);',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
test("embedding wrapper remains typed without Number assumption",()=>{const input=ESObject({});(input as any).stringData=true;const result=run('let mark=0;if(a){mark=1;const n=~input;}else mark=2;',{input,a:ESBoolean()});const all=leaves(result);expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.mark).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:2});});
