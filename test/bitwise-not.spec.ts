import { invoke } from "../src/ASTResolvers";
import { parseECMACompliant } from "../src/parseECMACompliant";
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
test("operand earlier unsupported bypasses conversion",()=>{const [done,s]=run('let mark=0;function operand(){mark=1;return "x".indexOf;}const n=~operand();');expect(done).toMatchObject({type:"ExecutionBoundary",message:"String.prototype.indexOf is not yet supported"});expect(s.value.scope.mark).toMatchObject({value:1});});
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
 expect(rows).toHaveLength(16);const logs=process.env.PROPHET_P011_LOG_ROOT||join(__dirname,"../logs/p011");mkdirSync(logs,{recursive:true});writeFileSync(join(logs,"whole-candidates.json"),JSON.stringify(rows,null,2));
},30000);

for(const expression of ['1n','0n','0x5an','{valueOf(){mark=2;return 1n;}}','{valueOf(){mark=2;return {};},toString(){mark=3;return 1n;}}'])test("reached BigInt literal never becomes Number "+expression,()=>{
 const result=run(`let mark=0,caught=false,cleaned=false;if(a){try{mark=1;const n=~(${expression});mark=9;}catch(e){caught=true;}finally{cleaned=true;}}else mark=4;`,{a:ESBoolean()});
 const all=leaves(result);expect(all).toHaveLength(2);const stop=all.find(([v])=>v.type==="ExecutionBoundary");expect(stop[0]).toMatchObject({kind:"unsupported",message:"BigInt literal evaluation is not yet supported"});expect(stop[1].value.scope.mark).toMatchObject({value:expression.includes("toString")?3:expression.includes("valueOf")?2:1});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:4});
});

