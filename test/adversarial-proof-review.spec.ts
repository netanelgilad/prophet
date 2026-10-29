import { execFileSync } from "child_process";
import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { Any, ESNumber, TESNumber, TESBoolean } from "../src/types";
import { assertPinnedNode } from "./commonjs/oracle";
beforeAll(assertPinnedNode);

function bounded(low: number, high: number, integer = true): TESNumber {
  const n = ESNumber();
  n.knowledge = [{kind: integer ? "integer" : "finite", subject:n},
    {kind:"order",left:ESNumber(low),right:n,strict:false},
    {kind:"order",left:n,right:ESNumber(high),strict:false}];
  return n;
}
function run(source: string, inputs: {[name:string]:Any} = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, inputs))[1].value;
}
for (const expression of ["(x + y) - y === x", "x + y === y + x", "(x - y) + (y - x) === 0"]) {
  test(`review exact integer affine identity: ${expression}`, () => {
    const state = run(`const result = ${expression};`, {x:bounded(-100,100),y:bounded(-100,100)});
    expect(state.uncaught).toBeUndefined();
    expect(state.scope.result).toMatchObject({value:true});
  });
}
for (const expression of ["(x + 1) - 1 === x", "x - x === 0", "x + y === y + x"]) {
  test(`review unrestricted numbers must not acquire an integer proof: ${expression}`, () => {
    expect((run(`const result = ${expression};`,{x:ESNumber(),y:ESNumber()}).scope.result as TESBoolean).value).toBeUndefined();
  });
}
for (const [low,high,integer] of [[0,1,false],[9007199254740990,9007199254740991,true]] as Array<[number,number,boolean]>) {
  test(`review rounding remains unknown for ${low}..${high}`, () => {
    expect((run("const result = (x + 2) - 2 === x;",{x:bounded(low,high,integer)}).scope.result as TESBoolean).value).toBeUndefined();
  });
}
test("review affine facts do not reuse a property value after alias mutation", () => {
  const state = run(`const a={value:x}; const b=a; const before=a.value;
    b.value=b.value+1; const stale=a.value===before;
    const consistent=a.value===before+1;`,{x:bounded(-100,100)});
  expect(state.scope.stale).toMatchObject({value:false});
  expect(state.scope.consistent).toMatchObject({value:true});
});
test("review symbolic branch mutation does not prove stale heap equality", () => {
  const state = run(`const a={value:x}; const before=a.value;
    if (y>0) a.value=a.value+1; const result=a.value===before;`,
    {x:bounded(-100,100),y:bounded(-1,1)});
  expect((state.scope.result as TESBoolean).value).toBeUndefined();
});
const count = (body:string) => `function count(input){let a=0,b=0; const box={v:0};
  for(let i=0;i<input.length;i++){${body}} return a+b!==input.length;}`;
for (const [label,body,witness] of [
  ["late deviation","if(i===3){}else if(input[i]<0)a++;else b++;","[-1,1,0,0]"],
  ["double count","if(input[i]<0)a++;else b++;if(input[i]===0)b++;","[-1,1,0]"],
  ["cached counter","const saved=b;if(input[i]<0)a++;else b++;b=saved;","[-1,1]"],
  ["heap-dependent deviation","box.v=box.v+1;if(box.v<3){if(input[i]<0)a++;else b++;}","[-1,1,0]"]
]) {
  test(`review ${label} preserves concrete violation`, () => {
    expect(run(count(body)+` const result=count(${witness});`).scope.result).toMatchObject({value:true});
  });
}
test("review pinned Node verifies IEEE and concrete counter witnesses", () => {
  const node=process.env.PROPHET_NODE_BINARY || process.execPath;
  const result=JSON.parse(execFileSync(node,["-e",`console.log(JSON.stringify([process.version,
    (0.1+2)-2===0.1,(9007199254740991+2)-2===9007199254740991,
    Infinity-Infinity===0,NaN+1===1+NaN,Object.is((-0+0)-0,-0)]));`],{encoding:"utf8"}));
  expect(result).toEqual(["v24.21.0",false,false,false,false,false]);
});

// An outer evaluation budget bounds fallback exploration. The summary's own
// isolated arbitrary-state proof has its separate budget; declining it must
// preserve an unfinished result, never manufacture successful termination.
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { hasExecutionBoundary } from "../src/execution-context/Completion";
import { symbolicNumberArray } from "../src/array/symbolic";
for (const [label,body] of [
  ["late index exception", "if(i===999999){}else if(input[i]<0)a++;else b++;"],
  ["zero skipping", "if(input[i]<0)a++;else if(input[i]>0)b++;"],
  ["unrelated binding mutation", "side=side+1;if(input[i]<0)a++;else b++;"],
  ["heap mutation", "box.v=box.v+1;if(input[i]<0)a++;else b++;"],
  ["cached counter overwrite", "const saved=b;if(input[i]<0)a++;else b++;b=saved;"]
]) {
  test(`review arbitrary-state summary declines ${label}`, () => {
    const element=ESNumber(); element.knowledge=[{kind:"finite",subject:element}];
    const input=symbolicNumberArray({minimumLength:0,maximumLength:1000000,element});
    const initial=setVariablesInScope(nodeInitialExecutionContext,{input});
    const limited=ExecutionContext({...initial.value,evaluationBudget:{remaining:65}});
    const [completion]=evaluateCode(count(body).replace("const box={v:0};", label === "heap mutation" ? "const box={v:0};" : label === "unrelated binding mutation" ? "let side=0;" : "")+
      " const result=count(input);",limited);
    expect(hasExecutionBoundary(completion)).toBe(true);
  });
}
test("review identical small outer budget still allows a proved million-element summary", () => {
  const element=ESNumber(); element.knowledge=[{kind:"finite",subject:element}];
  const input=symbolicNumberArray({minimumLength:0,maximumLength:1000000,element});
  const initial=setVariablesInScope(nodeInitialExecutionContext,{input});
  const [completion,state]=evaluateCode(count("if(input[i]<0)a++;else b++;").replace("const box={v:0};", "")+
    " const result=count(input);",ExecutionContext({...initial.value,evaluationBudget:{remaining:65}}));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(state.value.scope.result).toMatchObject({value:false});
});
