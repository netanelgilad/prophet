import { spawnSync } from "child_process";
import { join } from "path";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { ESString } from "../src/string/String";
import { stringTrim } from "../src/string/trim";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESObject } from "../src/Object";
import { toPrimitiveSymbol } from "../src/Object/wellKnownSymbols";
import { Any, ESNull, ESNumber, Undefined } from "../src/types";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";

// Independently authored against frozen 0d3b2781147e1625d90da2db5ec6e86c58a238ff.
// Concrete reference runs in a separate pinned process, never in the VM.
function native(body: string, input: any = null): any {
  const child = spawnSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e", 'if(process.version!=="v24.21.0")throw Error(process.version);' +
      'const input=JSON.parse(process.argv[1]);' + body, JSON.stringify(input)],
    { cwd: join(__dirname, ".."), encoding: "utf8", timeout: 15000,
      maxBuffer: 16 * 1024 * 1024, env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "" } });
  expect(child.error).toBeUndefined();
  expect(child.status).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout);
}
function run(source: string, inputs: {[key: string]: Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs));
}
function nativeAnswer(source: string) {
  return native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));', source);
}

test("independent exhaustive BMP single-unit classification against pinned Node", () => {
  const bitmap = native('let bits="";for(let c=0;c<65536;c++)bits+=String.fromCharCode(c).trim()===""?"1":"0";process.stdout.write(JSON.stringify(bits));');
  const mismatches: number[] = [];
  for (let c = 0; c < 65536; c++) {
    const input = String.fromCharCode(c);
    const result = stringTrim(ESString(input), [], nodeInitialExecutionContext).next();
    expect(result.done).toBe(true);
    const actual = (result.value as any)[0].value;
    if (actual !== (bitmap[c] === "1" ? "" : input)) mismatches.push(c);
  }
  expect(mismatches).toEqual([]);
  console.log("INDEPENDENT_BMP_UNITS", 65536);
});

test("independent parsed edge/interior/UTF16 and idempotence matrix", () => {
  const units = [0, 8, 9, 10, 11, 12, 13, 14, 32, 0x85, 0xa0, 0x1680, 0x180e,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
    0x2009, 0x200a, 0x200b, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff, 0xffff];
  const texts = ["", " ", "\ud800", "\udfff", "😀", " \ud800 \udfff "];
  for (const code of units) {
    const unit = String.fromCharCode(code);
    texts.push(unit + "😀" + unit, "x" + unit + "y", " " + unit + " ", unit + unit);
  }
  const expected = native('process.stdout.write(JSON.stringify(input.map(s=>s.trim())));', texts);
  texts.forEach((text, i) => {
    const [completion, after] = run('const answer=input.trim(); const proof=answer.trim()===answer && input===original;',
      {input: ESString(text), original: ESString(text)});
    expect(completion).toBe(Undefined);
    expect(after.value.scope.answer).toMatchObject({value: expected[i]});
    expect(after.value.scope.proof).toMatchObject({value: true});
  });
  console.log("INDEPENDENT_INTERPRETED_STRINGS", texts.length);
});

const programs = [
  'const t=String.prototype.trim; let log=""; const o={toString(){log=log+"s"; String.prototype.trim=function(){"use strict";return "replacement";};return " original ";}}; const first=t.call(o); const answer=first==="original" && " x ".trim()==="replacement" && t.call(" x ")==="x" && log==="s";',
  'const t=String.prototype.trim; let log=""; const o={toString(){log=log+"s";this.valueOf=function(){log=log+"v";return " late ";};return {};},valueOf(){throw "stale";}}; const answer=t.call(o)==="late" && log==="sv";',
  'const t=String.prototype.trim; let log=""; function arg(){log=log+"a";throw "argument";} let caught; try{t.call(null,arg());}catch(e){caught=e;} const answer=caught==="argument" && log==="a";',
  'let log=""; const t=String.prototype.trim; Object.prototype.toString=function(){log="wrong";throw "wrong";}; let n=0; try{t.call(null);}catch(e){if(e instanceof TypeError)n=n+1;} try{t();}catch(e){if(e instanceof TypeError)n=n+1;} const answer=n===2 && log==="";',
  'const t=String.prototype.trim; function C(){} C.prototype.toString=3; C.prototype.valueOf=function(){return false;}; const answer=t.call(new C())==="false" && t.call({toString(){return null;}})==="null" && t.call({toString(){return undefined;}})==="undefined";',
  'const t=String.prototype.trim; String.prototype.toString=function(){return " altered ";}; const answer=t.call(String.prototype)==="altered" && t.call(" x ")==="x";',
  'const t=String.prototype.trim; let log=""; const o={trim:t,toString(){log=log+"s";return " nested ";}}; const result=o.trim({toString(){throw "unused";}}); const answer=result==="nested" && log==="s" && t.name==="trim" && t.length===0 && t.prototype===undefined && t===String.prototype.trim;',
  'const t=String.prototype.trim; let trace=""; let caught; try{new t({toString(){trace="wrong";return "x";}});}catch(e){caught=e instanceof TypeError;} const answer=caught && trace==="";',
  'const t=String.prototype.trim; const o={toString(){return {};},valueOf(){throw "fallback";}}; let caught; try{t.call(o);}catch(e){caught=e;} const answer=caught==="fallback";',
  'const t=String.prototype.trim; t.extra=17; const answer=t.hasOwnProperty("name") && t.hasOwnProperty("length") && !t.hasOwnProperty("prototype") && !t.hasOwnProperty("caller") && t.extra===17;'
];
programs.forEach((source, i) => test("independent concrete receiver/order/identity control " + i, () => {
  expect(nativeAnswer(source)).toBe(true);
  const [completion, after] = run(source);
  expect(completion).toBe(Undefined);
  expect(after.value.scope.answer).toMatchObject({value: true});
}));

