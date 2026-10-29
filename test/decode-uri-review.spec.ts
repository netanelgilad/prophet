import { evaluateCode, nodeInitialExecutionContext, isExecutionBoundary, isForkedCompletion } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { ESNull, ESNumber, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { resolveBoolean } from "../src/symbolic";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

// Independent exact-value matrix: native oracle confirms fixtures separately;
// no host decoder result is used to produce the interpreted expectations.
const valid: Array<[string,string]> = [
  ["%3b%3B%2f%2F%3f%3F%3a%3A%40%26%3d%3D%2b%2B%24%2c%2C%23","%3b%3B%2f%2F%3f%3F%3a%3A%40%26%3d%3D%2b%2B%24%2c%2C%23"],
  ["%25%32%46","%2F"], ["%2525","%25"], ["%00%7f","\0\x7f"],
  ["%c2%80","\u0080"], ["%df%bf","\u07ff"], ["%e0%a0%80","\u0800"],
  ["%ed%9f%bf","\ud7ff"], ["%ee%80%80","\ue000"], ["%ef%bf%bf","\uffff"],
  ["%f0%90%80%80","\ud800\udc00"], ["%f4%8f%bf%bf","\udbff\udfff"],
  ["%ef%bb%bf","\ufeff"], ["a+%20b","a+ b"], ["%61%2f%62%20%63","a%2fb c"],
  ["\ud800%61\udfff","\ud800a\udfff"], ["%f0%9f%98%80%2F%41","😀%2FA"],
];
valid.forEach(([input,expected],i)=>{
  const source=`module.exports=decodeURI(${JSON.stringify(input)})===${JSON.stringify(expected)};`;
  test(`native valid decoding ${i}`,()=>withModuleFixture(source,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`interpreted valid decoding ${i}`,()=>expect(compareModule(source).loaded).toMatchObject({value:true}));
});
const invalid=["%","%0","%0G","%G0","%80","%BF","%C0%80","%C1%BF","%C2","%C2a","%C2%20","%DF%FF",
  "%E0%9F%BF","%ED%A0%80","%ED%BF%BF","%E1%80","%E1%80A","%E1%80%G0","%F0%8F%BF%BF","%F4%90%80%80",
  "%F5%80%80%80","%F8%88%80%80%80","%FE","%FF","%F0%90%80","%F0%90%80x","%F0%90%80%00","%61%62%GG"];
const malformedProgram=invalid.map(input=>`try{decodeURI(${JSON.stringify(input)});throw "missed";}catch(e){if(!(e instanceof URIError))throw "wrong";}`).join("\n")+'\nmodule.exports=true;';
test("native malformed UTF8 and escapes",()=>withModuleFixture(malformedProgram,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
invalid.forEach((input,i)=>test(`interpreted malformed decoding ${i}`,()=>expect(compareModule(`let caught=false;try{decodeURI(${JSON.stringify(input)});}catch(e){caught=e instanceof URIError;}module.exports=caught;`).loaded).toMatchObject({value:true})));

const ordered=[
  `let log="";const x={toString(){log=log+"s";return {};},valueOf(){log=log+"v";return "%61";}};module.exports=decodeURI(x)==="a"&&log==="sv";`,
  `let log="";const x={toString(){log="s";throw 19;}};let caught;try{decodeURI(x);}catch(e){caught=e;}module.exports=caught===19&&log==="s";`,
  `let log="";function arg(v){log=log+v;return v;}const x={toString(){log=log+"s";return "%61";}};module.exports=decodeURI(x,arg("e"))==="a"&&log==="es";`,
  `module.exports=decodeURI()==="undefined"&&decodeURI(null)==="null"&&decodeURI(false)==="false"&&decodeURI(-0)==="0";`,
  `let caught=false;try{new decodeURI("a");}catch(e){caught=e instanceof TypeError;}module.exports=caught&&decodeURI.length===1&&decodeURI.name==="decodeURI"&&decodeURI.call(null,"%61")==="a";`,
];
ordered.forEach((source,i)=>{
  test(`native coercion and metadata ${i}`,()=>withModuleFixture(source,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`interpreted coercion and metadata ${i}`,()=>expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("valid and malformed symbolic alternatives preserve catch semantics",()=>{
  const [done,after]=evaluateCode(`let trace="";let caught=false;let answer;try{answer=decodeURI({toString(){trace="s";return choose?"%61":"%ED%A0%80";}});}catch(e){caught=e instanceof URIError;}
    const proof=trace==="s"&&(choose?answer==="a"&&!caught:caught);const unknown=caught;`,setVariablesInScope(nodeInitialExecutionContext,{choose:ESBoolean()}));
  expect(done).toBe(Undefined);expect(resolveBoolean(after.value.scope.proof as any,after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.unknown as any,after.value.knowledge)).toBeUndefined();
});
test("open alternative retains conversion prefix and healthy sibling",()=>{
  const [done]=evaluateCode(`let trace="";let caught=false;try{if(choose){decodeURI({toString(){trace="converted";return input;}});trace="wrong";}else trace=decodeURI("%61");}catch(e){caught=true;}`,
    setVariablesInScope(nodeInitialExecutionContext,{choose:ESBoolean(),input:ESString()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(isExecutionBoundary(done.consequent[0])).toBe(true);expect(done.consequent[1].value.scope.trace).toMatchObject({value:"converted"});
  expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});expect(done.alternate[1].value.scope.trace).toMatchObject({value:"a"});
});
for(const size of [65536,65537])test(`input bound ${size} follows conversion`,()=>{
  const [done,after]=evaluateCode(`let trace="";let caught=false;let answer;try{answer=decodeURI({toString(){trace="s";return input;}});}catch(e){caught=true;}`,
    setVariablesInScope(nodeInitialExecutionContext,{input:ESString("a".repeat(size))}));
  expect(after.value.scope.trace).toMatchObject({value:"s"});expect(after.value.scope.caught).toMatchObject({value:false});
  if(size===65536){expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"a".repeat(size)});}else expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
});
for(const shadow of [Undefined,ESNull])test(`own ${shadow.type} primitive hook shadows inherited unsupported hook`,()=>{
  const proto=ESObject({});proto.wellKnownSymbols=new Map([[toPrimitiveSymbol,ESNumber(1)]]);
  const input=ESObject({});input.prototype=proto;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,shadow]]);
  const [done,after]=evaluateCode(`input.toString=function(){return "%61";};const answer=decodeURI(input);`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"a"});
});
test("cycle in primitive hook lookup is a typed boundary with retained state",()=>{
  const input=ESObject({});input.prototype=input;
  const [done,after]=evaluateCode(`let trace="before";let caught=false;try{decodeURI(input);trace="wrong";}catch(e){caught=true;}`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(after.value.scope.trace).toMatchObject({value:"before"});expect(after.value.scope.caught).toMatchObject({value:false});
});

// R1: an explicit absent primitive hook ends that lookup, but does not prove
// later ordinary method lookup complete. Only actually reached reads may stop.
for(const shadow of [Undefined,ESNull])test(`partial ordinary lookup after own ${shadow.type} hook retains sibling`,()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,shadow]]);
  const [done]=evaluateCode(`let trace="";let caught=false;if(choose){trace="prefix";try{decodeURI(input);trace="wrong";}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});

test("own toString success never inspects unsupported fallback or parent",()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`let trace="";input.toString=function(){trace="string";return "%61";};const answer=decodeURI(input);`,
    setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"string"});expect(after.value.scope.answer).toMatchObject({value:"a"});
});

test("fallback lookup boundary retains earlier toString effects and healthy sibling",()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done]=evaluateCode(`let trace="";let caught=false;input.toString=function(){trace="string";return {};};if(choose){try{decodeURI(input);}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"string"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});

test("toString may install its fallback in the current heap",()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`let trace="";input.toString=function(){trace="s";input.valueOf=function(){trace=trace+"v";return "%61";};return {};};const answer=decodeURI(input);`,
    setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.trace).toMatchObject({value:"sv"});expect(after.value.scope.answer).toMatchObject({value:"a"});
});

