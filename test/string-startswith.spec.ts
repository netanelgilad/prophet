import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { loadTest262, test262Root } from "./test262/runner";
import { createRegExpLiteral } from "../src/regexp/RegExp";
import { getObjectPrototype } from "../src/Object/prototype";
import { ESObject } from "../src/Object";
import { matchSymbol, toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { isForkedCompletion } from "../src/execution-context/Completion";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, ESNull, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { assertPinnedNode, compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function literal(text: string) { return JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

// Explicit results, independently checked in pinned Node 24.21.0 before
// implementation.
const cases: Array<[string, string, string, boolean]> = [
  ["hello", "llo", "", false],
  ["hello", "x", "", false],
  ["hello", "", "", true],
  ["", "", "", true],
  ["hello", "llo", ",2", true],
  ["hello", "he", ",1", false],
  ["hello", "he", ",-5", true],
  ["hello", "he", ",0.9", true],
  ["hello", "he", ",NaN", true],
  ["hello", "lo", ",Infinity", false],
  ["hello", "hello", ",5", false],
  ["hello", "", ",5", true],
  ["hello", "", ",6", true],
  ["abc", "b", ",undefined", false],
  ["abc", "1", "", false],
  ["123", "2", "", false],
  ["abcabc", "bc", ",3", false],
  ["abcabc", "bc", ",4", true],
  ["x\ud83d\ude00y\ud83d\ude00", "\ud83d\ude00", "", false],
  ["x\ud83d\ude00y\ud83d\ude00", "\ude00", ",4", false],
  ["x\ud83d\ude00y\ud83d\ude00", "\ud83d\ude00", ",4", true],
  ["\u00e9\ud800\u00e9\udfff", "\udfff", "", false],
  ["\u00e9", "e\u0301", "", false],
  ["a\0a\0", "\0", "", false]
];
const matrix = cases.map(([text, needle, position, answer]) =>
  `if (${literal(text)}.startsWith(${literal(needle)}${position}) !== ${answer}) throw "matrix";`).join("\n");
test("native explicit UTF-16 and position matrix", () => withModuleFixture(matrix + '\nmodule.exports=true;', file =>
  expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
cases.forEach(([text, needle, position, expected], i) => test(`VM UTF-16 and position matrix ${i}`, () => {
  const [done, after] = run(`const answer=input.startsWith(needle${position});`, {input:ESString(text),needle:ESString(needle)});
  expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:expected});
}));

const programs = [
  `module.exports="null".startsWith(null)===true && "undefined".startsWith(undefined)===true && "true".startsWith(true)===true && "123".startsWith(1)===true && "abc".startsWith("a","1")===false && "abc".startsWith("a","x")===true && "abc".startsWith("a",null)===true && "abc".startsWith("b",true)===true;`,
  `let trace="";let caught;const s={toString(){trace="wrong";return "a";}};try{String.prototype.startsWith.call(null,s,{valueOf(){throw "wrong";}});}catch(e){caught=e instanceof TypeError && e.message==="String.prototype.startsWith called on null or undefined";}module.exports=caught && trace==="";`,
  `let trace=""; function arg(label,x){trace=trace+label;return x;} const r={toString(){trace=trace+"r";return "abcabc";}};
    const s={toString(){trace=trace+"s";return "bc";}};const p={valueOf(){trace=trace+"p";return 4;}};
    const n=String.prototype.startsWith.call(r,arg("a",s),arg("b",p),arg("x",0));module.exports=n===true && trace==="abxrsp";`,
  `let trace="";let caught;try{String.prototype.startsWith.call({toString(){trace="r";throw "R";}},{toString(){trace="wrong";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="r" && caught==="R";`,
  `let trace="";let caught;try{String.prototype.startsWith.call({toString(){trace="r";return "a";}},{toString(){trace=trace+"s";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="rs" && caught==="S";`,
  `let trace="";let caught;try{"a".startsWith("longer",{valueOf(){trace="p";throw "P";}});}catch(e){caught=e;}module.exports=trace==="p" && caught==="P";`,
  `const old="abcabc",f=old.startsWith,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}
    const meta=f.name==="startsWith" && f.length===1 && f.prototype===undefined && own.call(String.prototype,"startsWith") && own.call(f,"name") && own.call(f,"length") && !own.call(f,"prototype") && !own.call(f,"call");
    String.prototype.startsWith=function(){"use strict";return "swapped";};module.exports=caught && meta && old.startsWith("bc")==="swapped" && f.call(old,"ab")===true;`,
  `const f=String.prototype.startsWith;const r={toString(){String.prototype.startsWith=function(){"use strict";return "swapped";};return "abcabc";}};module.exports=f.call(r,"ab")===true && "x".startsWith("")==="swapped";`,
  `module.exports="abcabc".startsWith("a",{valueOf(){return undefined;}})===true && "abcabc".startsWith("a",{valueOf(){return null;}})===true && "abcabc".startsWith("bc",{valueOf(){return 4;}})===true;`
];
programs.forEach((source,i) => {
  test(`native conversion and identity ${i}`, () => withModuleFixture(source,file =>
    expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`VM conversion and identity ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("finite operands and conversion results preserve correlation and mandatory unknown", () => {
  const [done,after]=run(`let calls=0;const r={toString(){calls=calls+1;return selected?"abcabc":"xyx";}};
    const s={toString(){calls=calls+1;return selected?"bc":"q";}};const p={valueOf(){calls=calls+1;return selected?4:0;}};
    const value=String.prototype.startsWith.call(r,s,p);const proof=calls===3 && (selected?value===true:value===false);const unknown=value===true;`,{selected:ESBoolean()});
  expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
});

for(const operand of ["receiver","search","position"]) test(`open ${operand} still performs later conversions then stops`,()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return ${operand==="receiver"?"input":'"abcabc"'};}};
    const s={toString(){trace=trace+"s";return ${operand==="search"?"input":'"bc"'};}};
    const p={valueOf(){trace=trace+"p";return ${operand==="position"?"input":"3"};}};
    try{String.prototype.startsWith.call(r,s,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:operand==="position"?ESNumber():ESString()});
  expect(after.value.scope.trace).toMatchObject({value:"rsp"});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(after.value.scope.caught).toMatchObject({value:false});
  expect(after.value.scope.cleaned).toMatchObject({value:false});
});

test("open receiver does not suppress search throw",()=>{
  const [done,after]=run(`let trace="";let caught;try{String.prototype.startsWith.call(input,{toString(){trace="search";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}`,{input:ESString()});
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"search"});expect(after.value.scope.caught).toMatchObject({value:"S"});
});

test("oversized operands stop as budget boundaries after conversions",()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return input;}};
    const s={toString(){trace=trace+"s";return "bc";}};
    const p={valueOf(){trace=trace+"p";return 0;}};
    try{String.prototype.startsWith.call(r,s,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:ESString("a".repeat(65537))});
  expect(after.value.scope.trace).toMatchObject({value:"rsp"});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  expect(after.value.scope.caught).toMatchObject({value:false});
  expect(after.value.scope.cleaned).toMatchObject({value:false});
});


// Internal symbol slots exercise current @@match semantics; public Symbol APIs
// remain a separate implementation boundary.

for (const inherited of [false,true]) for(const hook of [Undefined, ESNull, ESBoolean(false), ESBoolean(true)]) {
  test(`match hook ${hook.type}/${String((hook as any).value)} inherited=${inherited}`,()=>{
    const input=ESObject({}), proto=ESObject({});
    (inherited?proto:input).wellKnownSymbols=new Map([[matchSymbol,hook]]);
    if(inherited) input.prototype=proto;
    const [done,after]=run(`let trace="";let caught=false;input.toString=function(){trace=trace+"s";return "a";};
      const p={valueOf(){trace=trace+"p";return 0;}};let answer;
      try{answer="abc".startsWith(input,p);}catch(e){caught=e instanceof TypeError;}`,{input});
    expect(done).toBe(Undefined);
    const rejects=(hook as any).value===true;
    expect(after.value.scope.trace).toMatchObject({value:rejects?"":"sp"});
    expect(after.value.scope.caught).toMatchObject({value:rejects});
    if(!rejects) expect(after.value.scope.answer).toMatchObject({value:true});
  });
}
test("native regexp rejection preserves receiver-before-search-before-position ordering",()=>withModuleFixture(`
  let trace="";let caught=false;const r={toString(){trace="r";return "abc";}};
  try{String.prototype.startsWith.call(r,/a/,{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e instanceof TypeError;}
  module.exports=caught && trace==="r";`,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
test("regexp rejection preserves receiver conversion without position conversion",()=>{
  const [done,after]=run(`let trace="";let caught=false;const r={toString(){trace="r";return "abc";}};
    try{String.prototype.startsWith.call(r,/a/,{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e instanceof TypeError;}`);
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"r"});expect(after.value.scope.caught).toMatchObject({value:true});
});
function leaves(result: any): any[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}
for(const operand of ["receiver","search","position"]) test(`custom primitive hook ${operand} retains prefix and sibling`,()=>{
  const input=ESObject({});input.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(1)]]);
  const result=run(`let trace="";if(selected){trace="prefix";String.prototype.startsWith.call(${operand==="receiver"?"input":'"abc"'},${operand==="search"?"input":'"a"'},${operand==="position"?"input":"0"});trace="wrong";}else trace="sibling";`,{input,selected:ESBoolean()});
  const all=leaves(result);
  expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.trace).toMatchObject({value:"prefix"});
  expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});
for(const operand of ["receiver","search"]) for(const size of [65536,65537]) test(`operand ${operand} length ${size} boundary`,()=>{
  const [done,after]=run(`let trace="";const p={valueOf(){trace="p";return 0;}};
    const answer=String.prototype.startsWith.call(${operand==="receiver"?"input":'""'},${operand==="search"?"input":'""'},p);`,{input:ESString("a".repeat(size))});
  expect(after.value.scope.trace).toMatchObject({value:"p"});
  if(size===65537) expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  else {expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:operand==="receiver"});}
});
test("maximum supported equal prefix compares every UTF16 unit",()=>{
  const [done,after]=run("const answer=input.startsWith(input);",{input:ESString("a".repeat(65536))});
  expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:true});
});
test("non-string receivers use ordinary coercion",()=>expect(compareModule(`
  module.exports=String.prototype.startsWith.call(123,"12") && String.prototype.startsWith.call(true,"tr")
    && String.prototype.startsWith.call({toString(){return {};},valueOf(){return "xyz";}},"xy")
    && "undefined".startsWith();`).loaded).toMatchObject({value:true}));

test("cyclic symbol lookup is a typed boundary retaining sibling",()=>{
  const input=ESObject({});input.prototype=input;
  const result=run('let trace="";if(selected){trace="prefix";"a".startsWith(input);}else trace="sibling";',{input,selected:ESBoolean()});
  const all=leaves(result);expect(all.find(([v])=>v.type==="ExecutionBoundary")[0]).toMatchObject({kind:"unsupported"});
  expect(all.find(([v])=>v.type==="ExecutionBoundary")[1].value.scope.trace).toMatchObject({value:"prefix"});
  expect(all.find(([v])=>v===Undefined)[1].value.scope.trace).toMatchObject({value:"sibling"});
});
for(const customize of ["unknown","unmodeled"]) test(`regexp ${customize} prototype cannot invent default match`,()=>{
  const input=createRegExpLiteral("a","");
  if(customize==="unknown") input.prototype=Object.assign(ESObject({},"unmodeled"),{unknownProperties:"partial-regexp-prototype"});
  else input.unmodeledPrototype="embedding-prototype";
  const [done]=run('"abc".startsWith(input);',{input});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
});
test("Object prototype match false cannot override intrinsic RegExp match",()=>{
  const proto=getObjectPrototype(), saved=proto.wellKnownSymbols;
  try {
    proto.wellKnownSymbols=new Map([[matchSymbol,ESBoolean(false)]]);
    const [done,after]=run('let caught=false;try{"abc".startsWith(/a/);}catch(e){caught=e instanceof TypeError;}');
    expect(done).toBe(Undefined);expect(after.value.scope.caught).toMatchObject({value:true});
  } finally {proto.wellKnownSymbols=saved;}
});
test("RegExp own false match allows ordinary conversion and its throw",()=>{
  const input=createRegExpLiteral("a","");
  input.wellKnownSymbols=new Map<object,Any>([[matchSymbol,ESBoolean(false)],[toPrimitiveSymbol,Undefined]]);
  Object.assign(input.properties,{toString:Undefined}); // Embedding declares the own conversion property.
  const [done,after]=run('let trace="";let caught;input.toString=function(){trace="search";throw "S";};try{"abc".startsWith(input,{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e;}',{input});
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"search"});expect(after.value.scope.caught).toMatchObject({value:"S"});
});

const upstreamCases = [
  "coerced-values-of-position", "out-of-bounds-position", "return-abrupt-from-position",
  "return-abrupt-from-searchstring", "return-abrupt-from-this", "return-true-if-searchstring-is-empty",
  "searchstring-found-with-position", "searchstring-found-without-position",
  "searchstring-not-found-with-position", "searchstring-not-found-without-position",
  "this-is-null-throws", "this-is-undefined-throws", "searchstring-is-regexp-throws"
];
test.each(upstreamCases)("whole upstream startsWith case agrees with pinned Node: %s", name=>{
  assertPinnedNode();
  const file=loadTest262("built-ins/String/prototype/startsWith/"+name+".js");
  const sta=readFileSync(join(test262Root,"harness/sta.js"),"utf8");
  const assert=readFileSync(join(test262Root,"harness/assert.js"),"utf8");
  for(const directive of ["",'"use strict";\n']) {
    expect(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ["-e",'const vm=require("node:vm"), context=vm.createContext();'+
        'vm.runInContext('+JSON.stringify(sta)+',context);'+
        'vm.runInContext('+JSON.stringify(assert)+',context);'+
        'vm.runInContext('+JSON.stringify(directive+file.contents)+',context);process.stdout.write("passed");'],
      {encoding:"utf8",timeout:10000,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}})).toBe("passed");
  }
});
