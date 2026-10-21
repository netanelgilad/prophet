import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseScript } from "cherow";
import { evaluateCode, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { parseECMACompliant } from "../src/parseECMACompliant";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ESObject } from "../src/Object";
import { Any, Undefined } from "../src/types";
import { ESString } from "../src/string/String";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { invoke } from "../src/ASTResolvers";
import { createConsoleModel } from "../src/node/console";

// Same independent reviewer, correction1 exact source 5c70d29ef65012c4615d6e9c39e63d99a6cf3047.
// Original 41-probe spec and all original review artifacts stay immutable.
const root=join(__dirname,"..");
const logs=join(root,"logs/p011-correction-review",process.env.PROPHET_REVIEW_RUN||"manual");
let sequence=0;
function native(body:string,input:any=null):any {
 mkdirSync(logs,{recursive:true});const binary=process.env.PROPHET_NODE_BINARY||process.execPath;
 const source='if(process.version!=="v24.21.0")throw Error(process.version);const input=JSON.parse(require("fs").readFileSync(0,"utf8"));'+body;
 const argv=["--no-global-search-paths","-e",source],start=new Date().toISOString();
 const child=spawnSync(binary,argv,{cwd:root,input:JSON.stringify(input),encoding:"utf8",timeout:20000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}});
 const p=join(logs,"native-"+sequence++);writeFileSync(p+".json",JSON.stringify({binary,argv,cwd:root,input,start,end:new Date().toISOString(),timeoutMs:20000,env:{NODE_OPTIONS:"",NODE_PATH:""},status:child.status,signal:child.signal,error:child.error&&String(child.error)},null,2));writeFileSync(p+".stdout",child.stdout);writeFileSync(p+".stderr",child.stderr);
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.stderr).toBe("");return JSON.parse(child.stdout);
}
function run(source:string,inputs:{[key:string]:Any}={}){return evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));}
function leaves(r:any):any[]{return isForkedCompletion(r[0])?leaves(r[0].consequent).concat(leaves(r[0].alternate)):[r];}
function both(source:string){expect(native('process.stdout.write(JSON.stringify(Function(input+";return answer;")()));',source)).toBe(true);const[d,s]=run(source);expect(d).toBe(Undefined);expect(s.value.scope.answer).toMatchObject({value:true});}
function nodes(ast:any):any[]{if(!ast||typeof ast!=="object")return [];let all=typeof ast.type==="string"?[ast]:[];for(const key of Object.keys(ast)){if(key==="loc")continue;const child=ast[key];all=all.concat(Array.isArray(child)?([] as any[]).concat(...child.map(nodes)):nodes(child));}return all;}
const message="BigInt static property keys are not yet supported";
const keys=['0n','1n','9007199254740993n','18446744073709551617n','0xffn','0XABn','0b101n','0B11n','0o77n','0O10n'];
const trivia=['',' ','\t\v\f','/* n: 0n */','/*😀*/\r\n','// n:0n\n','\u2028','\u2029','\u00a0\ufeff'];
const prefixes=['','/*😀𝄞*/\r\n','const 文=1;\u2028','// comment\r\n\r\n','const astral="😀";\n'];

