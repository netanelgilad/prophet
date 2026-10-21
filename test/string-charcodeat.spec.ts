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

// Explicit results, independently checked in pinned Node before implementation.
// "NaN" marks the not-a-number answer; NaN !== NaN is the portable check.
const cases: Array<[string, string, number | "NaN"]> = [
  ["abc", "", 97],
  ["abc", ",0", 97],
  ["abc", ",2", 99],
  ["abc", ",3", "NaN"],
  ["abc", ",-1", "NaN"],
  ["abc", ",0.9", 97],
  ["abc", ",2.9", 99],
  ["abc", ",-0.9", 97],
  ["abc", ",NaN", 97],
  ["abc", ",Infinity", "NaN"],
  ["abc", ",-Infinity", "NaN"],
  ["abc", ",null", 97],
  ["abc", ",undefined", 97],
  ["abc", ",true", 98],
  ["abc", ",false", 97],
  ["abc", ",{}", 97],
  ["abc", ',"1"', 98],
  ["abc", ',"3.9"', "NaN"],
  ["abc", ",-0", 97],
  ["", ",0", "NaN"],
  ["/hello.txt", ",9", 116],
  ["x\ud83d\ude00y", ",1", 55357],
  ["x\ud83d\ude00y", ",2", 56832],
  ["\ud800", ",0", 55296],
  ["\udfff", ",0", 57343],
  ["\u00e9", ",0", 233],
  ["a\0a", ",1", 0]
];
const matrixBody = cases.map(([text, position, answer], i) =>
  `const r${i} = ${literal(text)}.charCodeAt(${position.slice(1)}); if (${answer === "NaN" ? `!(r${i} !== r${i})` : `r${i} !== ${answer}`}) throw "matrix ${i}";`).join("\n");