test("independent boolean receiver and fallback method choices stay correlated", () => {
  const [completion, after] = run('let count=0; const o={toString: flag ? 1 : function(){count=count+1;return " no ";},valueOf(){count=count+10;return " yes ";}}; const result=String.prototype.trim.call(o); const b=String.prototype.trim.call(flag); const proof=flag ? result==="yes" && count===10 && b==="true" : result==="no" && count===1 && b==="false"; const unknown=result==="yes";', {flag: ESBoolean()});
  expect(completion).toBe(Undefined);
  expect(after.value.scope.proof).toMatchObject({value: true});
  expect((after.value.scope.unknown as any).value).toBeUndefined();
});

test("independent cap stops after conversion and retains guest-throw sibling", () => {
  const source='let count=0; let caught=false; try{String.prototype.trim.call({toString(){count=count+1;if(flag) return large;throw "guest";}});}catch(e){caught=e==="guest";}finally{count=count+10;}';
  const [completion] = run(source, {flag: ESBoolean(), large: ESString("x".repeat(65537))});
  expect(isForkedCompletion(completion)).toBe(true);
  if (!isForkedCompletion(completion)) throw Error("missing fork");
  expect(completion.consequent[0]).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
  expect(completion.consequent[1].value.scope.count).toMatchObject({value:1});
  expect(completion.consequent[1].value.scope.caught).toMatchObject({value:false});
  expect(completion.alternate[0]).toBe(Undefined);
  expect(completion.alternate[1].value.scope.count).toMatchObject({value:11});
  expect(completion.alternate[1].value.scope.caught).toMatchObject({value:true});
  const lengths = [65535, 65536, 65537];
  expect(native('process.stdout.write(JSON.stringify(input.map(n=>(" ".repeat(n-1)+"z").trim())));', lengths)).toEqual(["z","z","z"]);
  lengths.forEach(length => {
    const [done, after] = run('const answer=input.trim();', {input:ESString(" ".repeat(length-1)+"z")});
    if(length>65536) expect(done).toMatchObject({type:"ExecutionBoundary",kind:"budget"});
    else { expect(done).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:"z"}); }
  });
});

test("independent inherited primitive hook boundaries distinguish nullish absence", () => {
  expect(native('process.stdout.write(JSON.stringify([null,undefined].map(h=>String.prototype.trim.call({[Symbol.toPrimitive]:h,toString(){return " ok ";}}))));')).toEqual(["ok","ok"]);
  for (const hook of [Undefined, ESNull, ESNumber(1)]) {
    const proto=ESObject({}); proto.wellKnownSymbols=new Map([[toPrimitiveSymbol,hook]]);
    const input={...ESObject({}),prototype:proto};
    const [completion, after]=run('let count=0; input.toString=function(){count=count+1;return " ok ";}; const answer=String.prototype.trim.call(input);', {input});
    if(hook===Undefined || hook===ESNull) {
      expect(completion).toBe(Undefined); expect(after.value.scope.answer).toMatchObject({value:"ok"});
      expect(after.value.scope.count).toMatchObject({value:1});
    } else {
      expect(completion).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
      expect(after.value.scope.count).toMatchObject({value:0});
    }
  }
});

