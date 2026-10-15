import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { Any, ESNumber, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function literal(text: string) { return JSON.stringify(text).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029"); }

// Explicit results, independently checked in pinned Node 24.21.0 before
// implementation.
const cases: Array<[string, string, string, boolean]> = [
  ["hello", "llo", "", true],
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
  ["abc", "b", ",undefined", true],
  ["abc", "1", "", false],
  ["123", "2", "", true],
  ["abcabc", "bc", ",3", true],
  ["abcabc", "bc", ",4", true],
  ["x\ud83d\ude00y\ud83d\ude00", "\ud83d\ude00", "", true],
  ["x\ud83d\ude00y\ud83d\ude00", "\ude00", ",4", true],
  ["x\ud83d\ude00y\ud83d\ude00", "\ud83d\ude00", ",4", true],
  ["\u00e9\ud800\u00e9\udfff", "\udfff", "", true],
  ["\u00e9", "e\u0301", "", false],
  ["a\0a\0", "\0", "", true]
];
const matrix = cases.map(([text, needle, position, answer]) =>
  `if (${literal(text)}.includes(${literal(needle)}${position}) !== ${answer}) throw "matrix";`).join("\n");
test("native explicit UTF-16 and position matrix", () => withModuleFixture(matrix + '\nmodule.exports=true;', file =>
  expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
cases.forEach(([text, needle, position, expected], i) => test(`VM UTF-16 and position matrix ${i}`, () => {
  const [done, after] = run(`const answer=input.includes(needle${position});`, {input:ESString(text),needle:ESString(needle)});
  expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:expected});
}));

const programs = [
  `module.exports="null".includes(null)===true && "undefined".includes(undefined)===true && "true".includes(true)===true && "123".includes(2)===true && "abc".includes("a","1")===false && "abc".includes("a","x")===true && "abc".includes("a",null)===true && "abc".includes("b",true)===true;`,
  `let trace="";let caught;const s={toString(){trace="wrong";return "a";}};try{String.prototype.includes.call(null,s,{valueOf(){throw "wrong";}});}catch(e){caught=e instanceof TypeError && e.message==="String.prototype.includes called on null or undefined";}module.exports=caught && trace==="";`,
  `let trace=""; function arg(label,x){trace=trace+label;return x;} const r={toString(){trace=trace+"r";return "abcabc";}};
    const s={toString(){trace=trace+"s";return "bc";}};const p={valueOf(){trace=trace+"p";return 3;}};
    const n=String.prototype.includes.call(r,arg("a",s),arg("b",p),arg("x",0));module.exports=n===true && trace==="abxrsp";`,
  `let trace="";let caught;try{String.prototype.includes.call({toString(){trace="r";throw "R";}},{toString(){trace="wrong";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="r" && caught==="R";`,
  `let trace="";let caught;try{String.prototype.includes.call({toString(){trace="r";return "a";}},{toString(){trace=trace+"s";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}module.exports=trace==="rs" && caught==="S";`,
  `let trace="";let caught;try{"a".includes("longer",{valueOf(){trace="p";throw "P";}});}catch(e){caught=e;}module.exports=trace==="p" && caught==="P";`,
  `const old="abcabc",f=old.includes,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}
    const meta=f.name==="includes" && f.length===1 && f.prototype===undefined && own.call(String.prototype,"includes") && own.call(f,"name") && own.call(f,"length") && !own.call(f,"prototype") && !own.call(f,"call");
    String.prototype.includes=function(){"use strict";return "swapped";};module.exports=caught && meta && old.includes("bc")==="swapped" && f.call(old,"bc")===true;`,
  `const f=String.prototype.includes;const r={toString(){String.prototype.includes=function(){"use strict";return "swapped";};return "abcabc";}};module.exports=f.call(r,"bc")===true && "x".includes("")==="swapped";`,
  `module.exports="abcabc".includes("a",{valueOf(){return undefined;}})===true && "abcabc".includes("a",{valueOf(){return null;}})===true && "abcabc".includes("bc",{valueOf(){return 4;}})===true;`
];
programs.forEach((source,i) => {
  test(`native conversion and identity ${i}`, () => withModuleFixture(source,file =>
    expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`VM conversion and identity ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("finite operands and conversion results preserve correlation and mandatory unknown", () => {
  const [done,after]=run(`let calls=0;const r={toString(){calls=calls+1;return selected?"abcabc":"xyx";}};
    const s={toString(){calls=calls+1;return selected?"bc":"q";}};const p={valueOf(){calls=calls+1;return selected?3:0;}};
    const value=String.prototype.includes.call(r,s,p);const proof=calls===3 && (selected?value===true:value===false);const unknown=value===true;`,{selected:ESBoolean()});
  expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
});

for(const operand of ["receiver","search","position"]) test(`open ${operand} still performs later conversions then stops`,()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return ${operand==="receiver"?"input":'"abcabc"'};}};
    const s={toString(){trace=trace+"s";return ${operand==="search"?"input":'"bc"'};}};
    const p={valueOf(){trace=trace+"p";return ${operand==="position"?"input":"3"};}};
    try{String.prototype.includes.call(r,s,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:operand==="position"?ESNumber():ESString()});
  expect(after.value.scope.trace).toMatchObject({value:"rsp"});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(after.value.scope.caught).toMatchObject({value:false});
  expect(after.value.scope.cleaned).toMatchObject({value:false});
});

test("open receiver does not suppress search throw",()=>{
  const [done,after]=run(`let trace="";let caught;try{String.prototype.includes.call(input,{toString(){trace="search";throw "S";}},{valueOf(){trace="wrong";}});}catch(e){caught=e;}`,{input:ESString()});
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"search"});expect(after.value.scope.caught).toMatchObject({value:"S"});
});

test("oversized operands stop as budget boundaries after conversions",()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return input;}};
    const s={toString(){trace=trace+"s";return "bc";}};
    const p={valueOf(){trace=trace+"p";return 0;}};
    try{String.prototype.includes.call(r,s,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:ESString("a".repeat(65537))});
  expect(after.value.scope.trace).toMatchObject({value:"rsp"});
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  expect(after.value.scope.caught).toMatchObject({value:false});
  expect(after.value.scope.cleaned).toMatchObject({value:false});
});