test("native explicit UTF-16 and position matrix", () => withModuleFixture(matrixBody + '\nmodule.exports=true;', file =>
  expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
cases.forEach(([text, position, expected], i) => test(`VM UTF-16 and position matrix ${i}`, () => {
  const [done, after] = run(`const answer=input.charCodeAt(${position.slice(1)});`, {input:ESString(text)});
  expect(done).toBe(Undefined);
  if (expected === "NaN") expect(Number.isNaN((after.value.scope.answer as any).value)).toBe(true);
  else expect(after.value.scope.answer).toMatchObject({value:expected});
}));

const programs = [
  `const f=String.prototype.charCodeAt; module.exports=f.call(true,0)===116 && f.call(12321,1)===50 && f.call({},0)===91 && f.call("",0)!==f.call("",0) && "null".charCodeAt(1)===117;`,
  `let trace="";const r={toString(){trace=trace+"r";return "abc";}};const p={valueOf(){trace=trace+"p";return 2;}};const n=String.prototype.charCodeAt.call(r,p);module.exports=n===99 && trace==="rp";`,
  `let trace="";let caught;try{String.prototype.charCodeAt.call(null,{valueOf(){trace="wrong";throw "wrong";}});}catch(e){caught=e instanceof TypeError && e.message==="String.prototype.charCodeAt called on null or undefined";}module.exports=caught && trace==="";`,
  `let trace="";let caught;try{String.prototype.charCodeAt.call(undefined,{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e instanceof TypeError && e.message==="String.prototype.charCodeAt called on null or undefined";}module.exports=caught && trace==="";`,
  `let trace="";let caught;function extra(){trace="arg";throw "extra";}try{String.prototype.charCodeAt.call(null,0,extra());}catch(e){caught=e;}module.exports=trace==="arg" && caught==="extra";`,
  `let trace="";let caught;try{"a".charCodeAt({valueOf(){trace="p";throw "P";}});}catch(e){caught=e;}module.exports=trace==="p" && caught==="P";`,
  `let trace="";let caught;try{String.prototype.charCodeAt.call({toString(){trace="r";throw "R";}},0);}catch(e){caught=e;}module.exports=trace==="r" && caught==="R";`,
  `const old="abc",f=old.charCodeAt,own=Object.prototype.hasOwnProperty;let caught=false;try{new f();}catch(e){caught=e instanceof TypeError;}
    const meta=f.name==="charCodeAt" && f.length===1 && f.prototype===undefined && own.call(String.prototype,"charCodeAt") && own.call(f,"name") && own.call(f,"length") && !own.call(f,"prototype") && !own.call(f,"call");
    String.prototype.charCodeAt=function(){"use strict";return 42;};module.exports=caught && meta && old.charCodeAt(0)===42 && f.call(old,0)===97;`,
  `const f=String.prototype.charCodeAt;const r={toString(){String.prototype.charCodeAt=function(){"use strict";return 7;};return "abc";}};module.exports=f.call(r,1)===98 && "x".charCodeAt(0)===7;`,
  `function C(){} C.prototype.toString=function(){return "abc";};const r=new C();const a=String.prototype.charCodeAt.call(r,0);C.prototype.toString=function(){return "z";};module.exports=a===97 && String.prototype.charCodeAt.call(r,0)===122;`,
  `module.exports="abc".charCodeAt({valueOf(){return undefined;}})===97 && "abc".charCodeAt({valueOf(){return null;}})===97 && "abc".charCodeAt({valueOf(){return 2.9;}})===99;`,
  `const f=String.prototype.charCodeAt;f.call=function(){"use strict";return 55;};module.exports=f.call("abc",1)===55 && "abc".charCodeAt(1)===98;`
];
programs.forEach((source,i) => {
  test(`native conversion and identity ${i}`, () => withModuleFixture(source,file =>
    expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`VM conversion and identity ${i}`, () => expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("finite operands and conversion results preserve correlation and mandatory unknown", () => {
  const [done,after]=run(`let calls=0;const r={toString(){calls=calls+1;return selected?"abc":"z";}};
    const p={valueOf(){calls=calls+1;return selected?2:0;}};
    const value=String.prototype.charCodeAt.call(r,p);const proof=calls===2 && (selected?value===99:value===122);const unknown=value===99;`,{selected:ESBoolean()});
  expect(done).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});expect((after.value.scope.unknown as any).value).toBeUndefined();
});

for(const operand of ["receiver","position"]) for(const throwing of [false,true]) test(`open ${operand} still performs later conversion (${throwing})`,()=>{
  const [done,after]=run(`let trace="";let caught=false;let cleaned=false;
    const r={toString(){trace=trace+"r";return ${operand==="receiver"?"input":'"abc"'};}};
    const p={valueOf(){trace=trace+"p";${throwing?'throw "P";':`return ${operand==="position"?"input":"2"};`}}};
    try{String.prototype.charCodeAt.call(r,p);}catch(e){caught=e;}finally{cleaned=true;}`,{input:operand==="position"?ESNumber():ESString()});
  expect(after.value.scope.trace).toMatchObject({value:"rp"});
  if(throwing){expect(done).toBe(Undefined);expect(after.value.scope.caught).toMatchObject({value:"P"});expect(after.value.scope.cleaned).toMatchObject({value:true});}
  else{expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(after.value.scope.caught).toMatchObject({value:false});expect(after.value.scope.cleaned).toMatchObject({value:false});}
});

test("open receiver does not suppress position throw",()=>{
  const [done,after]=run(`let trace="";let caught;try{String.prototype.charCodeAt.call(input,{valueOf(){trace="pos";throw "P";}});}catch(e){caught=e;}`,{input:ESString()});
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"pos"});expect(after.value.scope.caught).toMatchObject({value:"P"});
});

test("array, function and symbol-operand conversions stop as typed boundaries",()=>{
  // Native controls: [1] coerces to 1 (answer 98); a Symbol position throws a
  // native TypeError. The VM stops both as typed boundaries rather than
  // guessing the conversion.
  for(const operand of ["[1]","[]"]) {
    const [done]=run(`"abc".charCodeAt(${operand});`);
    expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported",
      message:"String.charCodeAt array/function or exotic operand conversion is not yet supported"});
  }
});

test("large receivers complete: one unit is read, no scan budget applies",()=>{
  const [done,after]=run("const answer=input.charCodeAt(99999);",{input:ESString("a".repeat(99999)+"b")});
  expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:98});
});

for(const expression of ['String.prototype.charCodeAt.bind','String.prototype.charCodeAt.caller','String.prototype.charCodeAt.arguments','String.prototype.charCodeAt.name="x"','String.prototype.charCodeAt.length=2','Object.keys(String.prototype.charCodeAt)','({...String.prototype.charCodeAt})','"x".charAt','"x".codePointAt']) test(`residual metadata/deferred ${expression}`,()=>{
  const [done]=run(`const any=(${expression});`);
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
});