test("current conditional fallback method preserves correlated mutation",()=>{const [done,s]=run('let trace="";const x={valueOf(){trace="v";this.toString=a?function(){trace=trace+"s";return "5";}:function(){trace=trace+"t";return null;};return [];}};const n=~x;const valid=a?n===-6&&trace==="vs":n===-1&&trace==="vt";',{a:ESBoolean()});expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});});
test("native conditional fallback mutation witnesses",()=>withModuleFixture('function check(a){let trace="";const x={valueOf(){trace="v";this.toString=a?function(){trace=trace+"s";return "5";}:function(){trace=trace+"t";return null;};return [];}};const n=~x;return a?n===-6&&trace==="vs":n===-1&&trace==="vt";}module.exports=check(true)&&check(false);',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
test("embedding wrapper remains typed without Number assumption",()=>{const input=ESObject({});(input as any).stringData=true;const result=run('let mark=0;if(a){mark=1;const n=~input;}else mark=2;',{input,a:ESBoolean()});const all=leaves(result);expect(all).toHaveLength(2);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.mark).toMatchObject({value:1});expect(all.find(([v])=>v===Undefined)[1].value.scope.mark).toMatchObject({value:2});});

// P011-R1 disclosed Astra counterexamples, now intended unsupported admission.
const staticBigIntKeys=["0n","1n","9007199254740993n","0xffn","0XABn","0b101n","0B11n","0o77n","0O10n"];
const nativeKeyNames=["0","1","9007199254740993","255","171","5","3","63","8"];
for(const key of staticBigIntKeys)for(const route of ["object","binding"])test(`R1 native static key ${route} ${key}`,()=>withModuleFixture(route==="object"?`const x={${key}:8};module.exports=~x[${JSON.stringify(nativeKeyNames[staticBigIntKeys.indexOf(key)])}];`:`const {${key}:x}={${JSON.stringify(nativeKeyNames[staticBigIntKeys.indexOf(key)])}:8};module.exports=~x;`,f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"number",value:"-9"}})));
for(const key of staticBigIntKeys)for(const route of ["object","binding"])test(`R1 VM static key ${route} ${key}`,()=>{
 const source=route==="object"?`const x={${key}:8};const n=~x["9007199254740993"];`:`const {${key}:x}={"9007199254740993":8};const n=~x;`;
 const [done]=run(source);expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported",message:"BigInt static property keys are not yet supported"});
});
for(const prefix of ["", "// comment\n", "/*😀*/\r\n", "const 文=1;\u2028", "/*comment*/\n\r\n"])for(const route of ["object","binding"])test(`R1 original source positions ${JSON.stringify(prefix)} ${route}`,()=>{
 const source=route==="object"?'let mark=0;const x={prior:(mark=1),/*key*/\r\n9007199254740993n:(mark=9)};': 'let mark=0;const {ok= (mark=2),/*key*/\r\n0xABn:bad=(mark=9)}=rhs();';
 const [done,s]=run(prefix+'function rhs(){mark=1;return {};}'+source);expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt static property keys are not yet supported"});expect(s.value.scope.mark).toMatchObject({value:route==="object"?1:2});
});
for(const key of ['[1n]','[0xABn]'])for(const route of ["object","binding"])test(`R1 computed keeps literal boundary ${route} ${key}`,()=>{
 const source=route==="object"?`let mark=0;const x={prior:(mark=1),${key}:(mark=9)};`:`let mark=0;function rhs(){mark=1;return {};}const {ok=(mark=2),${key}:bad=(mark=9)}=rhs();`;
 const [done,s]=run(source);expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt literal evaluation is not yet supported"});expect(s.value.scope.mark).toMatchObject({value:route==="object"?1:2});
});
for(const route of ["object","binding"])test("R1 conditional effects throws stops cleanup "+route,()=>{
 const console=createConsoleModel();const source=route==="object"?`const x={ok:prior(),9007199254740993n:later()};const n=~x["9007199254740993"];`:`const {ok:x=prior(),9007199254740993n:y=later()}=rhs();const n=~y;`;
 const result=run(`let trace="",caught=false,cleaned=false;const box={n:0};const alias=box;function rhs(){trace="r";console.log("r");return {};}
 function prior(){trace=trace+"p";alias.n=7;Object.prototype.current=8;console.log("p");if(b)throw "G";if(c)return "x".indexOf;return 8;}function later(){trace="wrong";return 9;}
 if(a){try{${source}}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}}else trace="sibling";`,{a:ESBoolean(),b:ESBoolean(),c:ESBoolean(),console:console.module});
 const all=leaves(result);expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const [done,s]of all){const stop=done.type==="ExecutionBoundary";if(stop){expect(done.message).toMatch(/BigInt static property keys|String.prototype.indexOf/);expect(s.value.scope.trace).toMatchObject({value:route==="object"?"p":"rp"});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});}else{const [d,z]=evaluateCode('const valid=a?b&&caught==="G"&&cleaned:trace==="sibling"&&!cleaned;',s);expect(d).toBe(Undefined);expect(z.value.scope.valid).toMatchObject({value:true});}
 const [d,z]=evaluateCode('const current=a?box.n===7&&alias===box&&({}).current===8:box.n===0;',s);expect(d).toBe(Undefined);expect(z.value.scope.current).toMatchObject({value:true});expect(console.inspectOutput(s).every(p=>p.chunks.length===(stop?(route==="object"?1:2):aWitness(s)?(route==="object"?2:3):0))).toBe(true);}
 function aWitness(s:any){const [d,z]=evaluateCode('const selected=a===true;',s);expect(d).toBe(Undefined);return (z.value.scope.selected as any).value===true;}
});
for(const route of ["object","binding"])test("R1 early throws and unsupported bypass later key "+route,()=>{
 const source=route==="object"?'const x={ok:early(),1n:later()};':'const {1n:x=later()}=early();';
 for(const unsupported of [false,true]){const [done,s]=run(`let mark=0,caught=false;function early(){mark=1;${unsupported?'return "x".indexOf;':'throw "E";'}}function later(){mark=9;}try{${source}}catch(e){caught=e;}const valid=caught==="E"&&mark===1;`);expect(s.value.scope.mark).toMatchObject({value:1});if(unsupported)expect(done).toMatchObject({type:"ExecutionBoundary",message:"String.prototype.indexOf is not yet supported"});else{expect(done).toBe(Undefined);expect(s.value.scope.valid).toMatchObject({value:true});}}
});
const staticKeyControls=[
 'const x={9007199254740993:8};module.exports=~x["9007199254740992"]===-9&&~x["9007199254740993"]===-1;',
 'const {9007199254740993:x}={"9007199254740992":8};module.exports=~x===-9;',
 'const x={"9007199254740993n":8,"1n":7,1:6,1.5:5,0xAB:4,n:3};const {"9007199254740993n":a,"1n":b,1:c,1.5:d,0xAB:e,n:f}=x;module.exports=a===8&&b===7&&c===6&&d===5&&e===4&&f===3;',
 'const name=3;const x={name,method(){return 8;}};const {name:y}=x;module.exports=y===3&&~x.method()===-9;',
 'function unused(){const x={9007199254740993n:8};const {1n:y}={};return ~y;}module.exports=true;',
 'const x={"":1,100000000000000000000:2,0:3,0b11:4,0o10:5};module.exports=x[""]===1&&x["100000000000000000000"]===2&&x["0"]===3&&x["3"]===4&&x["8"]===5;'
];
for(const [i,source]of staticKeyControls.entries())test("R1 native and VM ordinary static key controls "+i,()=>expect(compareModule(source).actual).toEqual({kind:"return",value:{type:"boolean",value:true}}));
test("R1 native prefix and binding evaluation order",()=>withModuleFixture('let trace="";function prior(){trace=trace+"p";return 8;}function rhs(){trace=trace+"r";return {};}function later(){trace=trace+"l";return 8;}const x={ok:prior(),1n:later()};const {ok:a=prior(),1n:b=later()}=rhs();module.exports=trace==="plrpl"&&~x["1"]===-9&&~b===-9;',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}})));

