import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isForkedCompletion } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Any, ESNumber, TESBoolean, TESNumber, Undefined } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";

beforeAll(assertPinnedNode);

const sorting = `function outOfOrder(a,b,c) {
  let t;
  if (a>b) { t=a; a=b; b=t; }
  if (b>c) { t=b; b=c; c=t; }
  if (a>b) { t=a; a=b; b=t; }
  return a>b || b>c;
}`;
const broken = `function outOfOrder(a,b,c) {
  let t;
  if (a>b) { t=a; a=b; b=t; }
  if (b>c) { t=b; b=c; c=t; }
  return a>b || b>c;
}`;
function finite(): TESNumber {
  const value=ESNumber();
  value.knowledge=[{kind:"finite",subject:value}];
  return value;
}
function run(source:string, inputs:{[key:string]:Any}) {
  const [completion,context]=evaluateCode(source,setVariablesInScope(nodeInitialExecutionContext,inputs));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isForkedCompletion(completion)).toBe(false);
  expect(completion).toBe(Undefined);
  return context.value.scope;
}
function native(source:string): any {
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ["-e",source+";process.stdout.write(JSON.stringify(answer));"],
    {encoding:"utf8",timeout:10000,env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}}));
}

test("three comparisons prove no descending pair for arbitrary finite inputs",()=>{
  const x=finite(),y=finite(),z=finite();
  const result=run(sorting+'const answer=outOfOrder(x,y,z);const unrelated=x>y;', {x,y,z});
  expect(result.answer).toMatchObject({type:"boolean",value:false});
  expect((result.unrelated as TESBoolean).value).toBeUndefined();
  expect([x.value,y.value,z.value]).toEqual([undefined,undefined,undefined]);
  expect(new Set([x.id,y.id,z.id]).size).toBe(3);
});

test("renaming and reversing comparison syntax preserves the relational proof",()=>{
  const source=sorting.replace(/outOfOrder/g,"arrange").replace(/a>b/g,"b<a").replace(/b>c/g,"c<b");
  expect(run(source+'const answer=arrange(x,y,z);',{x:finite(),y:finite(),z:finite()}).answer)
    .toMatchObject({value:false});
});

test("omitting the final swap must retain both outcomes",()=>{
  const result=run(broken+'const answer=outOfOrder(x,y,z);',{x:finite(),y:finite(),z:finite()});
  expect(result.answer).toMatchObject({type:"boolean"});
  expect((result.answer as TESBoolean).value).toBeUndefined();
  expect(native(broken+'const answer=outOfOrder(2,3,1);')).toBe(true);
  expect(native(broken+'const answer=outOfOrder(1,2,3);')).toBe(false);
});

test("all concrete orderings, ties, zeros and extreme finite values agree with Node",()=>{
  const rows=[[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1],
    [2,2,1],[2,1,2],[1,2,2],[0,-0,0],[-Number.MAX_VALUE,0,Number.MAX_VALUE],
    [Number.MAX_VALUE,Number.MIN_VALUE,-Number.MAX_VALUE]];
  for(const row of rows) {
    const inputs=row.map(n=>Object.is(n,-0)?'-0':String(n)).join(',');
    const source=sorting+'const answer=outOfOrder('+inputs+');';
    expect(native(source)).toBe(false);
    expect(run(source,{}).answer).toMatchObject({value:false});
  }
});

test("a stronger ordered predicate does not establish order for possible NaN",()=>{
  const source=sorting.replace('return a>b || b>c;', 'return a<=b && b<=c;');
  expect(run(source+'const answer=outOfOrder(x,y,z);',{x:finite(),y:finite(),z:finite()}).answer)
    .toMatchObject({value:true});
  const withNaN=run(source+'const answer=outOfOrder(x,0,1);',{x:ESNumber()});
  expect((withNaN.answer as TESBoolean).value).toBeUndefined();
  expect(native(source+'const answer=outOfOrder(NaN,0,1);')).toBe(false);
  expect(native(source+'const answer=outOfOrder(-1,0,1);')).toBe(true);
});
