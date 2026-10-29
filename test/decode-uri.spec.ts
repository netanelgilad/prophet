import { spawnSync } from "child_process";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ESNumber, ESNull, Undefined } from "../src/types";
import { ESObject } from "../src/Object";
import { getObjectPrototype } from "../src/Object/prototype";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { resolveBoolean } from "../src/symbolic";
import { assertPinnedNode, compareModule } from "./commonjs/oracle";

const controls = [
  `module.exports = decodeURI("%2f%2F%23%25%252f") === "%2f%2F%23%%2f";`,
  `module.exports = decodeURI("%C2%80%E0%A0%80%EF%BF%BF%F0%90%80%80%F4%8F%BF%BF") === "\\u0080\\u0800\\uFFFF\\uD800\\uDC00\\uDBFF\\uDFFF";`,
  `module.exports = decodeURI("\\uD800%00\\uDC00") === "\\uD800\\0\\uDC00";`,
  `module.exports = decodeURI() === "undefined" && decodeURI(null) === "null" && decodeURI(true) === "true" && decodeURI(12) === "12";`,
  `let log = ""; const input = {toString() {log = log + "s"; return {};}, valueOf() {log = log + "v"; return "%41";}}; const answer = decodeURI(input); module.exports = log === "sv" && answer === "A";`,
  `let log = ""; const input = {toString() {log = log + "s"; throw "input";}, valueOf() {log = "wrong";return "%41";}}; let caught=false; try {decodeURI(input);} catch(e) {caught=e==="input";} module.exports=caught&&log==="s";`,
  `let caught=false; try {decodeURI({toString(){return {};},valueOf(){return {};}});} catch(e) {caught=e instanceof TypeError;} module.exports=caught;`,
  `let count=0; const extra={toString(){count=count+1;return "ignored";}}; const answer=decodeURI("%41",extra); module.exports=answer==="A"&&count===0;`,
  `let count=0; function arg(){count=count+1;return 9;} const answer=decodeURI("%41",arg()); module.exports=answer==="A"&&count===1;`,
  `let caught=false; try {new decodeURI("%41");} catch(e) {caught=e instanceof TypeError;} module.exports=caught&&decodeURI.length===1&&decodeURI.name==="decodeURI"&&decodeURI.prototype===undefined&&decodeURI.call(null,"%41")==="A";`
];
controls.forEach((source,i)=>test(`decodeURI native control ${i}`,()=>expect(compareModule(source).loaded).toMatchObject({value:true})));

const malformed = ["%", "%A", "%x0", "%0x", "%80", "%BF", "%C0%AF", "%C1%BF", "%C2", "%C2A0", "%C2%7F", "%C2%C0", "%E0%A0", "%E0%80%AF", "%ED%A0%80", "%F0%80%80%AF", "%F0%90%80", "%F4%90%80%80", "%F5%80%80%80", "%F8", "valid%41%FF"];
malformed.forEach(input=>test(`malformed URIError ${input}`,()=>expect(compareModule(`let caught=false; try {decodeURI(${JSON.stringify(input)});} catch(e) {caught=e instanceof URIError;} module.exports=caught;`).loaded).toMatchObject({value:true})));

test("finite valid/malformed choices retain conversion effects and correlation",()=>{
  const [result,after]=evaluateCode(`let log=""; let answer=""; let caught=false; const input={toString(){log="converted";return selected?"%41":"%FF";}};
    try {answer=decodeURI(input);} catch(e) {caught=e instanceof URIError;}
    const proof=selected?answer==="A"&&!caught:answer===""&&caught; const unknown=caught;`,setVariablesInScope(nodeInitialExecutionContext,{selected:ESBoolean()}));
  expect(result).toBe(Undefined); expect(resolveBoolean(after.value.scope.proof as any,after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.unknown as any,after.value.knowledge)).toBeUndefined(); expect(after.value.scope.log).toMatchObject({value:"converted"});
});

for(const input of [ESString(), ESNumber(), ESString("a".repeat(65537))]) test(`unknown/budget keeps converted prefix and normal sibling ${input.type}`,()=>{
  const [result]=evaluateCode(`let log=""; const input={toString(){log="converted";return selected?candidate:"%41";}};
    try {decodeURI(input);log="done";}catch(e){log="caught";}`,setVariablesInScope(nodeInitialExecutionContext,{selected:ESBoolean(),candidate:input}));
  expect(isForkedCompletion(result)).toBe(true);if(!isForkedCompletion(result))throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({type:"ExecutionBoundary"});expect(result.consequent[1].value.scope.log).toMatchObject({value:"converted"});
  expect(result.alternate[0]).toBe(Undefined);expect(result.alternate[1].value.scope.log).toMatchObject({value:"done"});
});

test("exact input limit and decoding cap",()=>{
  const input="a".repeat(65536); const [result,after]=evaluateCode('const answer=decodeURI(input);',setVariablesInScope(nodeInitialExecutionContext,{input:ESString(input)}));
  expect(result).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:input});
});

