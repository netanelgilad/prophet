import { evaluateCode, nodeInitialExecutionContext, isExecutionBoundary, isForkedCompletion } from "../src";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESString } from "../src/string/String";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESObject } from "../src/Object";
import { getObjectPrototype } from "../src/Object/prototype";
import { matchSymbol } from "../src/Object/wellKnownSymbols";
import { createRegExpLiteral } from "../src/regexp/RegExp";
import { Undefined } from "../src/types";
import { resolveBoolean } from "../src/symbolic";
import { compareModule, nodeModuleObservation, withModuleFixture } from "./commonjs/oracle";

// Independent reviewer cases: class membership must fold BEFORE class negation,
// and ASCII punctuation must not be accidentally folded by a bitwise shortcut.
const controls = [
  String.raw`/^[a-z]+$/i.test("AZaz") && !/^[a-z]+$/i.test("[\\]^_")`,
  String.raw`/^[^a-z]+$/i.test("[\\]^_") && !/^[^a-z]+$/i.test("Z")`,
  String.raw`/^[A-z]$/i.test("_") && /^[A-z]$/i.test("[") && !/^[^A-z]$/i.test("_")`,
  String.raw`/^[a-cX-Z]+$/i.test("ABCxyz") && !/^[a-cX-Z]+$/i.test("D")`,
  String.raw`/^[^a-cX-Z]+$/i.test("D_") && !/^[^a-cX-Z]+$/i.test("y")`,
  String.raw`/^\x61\u0042$/i.test("Ab") && /^\u005a$/i.test("z")`,
  String.raw`/^(ab|CD){2}$/i.test("ABcd") && !/^(ab|CD){2}$/i.test("ABce")`,
  String.raw`/^[\w\s]+$/i.test("A_9\t") && /^[\W]+$/i.test("!") && !/^[\W]+$/i.test("a")`,
  String.raw`/^[^\W]+$/i.test("aZ9_") && !/^[^\W]+$/i.test("!")`,
  String.raw`/^[@` + "`" + String.raw`]$/i.test("@") && !/^[@` + "`" + String.raw`]$/i.test("A")`,
  String.raw`!/^a$/i.test("A\n") && /^.$/i.test("A") && !/^.$/i.test("\n")`,
  `"abc".startsWith("",Infinity) && "abc".startsWith("a",-Infinity) && !"abc".startsWith("a",Infinity)`,
  String.raw`"\ud83d\ude00".startsWith("\ude00",1) && !"\ud83d\ude00".startsWith("\ud83d",1)`,
  `String.prototype.startsWith.call(123,"12") && String.prototype.startsWith.call(false,"fal")`,
  `"undefined".startsWith() && !"".startsWith()`,
];
controls.forEach((expression,i)=>{
  const source=`module.exports=(${expression});`;
  test(`independent native case ${i}`,()=>withModuleFixture(source,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`independent interpreted case ${i}`,()=>expect(compareModule(source).loaded).toMatchObject({value:true}));
});

const ordered = [
  `let trace="";const r=/a/i;r.lastIndex={valueOf(){trace=trace+"i";return 17;}};const input={toString(){trace="s";return "A";}};module.exports=r.test(input) && trace==="si";`,
  `let trace="";let caught;const r=/a/i;r.lastIndex={valueOf(){trace=trace+"i";throw "index";}};try{r.test({toString(){trace="s";return "A";}});}catch(e){caught=e;}module.exports=caught==="index" && trace==="si";`,
  `let trace="";let caught;const r=/a/i;r.lastIndex={valueOf(){trace="wrong";return 1;}};try{r.test({toString(){trace="s";throw "input";}});}catch(e){caught=e;}module.exports=caught==="input" && trace==="s";`,
  `let trace="";const p={valueOf(){trace=trace+"p";return {};},toString(){trace=trace+"P";return "1";}};const s={toString(){trace=trace+"s";return {};},valueOf(){trace=trace+"S";return "b";}};module.exports="abc".startsWith(s,p) && trace==="sSpP";`,
  `let trace="";let caught;try{String.prototype.startsWith.call({toString(){trace="r";return "abc";}},/a/,{valueOf(){trace="wrong";return 0;}});}catch(e){caught=e instanceof TypeError;}module.exports=caught && trace==="r";`,
];
ordered.forEach((source,i)=>{
  test(`independent native ordering ${i}`,()=>withModuleFixture(source,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));
  test(`independent interpreted ordering ${i}`,()=>expect(compareModule(source).loaded).toMatchObject({value:true}));
});

test("case-insensitive finite choices retain correlation without a guessed answer",()=>{
  const [done,after]=evaluateCode(`const input=choose?"Ab":"XY";const re=choose?/ab/i:/xy/i;
    const proof=re.test(input);const answer=/ab/i.test(input);const correlated=choose?answer:!answer;`,
    setVariablesInScope(nodeInitialExecutionContext,{choose:ESBoolean()}));
  expect(done).toBe(Undefined);
  expect(resolveBoolean(after.value.scope.proof as any,after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.correlated as any,after.value.knowledge)).toBe(true);
  expect(resolveBoolean(after.value.scope.answer as any,after.value.knowledge)).toBeUndefined();
});

test("startsWith conversion mutations persist across symbolic alternatives",()=>{
  const [done,after]=evaluateCode(`let count=0;const search={toString(){count++;return choose?"a":"z";}};
    const position={valueOf(){count++;return choose?0:2;}};const answer="abz".startsWith(search,position);
    const proof=answer && count===2;`,setVariablesInScope(nodeInitialExecutionContext,{choose:ESBoolean()}));
  expect(done).toBe(Undefined);
  expect(resolveBoolean(after.value.scope.proof as any,after.value.knowledge)).toBe(true);
});

test("unsupported RegExp unicode preserves completed siblings and earlier conversions",()=>{
  const [done]=evaluateCode(`let trace="";let caught=false;let finished=false;
    try{if(choose){const r=/a/i;r.lastIndex={valueOf(){trace=trace+"i";return 0;}};
    r.test({toString(){trace="s";return "é";}});}else trace="sibling";finished=true;}catch(e){caught=true;}`,
    setVariablesInScope(nodeInitialExecutionContext,{choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);
  if(!isForkedCompletion(done))throw Error("expected fork");
  expect(isExecutionBoundary(done.consequent[0])).toBe(true);
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"si"});
  expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.consequent[1].value.scope.finished).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
  expect(done.alternate[1].value.scope.finished).toMatchObject({value:true});
});