test("own converting method shadows a cyclic parent",()=>{
  const input=ESObject({});input.prototype=input;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`input.toString=function(){return "%61";};const answer=decodeURI(input);`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"a"});
});

test("reached ordinary method cycle is typed after an own absent hook",()=>{
  const input=ESObject({});input.prototype=input;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`let trace="prefix";let caught=false;try{decodeURI(input);trace="wrong";}catch(e){caught=true;}`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});expect(after.value.scope.trace).toMatchObject({value:"prefix"});expect(after.value.scope.caught).toMatchObject({value:false});
});

test("conditional own method presence keeps the supported shadow branch",()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done]=evaluateCode(`let trace="prefix";if(choose)input.toString=function(){trace="called";return "%61";};const answer=decodeURI(input);`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toBe(Undefined);expect(done.consequent[1].value.scope.answer).toMatchObject({value:"a"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"called"});
  expect(done.alternate[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"prefix"});
});

test("own noncallable toString shadows partial parent and reaches own valueOf",()=>{
  const parent=ESObject({});parent.unknownProperties="review partial parent";
  const input=ESObject({toString:Undefined});input.prototype=parent;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`input.valueOf=function(){return "%61";};const answer=decodeURI(input);`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"a"});
});

// R2: supported ordinary lookup can still reach the shared intrinsic's internal
// @@toStringTag traversal. Preserve typed boundary and siblings at that point.
for(const location of ["self","parent"])test(`intrinsic Object.toString partial ${location} retains sibling`,()=>{
  const parent=ESObject({});const input=ESObject({toString:Undefined});input.prototype=parent;
  (location==="self"?input:parent).unknownProperties="review partial tag lookup";
  input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done]=evaluateCode(`let trace="prefix";let caught=false;input.toString=Object.prototype.toString;if(choose){try{decodeURI(input);trace="wrong";}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});

test("intrinsic Object.toString cyclic tag lookup retains sibling",()=>{
  const input=ESObject({});input.prototype=input;input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done]=evaluateCode(`let trace="prefix";let caught=false;input.toString=Object.prototype.toString;if(choose){try{decodeURI(input);trace="wrong";}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});

for(const depth of [256,257])for(const direct of [false,true])test(`intrinsic Object.toString depth ${depth} direct=${direct}`,()=>{
  let input=ESObject({});input.prototype=ESNull;
  for(let i=1;i<depth;i++){const next=ESObject({});next.prototype=input;input=next;}
  input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  const [done,after]=evaluateCode(`let trace="prefix";input.toString=Object.prototype.toString;const answer=${direct?"Object.prototype.toString.call(input)":"decodeURI(input)"};trace="done";`,setVariablesInScope(nodeInitialExecutionContext,{input}));
  if(depth===256){expect(done).toBe(Undefined);expect(after.value.scope.answer).toMatchObject({value:"[object Object]"});expect(after.value.scope.trace).toMatchObject({value:"done"});}
  else {expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});expect(after.value.scope.trace).toMatchObject({value:"prefix"});}
});


test("direct Object.toString typed partial boundary preserves healthy sibling",()=>{
  const input=ESObject({});input.unknownProperties="partial direct tag lookup";
  const [done]=evaluateCode(`let trace="prefix";let caught=false;if(choose){try{Object.prototype.toString.call(input);trace="wrong";}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});

for(const kind of ["unmodeled","invalid"])test(`intrinsic Object.toString ${kind} prototype is typed`,()=>{
  const input=ESObject({toString:Undefined});input.wellKnownSymbols=new Map([[toPrimitiveSymbol,Undefined]]);
  if(kind==="unmodeled")input.unmodeledPrototype="review inaccessible prototype";else input.prototype=ESNumber(3);
  const [done]=evaluateCode(`let trace="prefix";let caught=false;input.toString=Object.prototype.toString;if(choose){try{decodeURI(input);trace="wrong";}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(done.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});