for(const expression of ['["%41"]','function sample(){}'])test(`deferred conversion ${expression}`,()=>{
  const [result]=evaluateCode(`let log="before";if(selected){decodeURI(${expression});log="wrong";}else log="sibling";`,setVariablesInScope(nodeInitialExecutionContext,{selected:ESBoolean()}));
  expect(isForkedCompletion(result)).toBe(true);if(!isForkedCompletion(result))throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(result.alternate[1].value.scope.log).toMatchObject({value:"sibling"});
});

test("inherited custom primitive hook remains unsupported",()=>{
  const prototype=Object.assign(ESObject(),{wellKnownSymbols:new Map([[toPrimitiveSymbol,ESNumber(1)]])});
  const input=Object.assign(ESObject(),{prototype,modeledPrototype:true});
  const [result]=evaluateCode('decodeURI(input);',setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(result).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
});

test("deterministic valid scalar decoding matches pinned Node",()=>{
  assertPinnedNode();const inputs=["", "%00", "%7F", "%C2%80", "%DF%BF", "%E0%A0%80", "%ED%9F%BF", "%EE%80%80", "%EF%BF%BF", "%F0%90%80%80", "%F4%8F%BF%BF", "%ef%bb%bf", "%F0%9F%98%80"];
  const child=spawnSync(process.env.PROPHET_NODE_BINARY||process.execPath,["-e",'process.stdout.write(JSON.stringify(JSON.parse(process.argv[1]).map(x=>decodeURI(x))))',JSON.stringify(inputs)],{encoding:"utf8",timeout:10000,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
  expect(child.status).toBe(0);const expected=JSON.parse(child.stdout);
  inputs.forEach((input,i)=>{const[result,after]=evaluateCode('const answer=decodeURI(input);',setVariablesInScope(nodeInitialExecutionContext,{input:ESString(input)}));expect(result).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:expected[i]});});
});


for (const depth of [256, 257]) test(`symbol lookup depth ${depth} is bounded before recursion`, () => {
  let input = getObjectPrototype();
  for (let i = 1; i < depth; i++) input = Object.assign(ESObject(), {prototype: input, modeledPrototype: true});
  const [result, after] = evaluateCode('let log="before"; const answer=decodeURI(input); log="done";', setVariablesInScope(nodeInitialExecutionContext, {input}));
  if (depth === 256) {
    expect(result).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:"[object Object]"});
    expect(after.value.scope.log).toMatchObject({value:"done"});
  } else {
    expect(result).toMatchObject({type:"ExecutionBoundary", kind:"budget", message:"decodeURI symbol lookup exceeds 256 prototype objects"});
    expect(after.value.scope.log).toMatchObject({value:"before"});
  }
});


for (const hook of [Undefined, ESNull]) test(`own absent primitive hook keeps partial ordinary failure typed ${hook.type}`, () => {
  const input=Object.assign(Object.assign(ESObject(), {unknownProperties:"partial fixture"}), {wellKnownSymbols:new Map([[toPrimitiveSymbol,hook]])});
  const [result]=evaluateCode('let log="before";if(selected){decodeURI(input);log="wrong";}else log="sibling";',setVariablesInScope(nodeInitialExecutionContext,{selected:ESBoolean(),input}));
  expect(isForkedCompletion(result)).toBe(true);if(!isForkedCompletion(result))throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(result.consequent[1].value.scope.log).toMatchObject({value:"before"});
  expect(result.alternate[1].value.scope.log).toMatchObject({value:"sibling"});
});

test("own ordinary method shadows partial parent after own absent primitive hook", () => {
  const [setup, context]=evaluateCode('const input={toString(){return "%41";}};',nodeInitialExecutionContext);
  expect(setup).toBe(Undefined);
  Object.assign(context.value.scope.input,{prototype:Object.assign(ESObject(), {unknownProperties:"partial parent"}),wellKnownSymbols:new Map([[toPrimitiveSymbol,Undefined]])});
  const [result, after]=evaluateCode('const answer=decodeURI(input);',context);
  expect(result).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"A"});
});

test("fallback checks current ordinary method after interpreted mutation", () => {
  const source='let log="";const input={toString(){log=log+"s";input.valueOf=function(){log=log+"v";return "%42";};return {};},valueOf(){throw "stale";}};module.exports=decodeURI(input)==="B"&&log==="sv";';
  expect(compareModule(source).loaded).toMatchObject({value:true});
});

test("partial fallback retains reached toString effects and sibling", () => {
  const [setup, context]=evaluateCode('let log="";const input={toString(){log="converted";return {};}};',setVariablesInScope(nodeInitialExecutionContext,{selected:ESBoolean()}));
  expect(setup).toBe(Undefined);
  Object.assign(context.value.scope.input,{unknownProperties:"partial fallback",wellKnownSymbols:new Map([[toPrimitiveSymbol,Undefined]])});
  const [result]=evaluateCode('if(selected){decodeURI(input);log="wrong";}else log="sibling";',context);
  expect(isForkedCompletion(result)).toBe(true);if(!isForkedCompletion(result))throw new Error("expected fork");
  expect(result.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(result.consequent[1].value.scope.log).toMatchObject({value:"converted"});
  expect(result.alternate[1].value.scope.log).toMatchObject({value:"sibling"});
});