for(const route of ['object','binding','method'])test('correction independent token-end/trivia/coordinate matrix '+route,()=>{
 // Fixed bounded preparation: 10 keys x 9 separators x 5 prefixes per route.
 const names=native('process.stdout.write(JSON.stringify(input.map(k=>String(Function("return "+k)()))));',keys);
 const rows:any[]=[];
 keys.forEach((key,i)=>trivia.forEach(gap=>prefixes.forEach(prefix=>{
  const expression=route==='object'?`const x={prior:(mark=1),${key}${gap}:(mark=9)};const n=~x[${JSON.stringify(names[i])}];`:
   route==='method'?`const x={prior:(mark=1),${key}${gap}(){return 9;}};const n=~x[${JSON.stringify(names[i])}]();`:
   `function rhs(){mark=1;return {${JSON.stringify(names[i])}:9};}const {first:prior=(mark=2),${key}${gap}:x=(mark=9)}=rhs();const n=~x;`;
  rows.push({key,gap,prefix,source:prefix+'let mark=0;'+expression});
 })));
 const expected=native('process.stdout.write(JSON.stringify(input.map(r=>Function(r.source+";return {n,mark};")())));',rows);
 expect(expected.every((r:any)=>r.n===-10)).toBe(true);
 rows.forEach((r,i)=>{
  const original:any=parseScript(r.source,{raw:true,loc:true,ranges:true});
  const rawKey=nodes(original).find(n=>n.type==='Property'&&!n.computed&&n.key.type==='Identifier'&&typeof n.key.name==='number').key;
  expect(r.source.slice(rawKey.start,rawKey.end)).toBe(r.key);
  const ast=parseECMACompliant(r.source);const marked=nodes(ast).filter(n=>Object.prototype.hasOwnProperty.call(n,'bigint'));
  expect(marked).toHaveLength(1);expect(marked[0]).toMatchObject({type:'Identifier',bigint:'',loc:rawKey.loc});
  for(const n of nodes(ast)){expect(n).not.toHaveProperty('start');expect(n).not.toHaveProperty('end');expect(n).not.toHaveProperty('range');}
  const[d,s]=run(r.source);expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported',message});expect(s.value.scope.mark).toMatchObject({value:route==='binding'?2:1});
  expect((d as any).frames.some((f:any)=>f.node.type=== (route==='binding'?'VariableDeclaration':'ObjectExpression'))).toBe(true);
  rows[i].native=expected[i];rows[i].vm={kind:(d as any).kind,message:(d as any).message,mark:(s.value.scope.mark as any).value};
 });
 writeFileSync(join(logs,'matrix-'+route+'.json'),JSON.stringify(rows,null,2));console.log('CORRECTION_MATRIX',route,rows.length);
},30000);

test('correction independent ordinary AST metadata and property-name controls',()=>{
 const sources=prefixes.map(prefix=>prefix+'const start=1,end=2,n=3;const x={start,end,n,0:4,1.5:5,1e20:6,0XAB:7,9007199254740993:8,"1n":9,"":10,method(){return 11;}};const {9007199254740993:rounded,"1n":quoted}=x;');
 for(const source of sources)expect(parseECMACompliant(source)).toEqual(parseScript(source,{loc:true,raw:true}));
 for(const gap of trivia)both(`const x={9007199254740993${gap}:8,"9007199254740993n"${gap}:9,0XAB${gap}:7,n${gap}:6};const {9007199254740993${gap}:a,"9007199254740993n"${gap}:b}=x;const answer=a===8&&b===9&&x["9007199254740992"]===8&&x["9007199254740993"]===undefined&&x["171"]===7&&x.n===6;`);
 both('const start=1,end=2;const x={start,end,1(){return this.start;},"1n"(){return this.end;}};const answer=x[1]()===1&&x["1n"]()===2&&/1n/.test("1n")&&"😀".length===2;');
});

test('correction independent lazy bodies and no offset leakage anywhere',()=>{
 const source='function unused(){const x={0n /* x */:8};const {1n /* x */:a}=x;return a;}const arrow=()=>({0xffn:9});const x={method(){return {0b1n:9};}};const answer=true;';
 both(source);const all=nodes(parseECMACompliant(source));expect(all.filter(n=>Object.prototype.hasOwnProperty.call(n,'bigint'))).toHaveLength(4);
 all.forEach(n=>{expect(n).not.toHaveProperty('start');expect(n).not.toHaveProperty('end');expect(n.loc).toBeDefined();});
 const[d,s]=run('let mark=1;function later(){mark=2;return {0n /* x */:8};}mark=3;const n=later();');expect(d).toMatchObject({message});expect(s.value.scope.mark).toMatchObject({value:2});
});