test("R1 parser restores only static admission metadata with original AST shape",()=>{
 const ordinary='const name=1;const x={9007199254740993:8,"1n":7,name,method(){return 2;}};const {9007199254740993:y}=x;';
 expect(parseECMACompliant(ordinary)).toEqual(require("cherow").parseScript(ordinary,{raw:true,loc:true}));
 const source='/*😀*/\r\nfunction unused(){const x={/*a*/\n9007199254740993n:8};const {/*b*/0XABn:y}=x;}';
 const ast:any=parseECMACompliant(source),body=ast.body[0].body.body;
 for(const key of [body[0].declarations[0].init.properties[0].key,body[1].declarations[0].id.properties[0].key]){expect(Object.prototype.hasOwnProperty.call(key,"bigint")).toBe(true);expect(key).not.toHaveProperty("start");expect(key).not.toHaveProperty("end");expect(key.loc.start.line).toBeGreaterThan(1);}
 const [done]=run(source);expect(done).toBe(Undefined);
});
test("R1 BigInt method key stops after prefix, ordinary method remains supported",()=>{
 const [done,s]=run('let mark=0;const x={prior:(mark=1),1n(){mark=9;return 8;}};');expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt static property keys are not yet supported"});expect(s.value.scope.mark).toMatchObject({value:1});
 withModuleFixture('const x={1n(){return 8;}};module.exports=~x["1"]()===-9;',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}}));
});

test("R1 object guard retains the built prefix heap entry at current context",()=>{
 const [done,s]=run('let mark=0;const box={n:0};const x={prior:(box.n=7),1n:(mark=9)};');
 expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt static property keys are not yet supported"});expect(s.value.scope.mark).toMatchObject({value:0});
 const prefix=Array.from(s.value.heap!.values()).filter(entry=>Object.prototype.hasOwnProperty.call(entry.properties,"prior"));expect(prefix).toHaveLength(1);expect(prefix[0].properties.prior).toMatchObject({value:7});
 const [d,z]=evaluateCode('const current=box.n===7;',s);expect(d).toBe(Undefined);expect(z.value.scope.current).toMatchObject({value:true});
});
for(const kind of ["var","let","const"])test("R1 binding stops before bad shared read/default after prior binding "+kind,()=>{
 const [done,s]=run(`let mark=0;function rhs(){mark=1;return {};}const source=rhs();${kind} {ok:first=(mark=2),1n:bad=(mark=9)}=source;`);
 expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt static property keys are not yet supported"});expect(s.value.scope.mark).toMatchObject({value:2});expect(s.value.scope.first).toMatchObject({value:2});
});

test("R1 binding guard precedes observable bad lookup after RHS/read/default effects",()=>{
 const input=ESObject({});input.propertyAccess={write(){return undefined;},read(name,context){return invoke(context.value.scope.read,[ESString(name)],context,input);}};
 const [done,s]=run('let trace="",caught=false,cleaned=false;function rhs(){trace="r";return input;}function read(name){if(name==="ok"){trace=trace+"o";return undefined;}trace=trace+"w";throw "read";}function prior(){trace=trace+"d";return 8;}try{const {ok:first=prior(),9007199254740993n:bad=prior()}=rhs();}catch(e){caught=e;}finally{cleaned=true;}',{input});
 expect(done).toMatchObject({type:"ExecutionBoundary",message:"BigInt static property keys are not yet supported"});expect(s.value.scope.trace).toMatchObject({value:"rod"});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});
 withModuleFixture('let trace="",caught;const input={get ok(){trace=trace+"o";return undefined;},get "9007199254740993"(){trace=trace+"w";throw "read";}};function rhs(){trace="r";return input;}function prior(){trace=trace+"d";return 8;}try{const {ok:first=prior(),9007199254740993n:bad=prior()}=rhs();}catch(e){caught=e;}module.exports=trace==="rodw"&&caught==="read";',f=>expect(nodeModuleObservation(f)).toEqual({kind:"return",value:{type:"boolean",value:true}}));
});