// The declared metadata domain may stop; it must not invent absence where
// native inherited restricted accessors throw. These are acceptance probes.
for (const field of ["caller", "arguments"]) test("independent restricted trim metadata " + field, () => {
  const source='let answer=false; try{const v=String.prototype.trim.'+field+';answer=v===undefined ? "invented absence" : "other";}catch(e){answer=e instanceof TypeError;}';
  expect(nativeAnswer(source)).toBe(true);
  const [completion, after]=run(source);
  if(completion===Undefined) expect((after.value.scope.answer as any).value).toBe(true);
  else expect(completion).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
});

for (const field of ["caller", "arguments"]) test("independent restricted trim metadata write " + field, () => {
  const source='let answer=false; try{String.prototype.trim.'+field+'=123;answer="invented writable property";}catch(e){answer=e instanceof TypeError;}';
  expect(nativeAnswer(source)).toBe(true);
  const [completion, after]=run(source);
  if(completion===Undefined) expect((after.value.scope.answer as any).value).toBe(true);
  else expect(completion).toMatchObject({type:"ExecutionBoundary",kind:"unsupported"});
});

test("independent open-string/throw/normal frontier retains conversion mutations", () => {
  const [completion] = run('let trace=""; const old=String.prototype.trim; const o={toString(){trace="converted";String.prototype.trim=function(){"use strict";return "changed";};if(a)return input;if(b)throw "guest";return " ok ";}};const answer=old.call(o);trace=trace+answer;',
    {a:ESBoolean(),b:ESBoolean(),input:ESString()});
  const leaves: any[]=[];
  function collect(value:any, context?:any) {
    if(isForkedCompletion(value)) { collect(value.consequent[0],value.consequent[1]); collect(value.alternate[0],value.alternate[1]); }
    else leaves.push([value,context]);
  }
  collect(completion);
  expect(leaves.map(leaf=>leaf[0].type).sort()).toEqual(["ExecutionBoundary","ThrownValue","undefined"]);
  for(const [value,context] of leaves) {
    expect(context.value.scope.trace.value).toBe(value===Undefined ? "convertedok" : "converted");
    const [done,after]=evaluateCode('const current=" x ".trim();',context);
    expect(done).toBe(Undefined);expect(after.value.scope.current).toMatchObject({value:"changed"});
  }
});

test("independent complete unmodified trim candidate native controls and hashes", () => {
  const result=native(`const fs=require("fs"),path=require("path"),vm=require("vm"),crypto=require("crypto");
    const root=path.dirname(require.resolve("test262/package.json"));
    const dir=path.join(root,"test/built-ins/String/prototype/trim");
    const files=fs.readdirSync(dir).filter(x=>x.endsWith(".js")).sort();
    const hashes={},failures=[];let variants=0;
    for(const file of files){const source=fs.readFileSync(path.join(dir,file),"utf8");
      hashes[file]=crypto.createHash("sha256").update(source).digest("hex");
      const attrs=require("test262-parser").parseFile({file,contents:source}).attrs;
      for(const strict of [false,true]){variants++;try{
        const ctx=vm.createContext({});
        for(const inc of ["sta.js","assert.js",...attrs.includes])vm.runInContext(fs.readFileSync(path.join(root,"harness",inc),"utf8"),ctx,{timeout:1000});
        vm.runInContext((strict?'"use strict";\\n':"")+source,ctx,{timeout:1000,filename:file});
      }catch(e){failures.push({file,strict,error:String(e)});}}
    }process.stdout.write(JSON.stringify({files:files.length,variants,failures,hashes}));`);
  expect(result.files).toBe(128);expect(result.variants).toBe(256);expect(result.failures).toEqual([]);
  console.log("INDEPENDENT_UPSTREAM_NATIVE",JSON.stringify(result));
});

for (const expression of ["Object.keys(String.prototype.trim)", "Object.keys(String.prototype)",
  "Object.getOwnPropertyDescriptor(String.prototype.trim, 'name')", "String.prototype.trim.name = 'x'",
  "String.prototype.trim.length = 9"]) test("independent unsupported metadata must not fabricate results: " + expression, () => {
  // Legacy host guard throws remain disclosed boundaries; this test does not
  // require converting every shared guard to typed completion in P008.
  let stopped=false;
  try { const [completion]=run(expression+';'); stopped=(completion as any).type==="ExecutionBoundary"; }
  catch(e) { stopped=true; }
  expect(stopped).toBe(true);
});