for(const route of ['object','binding','method'])test('correction independent current effects and all siblings '+route,()=>{
 const console=createConsoleModel();
 const operation=route==='object'?'const x={earlier:prior(),9007199254740993n /* suffix */:later()};':
  route==='method'?'const x={earlier:prior(),9007199254740993n /* suffix */(){return later();}};':
  'const {first:x=prior(),9007199254740993n /* suffix */:y=later()}=rhs();';
 const setup='let trace="",caught=false,cleaned=false;const box={n:0};const alias=box;function C(){}C.prototype.valueOf=function(){return 1;};const instance=new C();function rhs(){trace="r";console.log("r");alias.n=4;return {};}function prior(){trace=trace+"p";console.log("p");alias.n=7;C.prototype.valueOf=function(){return 8;};if(b)throw "G";if(c)return "x".charAt;return 8;}function later(){trace=trace+"bad";console.log("bad");return 9;}';
 const source=setup+`if(a){try{${operation}}catch(e){caught=e;}finally{cleaned=true;console.log("f");}}else{trace="s";console.log("s");}`;
 const all=leaves(run(source,{a:ESBoolean(),b:ESBoolean(),c:ESBoolean(),console:console.module}));
 const boundaries=all.filter(([v])=>v.type==='ExecutionBoundary');expect(boundaries.map(([v])=>v.message).sort()).toEqual([message,'String.prototype.charAt is not yet supported'].sort());expect(all.some(([v])=>v===Undefined)).toBe(true);
 for(const[v,s]of all){const stopped=v.type==='ExecutionBoundary';if(stopped){expect(s.value.scope.trace).toMatchObject({value:route==='binding'?'rp':'p'});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});}
  const[d,t]=evaluateCode('const check=a?box.n===7&&alias===box&&~instance===-9:box.n===0&&~instance===-2;const normal=a?caught==="G"&&cleaned:trace==="s"&&!caught&&!cleaned;',s);expect(d).toBe(Undefined);expect(t.value.scope.check).toMatchObject({value:true});if(!stopped)expect(t.value.scope.normal).toMatchObject({value:true});
  for(const path of console.inspectOutput(s)){const chunks=path.chunks.map(x=>x.value);expect(chunks).toEqual(stopped?(route==='binding'?['r\n','p\n']:['p\n']):chunks[0]==='s\n'?['s\n']:(route==='binding'?['r\n','p\n','f\n']:['p\n','f\n']));}
 }
 // Native witnesses for early guest throw and normal sibling; unsupported is a VM boundary.
 for(const a of [false,true])expect(native('process.stdout.write(JSON.stringify(Function(input)()));',`const a=${a},b=true,c=false,console={log(){}};`+source+';return a?caught==="G"&&cleaned&&box.n===7:trace==="s"&&!cleaned;')).toBe(true);
});

test('correction independent prefix heap objects and persistent snapshots',()=>{
 const[d,before]=run('const box={n:0};const alias=box;function C(){}C.prototype.valueOf=function(){return 1;};const instance=new C();');expect(d).toBe(Undefined);
 const[e,after]=evaluateCode('function prior(){alias.n=7;C.prototype.valueOf=function(){return 8;};return 11;}const x={first:prior(),second:(alias.extra=12),0n /*after*/:99};',before);
 expect(e).toMatchObject({message});const[d1,s1]=evaluateCode('const answer=box.n===7&&alias.extra===12&&~instance===-9;',after);expect(d1).toBe(Undefined);expect(s1.value.scope.answer).toMatchObject({value:true});
 const prefix=Array.from(after.value.heap!.values()).filter(x=>Object.prototype.hasOwnProperty.call(x.properties,'first'));expect(prefix).toHaveLength(1);expect(prefix[0].properties.first).toMatchObject({value:11});expect(prefix[0].properties.second).toMatchObject({value:12});expect(prefix[0].properties).not.toHaveProperty('0');
 const[d2,s2]=evaluateCode('const answer=box.n===0&&alias.extra===undefined&&~instance===-2;',before);expect(d2).toBe(Undefined);expect(s2.value.scope.answer).toMatchObject({value:true});
});