test("open startsWith input cannot hide a later conversion exception",()=>{
  const [done,after]=evaluateCode(`let caught;let trace="";try{input.startsWith("a",{valueOf(){trace="p";throw 19;}});}catch(e){caught=e;}`,
    setVariablesInScope(nodeInitialExecutionContext,{input:ESString()}));
  expect(done).toBe(Undefined);
  expect(after.value.scope.trace).toMatchObject({value:"p"});
  expect(after.value.scope.caught).toMatchObject({value:19});
});


test("native intrinsic RegExp match shadows Object.prototype false",()=>withModuleFixture(`
  Object.prototype[Symbol.match]=false;
  let caught=false;try{"a".startsWith(/a/);}catch(e){caught=e instanceof TypeError;}
  module.exports=caught;`,file=>expect(nodeModuleObservation(file)).toEqual({kind:"return",value:{type:"boolean",value:true}})));

test("intrinsic RegExp match shadows Object.prototype false",()=>{
  const prototype=getObjectPrototype();const saved=prototype.wellKnownSymbols;
  try{
    prototype.wellKnownSymbols=new Map([[matchSymbol,ESBoolean(false)]]);
    const [done,after]=evaluateCode(`let trace="";let caught=false;try{String.prototype.startsWith.call(
      {toString(){trace="r";return "abc";}},/a/,{valueOf(){trace="wrong";return 0;}});
      }catch(e){caught=e instanceof TypeError;}`,nodeInitialExecutionContext);
    expect(done).toBe(Undefined);
    expect(after.value.scope.trace).toMatchObject({value:"r"});
    expect(after.value.scope.caught).toMatchObject({value:true});
  }finally{prototype.wellKnownSymbols=saved;}
});

test("explicit undefined match on genuine RegExp still rejects by internal brand",()=>{
  const input=createRegExpLiteral("a","");input.wellKnownSymbols=new Map([[matchSymbol,Undefined]]);
  const [done,after]=evaluateCode(`let caught=false;try{"a".startsWith(input);}catch(e){caught=e instanceof TypeError;}`,
    setVariablesInScope(nodeInitialExecutionContext,{input}));
  expect(done).toBe(Undefined);expect(after.value.scope.caught).toMatchObject({value:true});
});

test("cyclic symbolic-hook lookup retains prefix and completed sibling",()=>{
  const input=ESObject({});input.prototype=input;
  const [done]=evaluateCode(`let trace="";let caught=false;if(choose){trace="prefix";try{"a".startsWith(input);}catch(e){caught=true;}}else trace="sibling";`,
    setVariablesInScope(nodeInitialExecutionContext,{input,choose:ESBoolean()}));
  expect(isForkedCompletion(done)).toBe(true);if(!isForkedCompletion(done))throw Error("expected fork");
  expect(isExecutionBoundary(done.consequent[0])).toBe(true);
  expect(done.consequent[1].value.scope.trace).toMatchObject({value:"prefix"});
  expect(done.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(done.alternate[1].value.scope.trace).toMatchObject({value:"sibling"});
});
