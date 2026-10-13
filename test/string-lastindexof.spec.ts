import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createConsoleModel } from "../src/node/console";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function leaves(result: any): any[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
function literal(text: string) { return JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

// Explicit results, independently checked in pinned Node before implementation.
const cases: Array<[string, string, string, number]> = [
  ["", "", "", 0], ["", "x", "", -1], ["abc", "", "", 3],
  ["abc", "abc", "", 0], ["abc", "abcd", "", -1], ["ababa", "aba", "", 2],
  ["aaaa", "aa", "", 2], ["aaaa", "aa", ",1", 1], ["abcabc", "bc", ",3", 1],
  ["abcabc", "bc", ",4", 4], ["abcabc", "x", "", -1], ["abcabc", "a", ",undefined", 3],
  ["abcabc", "a", ",NaN", 3], ["abcabc", "a", ",null", 0], ["abcabc", "b", ",true", 1],
  ["abcabc", "b", ",false", -1], ["abcabc", "a", ',"3.9"', 3],
  ["abcabc", "a", ",-1", 0], ["abcabc", "a", ",-0.9", 0], ["abcabc", "a", ",2.9", 0],
  ["abcabc", "a", ",3.9", 3], ["abcabc", "a", ",Infinity", 3], ["abcabc", "a", ",-Infinity", 0],
  ["abcabc", "a", ",-0", 0], ["abcabc", "", ",-0", 0], ["abcabc", "", ",NaN", 6],
  ["abcabc", "", ",2.9", 2], ["abcabc", "", ",-Infinity", 0], ["abcabc", "", ",Infinity", 6],
  ["x😀y😀", "😀", "", 4], ["x😀y😀", "\ude00", ",4", 2], ["x😀y😀", "\ud83d", ",4", 4],
  ["x😀y😀", "", ",2", 2], ["é\ud800é\udfff", "é", "", 2], ["é\ud800é\udfff", "\udfff", "", 3],
  ["é\ud800é\udfff", "\ud800", "", 1], ["é", "e\u0301", "", -1], ["a\0a\0", "\0", "", 3],
  ["undefinednull", "undefined", "", 0]
];
const matrix = cases.map(([text, needle, position, answer]) =>
  `if (${literal(text)}.lastIndexOf(${literal(needle)}${position}) !== ${answer}) throw "matrix";`).join("\n");
test("native explicit UTF-16 and position matrix", () => withModuleFixture(matrix + '\nmodule.exports=true;', file =>
  expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
cases.forEach(([text, needle, position, expected], i) => test(`VM UTF-16 and position matrix ${i}`, () => {
  const [done, after] = run(`const answer=input.lastIndexOf(needle${position});`, {input:ESString(text),needle:ESString(needle)});
  expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:expected});
  if (expected === 0) expect(Object.is((after.value.scope.answer as any).value, -0)).toBe(false);
}));

const programs = [
  `const f=String.prototype.lastIndexOf; module.exports=f.call(true,"r")===1 && f.call(12321,2)===3 && f.call({},"Object")===8 && f.call(String.prototype,"")===0 && "null".lastIndexOf(null)===0 && "undefined".lastIndexOf()===0;`,
  `let trace=""; function arg(label,x){trace=trace+label;return x;} const r={toString(){trace=trace+"r";return "ababa";}};
    const s={toString(){trace=trace+"s";return "aba";}};const p={valueOf(){trace=trace+"p";return 2;}};
    const n=String.prototype.lastIndexOf.call(r,arg("a",s),arg("b",p),arg("x",0));module.exports=n===2 && trace==="abxrsp";`,
  `let trace="";const r={toString(){trace=trace+"r";this.valueOf=function(){trace=trace+"v";return "ababa";};return {};},valueOf(){throw "old";}};
    const s={toString(){trace=trace+"s";p.valueOf=function(){trace=trace+"n";return {};};return "aba";}};
    const p={valueOf(){throw "old";},toString(){trace=trace+"p";return "2.9";}};
    module.exports=String.prototype.lastIndexOf.call(r,s,p)===2 && trace==="rvsnp";`,
  `let trace="";let caught;const s={toString(){trace="wrong";return "a";}};try{String.prototype.lastIndexOf.call(null,s,{valueOf(){throw "wrong";}});}catch(e){caught=e instanceof TypeError;}module.exports=caught && trace==="";`,
  `let trace="";let caught;function extra(){trace="arg";throw "extra";}try{String.prototype.lastIndexOf.call(null,"a",0,extra());}catch(e){caught=e;}module.exports=trace==="arg" && caught==="extra";`,
  `let trace="";let caught;try{String.prototype.lastIndexOf.call({toString(){trace="r";throw "R";}},{toString(){trace="wrong";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="r" && caught==="R";`,
  `let trace="";let caught;try{String.prototype.lastIndexOf.call({toString(){trace="r";return "a";}},{toString(){trace=trace+"s";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="rs" && caught==="S";`,
  `let trace="";let caught;try{"a".lastIndexOf("longer",{valueOf(){trace="p";throw "P";}});}catch(e){caught=e;}module.exports=trace==="p" && caught==="P";`,
  `let caught;try{"".lastIndexOf("",{valueOf(){return {};},toString(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;`,
  `const old="ababa",f=old.lastIndexOf,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}
    const meta=f.name==="lastIndexOf" && f.length===1 && f.prototype===undefined && own.call(String.prototype,"lastIndexOf") && own.call(f,"name") && own.call(f,"length") && !own.call(f,"prototype") && !own.call(f,"call");
    String.prototype.lastIndexOf=function(){"use strict";return 99;};module.exports=caught && meta && old.lastIndexOf("aba")===99 && f.call(old,"aba")===2;`,
  `const f=String.prototype.lastIndexOf;const r={toString(){String.prototype.lastIndexOf=function(){"use strict";return 9;};return "ababa";}};module.exports=f.call(r,"aba")===2 && "x".lastIndexOf("")===9;`,
  `function C(){} C.prototype.toString=function(){return "ababa";};const r=new C();const a=String.prototype.lastIndexOf.call(r,"aba");C.prototype.toString=function(){return "xyz";};module.exports=a===2 && String.prototype.lastIndexOf.call(r,"aba")===-1;`,
  `let trace="";const s={toString(){trace="s";this.valueOf=function(){trace=trace+"v";return "aba";};return {};},valueOf(){throw "old";}};module.exports="ababa".lastIndexOf(s)===2 && trace==="sv";`,
  `let caught=false;try{String.prototype.lastIndexOf.call({toString(){return {};},valueOf(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;`,
  `let caught=false;try{"a".lastIndexOf({toString(){return {};},valueOf(){return {};}});}catch(e){caught=e instanceof TypeError;}module.exports=caught;`,
  `const f=String.prototype.lastIndexOf;f.call=function(){"use strict";return 99;};module.exports=f.call("aba","a")===99 && "aba".lastIndexOf("a")===2;`,
  `module.exports="abcabc".lastIndexOf("a",{valueOf(){return undefined;}})===3 && "abcabc".lastIndexOf("a",{valueOf(){return null;}})===0;`
];
programs.forEach((source,i) => {
  test(`native conversion and identity ${i}`, () => withModuleFixture(source,file =>
    expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`VM conversion and identity ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("finite operands and conversion results preserve correlation and mandatory unknown", () => {
  const [done,after]=run(`let calls=0;const r={toString(){calls=calls+1;return selected?"ababa":"xyx";}};
    const s={toString(){calls=calls+1;return selected?"aba":"x";}};const p={valueOf(){calls=calls+1;return selected?2:0;}};
    const value=String.prototype.lastIndexOf.call(r,s,p);const proof=calls===3 && (selected?value===2:value===0);const unknown=value===2;`,{selected:ESBoolean()});
  expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
});
test("conditional replacement retains aliases and earlier heap snapshot", () => {
  const [ready,before]=run('const old="ababa";const f=old.lastIndexOf;',{selected:ESBoolean()});expect(ready).toBe(Undefined);
  const [done,after]=evaluateCode(`if(selected) String.prototype.lastIndexOf=function(){"use strict";return 9;};const n=old.lastIndexOf("aba");const proof=selected?n===9:n===2;const alias=f.call(old,"aba");`,before);
  expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});expect(after.value.scope.alias).toMatchObject({value:2});
  const [normal,snapshot]=evaluateCode('const n=old.lastIndexOf("aba");',before);expect(normal).toBe(Undefined);expect(snapshot.value.scope.n).toMatchObject({value:2});
});

for(const operand of ["receiver","search","position"]) for(const throwing of [false,true]) test(`open ${operand} still performs later conversion (${throwing})`,()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return ${operand==="receiver"?"input":'"ababa"'};}};
    const s={toString(){trace=trace+"s";return ${operand==="search"?"input":'"aba"'};}};
    const p={valueOf(){trace=trace+"p";${throwing?'throw "P";':`return ${operand==="position"?"input":"2"};`}}};
    try{String.prototype.lastIndexOf.call(r,s,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:operand==="position"?ESNumber():ESString()});
  expect(after.value.scope.trace).toMatchObject({value:"rsp"});
  if(throwing){expect(done).toBe(Undefined);expect(after.value.scope.caught).toMatchObject({value:"P"});expect(after.value.scope.cleaned).toMatchObject({value:true});}
  else{expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(after.value.scope.caught).toMatchObject({value:false});expect(after.value.scope.cleaned).toMatchObject({value:false});}
});
test("open receiver does not suppress search throw",()=>{
  const [done,after]=run(`let trace="";let caught;try{String.prototype.lastIndexOf.call(input,{toString(){trace="search";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}`,{input:ESString()});
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"search"});expect(after.value.scope.caught).toMatchObject({value:"S"});
});

const stopped: Any[]=[ESString(),ESString([ESString("a")]),ESNumber(),ESString("a".repeat(65537)),ESString("a".repeat(1000000))];
stopped.forEach((input,i)=>{for(const reverse of [false,true]) test(`late boundary ${i} retains throw/normal alternatives (${reverse})`,()=>{
  const console=createConsoleModel();
  const result=run(`let trace="";let caught=false;let cleaned=false;const f=String.prototype.lastIndexOf;
    console.log("before");const r={toString(){trace="r";console.log("receiver");String.prototype.lastIndexOf=function(){"use strict";return 9;};return ${reverse?"!a":"a"}?input:"aba";}};
    const s={toString(){trace=trace+"s";console.log("search");return "a";}};
    const p={valueOf(){trace=trace+"p";console.log("position");if(b)throw "P";return 2;}};
    try{const n=f.call(r,s,p);trace=trace+n;}catch(e){caught=e;}finally{cleaned=true;console.log("finally");}`,{input,a:ESBoolean(),b:ESBoolean(),console:console.module});
  const all=leaves(result);expect(all.some(([v])=>v.type==="ExecutionBoundary")).toBe(true);
  expect(all.some(([v])=>v===Undefined)).toBe(true);
  for(const [v,context] of all){const boundary=v.type==="ExecutionBoundary";
    if(boundary){expect(v.kind).toBe(i>=3?"budget":"unsupported");expect(context.value.scope.trace).toMatchObject({value:"rsp"});expect(context.value.scope.caught).toMatchObject({value:false});}
    expect(context.value.scope.cleaned).toMatchObject({value:!boundary});
    if(!boundary){const [done,after]=evaluateCode('const proof=b ? caught==="P" && trace==="rsp" : caught===false && trace==="rsp2";',context);expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});}
    expect(console.inspectOutput(context).every(path=>path.chunks.length===(boundary?4:5))).toBe(true);
    const [normal,current]=evaluateCode('const current="abc".lastIndexOf("a");const alias=f.call("aba","a");',context);
    expect(normal).toBe(Undefined);expect(current.value.scope.current).toMatchObject({value:9});expect(current.value.scope.alias).toMatchObject({value:2});
  }
});});

for(const length of [65535,65536,65537]) for(const needle of [false,true]) test(`length budget ${length}, search operand ${needle}`,()=>{
  const [done,after]=run(`let trace="";const p={valueOf(){trace="p";return Infinity;}};const n=input.lastIndexOf(search,p);`,
    {input:ESString(needle?"": "a".repeat(length)),search:ESString(needle?"a".repeat(length):"")});
  expect(after.value.scope.trace).toMatchObject({value:"p"});
  if(length>65536) expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  else {expect(done).toBe(Undefined);expect(after.value.scope.n).toMatchObject({value:needle?-1:length});}
});
// A 64-unit almost-match costs exactly 64 comparisons per candidate.
for(const candidates of [16383,16384,16385]) test(`comparison budget candidates ${candidates}`,()=>{
  const [done,after]=run('const n=input.lastIndexOf(search);',{input:ESString("a".repeat(candidates+63)),search:ESString("a".repeat(63)+"b")});
  if(candidates>16384)expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  else{expect(done).toBe(Undefined);expect(after.value.scope.n).toMatchObject({value:-1});}
});
test("actual early match does not precharge worst-case comparisons",()=>{
  const [done,after]=run('const n=input.lastIndexOf(search);',{input:ESString("a".repeat(65536)),search:ESString("a".repeat(32768))});
  expect(done).toBe(Undefined);expect(after.value.scope.n).toMatchObject({value:32768});
});
for(const operand of ["receiver","search","position"]) for(const expression of ['[]','function(){}','input']) test(`typed exotic ${operand} ${expression}`,()=>{
  const proto=ESObject({});proto.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(1)]]);
  const result=run(`let trace="";const x=${expression};x.toString=function(){trace="wrong";return "a";};x.valueOf=function(){trace="wrong";return 0;};
    if(selected){trace="prefix";String.prototype.lastIndexOf.call(${operand==="receiver"?"x":'"abc"'},${operand==="search"?"x":'"a"'},${operand==="position"?"x":"0"});}else trace="sibling";`,{input:{...ESObject({}),prototype:proto},selected:ESBoolean()});
  expect(isForkedCompletion(result[0])).toBe(true);const all=leaves(result);
  expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.trace).toMatchObject({value:"prefix"});
  expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});
for(const hook of [Undefined,ESNull,ESNumber(1)]) test(`own/inherited hook absence ${hook.type}`,()=>{
  for(const inherited of [false,true]){const proto=ESObject({});const input=ESObject({});(inherited?proto:input).wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);if(inherited)input.prototype=proto;
    const [done,after]=run('input.toString=function(){return "aba";};const n=String.prototype.lastIndexOf.call(input,"a");',{input});
    if(hook===Undefined||hook===ESNull){expect(done).toBe(Undefined);expect(after.value.scope.n).toMatchObject({value:2});}
    else expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  }
});
for(const expression of ['String.prototype.lastIndexOf.bind','String.prototype.lastIndexOf.caller','String.prototype.lastIndexOf.arguments','String.prototype.lastIndexOf.name="x"','String.prototype.lastIndexOf.length=2','Object.keys(String.prototype.lastIndexOf)','({...String.prototype.lastIndexOf})','"x".substring','"x".indexOf']) test(`residual metadata/deferred ${expression}`,()=>{
  const result=run(`let trace="";if(selected){trace="prefix";const n=(${expression});trace="wrong";}else trace="sibling";`,{selected:ESBoolean()});
  const all=leaves(result);expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.trace).toMatchObject({value:"prefix"});expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});

test("native next unary boundary operand control",()=>withModuleFixture(`let trace="";function operand(){trace="reached";return 5;}module.exports=~operand()===-6 && trace==="reached";`,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
test("next unary boundary retains reached operand effects and sibling",()=>{
  const result=run(`let trace="";let caught=false;let cleaned=false;function operand(){trace="reached";return 5;}
    if(selected){try{const n=~operand();trace="wrong";}catch(e){caught=true;}finally{cleaned=true;}}else trace="sibling";`,{selected:ESBoolean()});
  const all=leaves(result);expect(all).toHaveLength(2);
  const stop=all.find(([v])=>v.type==="ExecutionBoundary");expect(stop[0]).toMatchObject({kind:"unsupported",message:"Unary operator resolver for ~ hasn't been implemented yet"});
  expect(stop[1].value.scope.trace).toMatchObject({value:"reached"});expect(stop[1].value.scope.caught).toMatchObject({value:false});expect(stop[1].value.scope.cleaned).toMatchObject({value:false});
  expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});

test("comparison budget retains position effects and completed alternative",()=>{
  const result=run(`let trace="";const search=selected?needle:"a";const p={valueOf(){trace="position";return Infinity;}};
    const n=input.lastIndexOf(search,p);trace=trace+n;`,{selected:ESBoolean(),input:ESString("a".repeat(16448)),needle:ESString("a".repeat(63)+"b")});
  const all=leaves(result);expect(all).toHaveLength(2);
  expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.trace).toMatchObject({value:"position"});
  expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"position16447"});
});
test("native resource-boundary witnesses",()=>withModuleFixture(`
  const a="a".repeat(65536),needle="a".repeat(63)+"b";
  module.exports=a.lastIndexOf("")===65536 && "".lastIndexOf(a)===-1 && a.lastIndexOf("a".repeat(32768))===32768
    && [16383,16384,16385].every(n=>"a".repeat(n+63).lastIndexOf(needle)===-1);`,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));

// Native controls establish that conservative conversion guards are VM gaps.
test("native exotic conversion controls for each operand",()=>withModuleFixture(`
  const f=String.prototype.lastIndexOf;const a=[];a.toString=function(){return "aba";};a.valueOf=function(){return 2;};
  const fn=function(){};fn.toString=function(){return "aba";};fn.valueOf=function(){return 2;};
  const o=Object.create({[Symbol.toPrimitive](hint){return hint==="number"?2:"aba";}});
  module.exports=[a,fn,o].every(x=>f.call(x,"a")===2 && "ababa".lastIndexOf(x)===2 && "ababa".lastIndexOf("aba",x)===2)
    && [null,undefined].every(h=>f.call({[Symbol.toPrimitive]:h,toString(){return "aba";}},"a")===2);`,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