for(const kind of ['var','let','const'])test('correction independent nested binding/RHS/read/default order '+kind,()=>{
 const input=ESObject({});input.propertyAccess={write(){return undefined;},read(name,context){return invoke(context.value.scope.read,[ESString(name)],context,input);}};
 const console=createConsoleModel();
 const source=`let trace="",caught=false,cleaned=false;const box={n:0};function rhs(){trace="r";box.n=1;console.log("r");return input;}function read(key){trace=trace+"g";console.log("g");if(key==="nested")return input;if(key==="first")return undefined;throw "wrong lookup";}function fallback(){trace=trace+"d";box.n=2;console.log("d");return 8;}function later(){trace="wrong default";return 9;}${kind} {nested:{first:prior=fallback(),0n /*late*/:bad=later()}}=rhs();`;
 const[d,s]=run(source,{input,console:console.module});expect(d).toMatchObject({message});expect(s.value.scope.trace).toMatchObject({value:'rggd'});expect(s.value.scope.prior).toMatchObject({value:8});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});
 expect(console.inspectOutput(s).every(p=>JSON.stringify(p.chunks.map(x=>x.value))===JSON.stringify(['r\n','g\n','g\n','d\n']))).toBe(true);
 const[e,t]=evaluateCode('const answer=box.n===2;',s);expect(e).toBe(Undefined);expect(t.value.scope.answer).toMatchObject({value:true});
 const nativeSource='const input={get nested(){return read("nested");},get first(){return read("first");},get 0(){return read("0");}};const console={log(){}};'+source.replace(kind+' {nested:','try{'+kind+' {nested:')+'}catch(e){caught=e;}return trace==="rggdg"&&caught==="wrong lookup";';
 expect(native('process.stdout.write(JSON.stringify(Function(input)()));',nativeSource)).toBe(true);
});

for(const route of ['object','binding'])for(const early of ['throw','unsupported'])test(`correction independent early ${early} before ${route} key`,()=>{
 const op=route==='object'?'const x={first:before(),0n /* key */:after()};':'const {0n /* key */:bad=after()}=before();';
 const source=`let mark=0,caught=false,cleaned=false;function before(){mark=1;${early==='throw'?'throw "G";':'return "x".charAt;'}}function after(){mark=9;}try{${op}}catch(e){caught=e;}finally{cleaned=true;}`;
 const[d,s]=run(source);expect(s.value.scope.mark).toMatchObject({value:1});if(early==='throw'){expect(d).toBe(Undefined);expect(s.value.scope.caught).toMatchObject({value:'G'});expect(s.value.scope.cleaned).toMatchObject({value:true});both(source+'const answer=mark===1&&caught==="G"&&cleaned;');}else{expect(d).toMatchObject({message:'String.prototype.charAt is not yet supported'});expect(s.value.scope.caught).toMatchObject({value:false});expect(s.value.scope.cleaned).toMatchObject({value:false});}
});

test('correction independent null binding and computed-key precedence',()=>{
 both('let mark=0,caught=false;function rhs(){mark=1;return null;}try{const {0n:bad}=rhs();}catch(e){caught=e instanceof TypeError;}const answer=caught&&mark===1;');
 for(const op of ['const x={prior:(mark=1),[0n /* computed */]:(mark=9)};','function rhs(){mark=1;return {};}const {first:prior=(mark=2),[0n /*computed*/]:bad=(mark=9)}=rhs();']){const[d,s]=run('let mark=0;'+op);expect(d).toMatchObject({message:'BigInt literal evaluation is not yet supported'});expect(s.value.scope.mark).toMatchObject({value:op.includes('rhs')?2:1});}
});

test('correction independent unsupported class/accessor routes remain honest gaps',()=>{
 expect(native('process.stdout.write(JSON.stringify(Function("class C{static 0n(){return 8;}}return C[0]();")()));')).toBe(8);
 const[d,s]=run('let mark=1;class C{static 0n(){return 8;}}mark=2;');expect(d).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});expect(s.value.scope.mark).toMatchObject({value:1});
 // Accessor syntax is an existing legacy guard, not newly supported key execution.
 expect(()=>run('const x={get 0n(){return 8;}};')).toThrow('Object literal accessors are not yet supported');
});
