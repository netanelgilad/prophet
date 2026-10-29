import { ESTree } from "cherow";
import { evaluate } from "../evaluate";
import { BranchResult } from "../execution-context/branches";
import { ExecutionContext, TExecutionContext } from "../execution-context/ExecutionContext";
import { getSymbolicArrayShape, SymbolicNumberArray } from "../array/symbolic";
import { choiceOf, exactIntegerEndpoint, isFiniteNumber, strictEquality } from "../symbolic";
import { Knowledge } from "../symbolic/model";
import { ESNumber, TESNumber, isESNumber } from "../types";
import { slot, valueAt, replace, normal, inspect, guardedHeader, localEnvironments,
  proofContext, pure, Slot } from "./unknown-length-summary";

function integer(lower: number, upper: number): TESNumber {
  const n = ESNumber();
  n.knowledge = [{kind:"integer",subject:n},{kind:"finite",subject:n},
    {kind:"order",left:ESNumber(lower),right:n,strict:false},
    {kind:"order",left:n,right:ESNumber(upper),strict:false}];
  return n;
}
function binary(operator: string, left: TESNumber, right: TESNumber): TESNumber {
  const n = ESNumber(); n.expression = {kind:"binary",operator,left,right}; return n;
}
function conserved(a: TESNumber, b: TESNumber, oldA: TESNumber, oldB: TESNumber,
  next: TESNumber, knowledge: Knowledge, depth = 0): boolean {
  if (depth > 8) return false;
  const ca = choiceOf(a), cb = choiceOf(b), c = ca || cb;
  if (c) {
    return [true,false].every(truth => {
      const choose = (n: TESNumber) => {
        const choice = choiceOf(n);
        return choice && choice.condition === c.condition ?
          (truth ? choice.consequent : choice.alternate) : n;
      };
      const x=choose(a), y=choose(b);
      return isESNumber(x) && isESNumber(y) && conserved(x,y,oldA,oldB,next,
        knowledge.concat({kind:"truth",condition:c.condition,truth}),depth+1);
    });
  }
  // Every accepted transition preserves nonnegativity and a <= next index:
  // each counter stays put or increases by one, and their sum is the successor.
  const increments = (n: TESNumber, old: TESNumber) =>
    strictEquality(n,old,knowledge).value === true ||
    strictEquality(n,binary("+",old,ESNumber(1)),knowledge).value === true;
  return increments(a,oldA) && increments(b,oldB) &&
    strictEquality(binary("+",a,b),next,knowledge).value === true;
}
function unchanged(before: TExecutionContext, after: TExecutionContext, slots: Slot[]): boolean {
  let inspectedBindings = 0;
  for (const [environment,record] of before.value.environments) {
    const now=after.value.environments.get(environment);
    if (!now || now.size !== record.size) return false;
    for (const [name,binding] of record) {
      if (++inspectedBindings > 256) return false;
      const next=now.get(name);
      if (!next || next.kind!==binding.kind || next.mutable!==binding.mutable ||
          next.initialized!==binding.initialized) return false;
      if (next.value!==binding.value && !slots.some(s=>s.environment===environment && s.name===name)) return false;
    }
  }
  return true;
}
// Candidate generation is syntactic only for the loop guard; every candidate
// pair is checked using the real body/update and isolated arbitrary state.
export function trySummarizeCounters(ast: ESTree.ForStatement, reached: TExecutionContext,
  copy: (context:TExecutionContext)=>BranchResult): TExecutionContext | undefined {
  const header=guardedHeader(ast);
  if (!header || !ast.update || !inspect(ast.body,{remaining:96}) ||
      !inspect(ast.update,{remaining:96})) return undefined;
  try {
    const arraySlot=slot(reached,header.arrayName), index=slot(reached,header.indexName);
    if (!arraySlot || !index || !isESNumber(index.binding.value) || index.binding.value.value!==0) return undefined;
    const shape=getSymbolicArrayShape(arraySlot.binding.value,reached), locals=localEnvironments(reached);
    if (!shape || !locals || shape.offset!==0 || shape.minimumLength===shape.maximumLength ||
        !isFiniteNumber(shape.sequence.element)) return undefined;
    const array=arraySlot.binding.value as SymbolicNumberArray, length=array.properties.length;
    const candidates: Slot[]=[];
    let inspectedBindings = 0;
    for (const environment of locals) for (const [name,binding] of reached.value.environments.get(environment) || []) {
      if (++inspectedBindings > 256) return undefined;
      if (binding.mutable && isESNumber(binding.value) && binding.value.value===0 &&
        !(environment===index.environment && name===index.name)) candidates.push({environment,name,binding});
      if (candidates.length > 4) return undefined;
    }
    if (candidates.length<2 || candidates.length>4) return undefined;
    for(let x=0;x<candidates.length;x++) for(let y=x+1;y<candidates.length;y++) {
      const first=candidates[x], second=candidates[y], isolated=proofContext(reached,array);
      if (!isolated) return undefined;
      const k=integer(0,shape.maximumLength-1), a=integer(0,shape.maximumLength-1);
      a.knowledge=a.knowledge!.concat({kind:"order",left:a,right:k,strict:false});
      const b=binary("-",k,a);
      b.knowledge=[{kind:"integer",subject:b},{kind:"finite",subject:b},
        {kind:"order",left:ESNumber(0),right:b,strict:false},
        {kind:"order",left:b,right:ESNumber(shape.maximumLength-1),strict:false}];
      let proof=replace(replace(replace(isolated.context,index,k),first,a),second,b);
      proof=ExecutionContext({...proof.value,knowledge:(proof.value.knowledge||[]).concat({kind:"order",left:k,right:length,strict:true})});
      const test=evaluate(ast.test!,proof), tested=normal(test);
      if (!tested || (test[0] as any).value!==true || !pure(proof,tested)) continue;
      const afterBody=normal(evaluate(ast.body,tested));
      if (!afterBody || !pure(proof,afterBody) || !unchanged(proof,afterBody,[index,first,second])) continue;
      const afterCopy=normal(copy(afterBody)); if(!afterCopy || !pure(proof,afterCopy)) continue;
      const copiedIndex=slot(afterCopy,header.indexName);
      const after=normal(evaluate(ast.update,afterCopy));
      if(!after || !copiedIndex || !pure(proof,after) || !unchanged(afterCopy,after,[copiedIndex]) ||
          !unchanged(proof,after,[index,first,second])) continue;
      const ni=slot(after,header.indexName), va=valueAt(after,first), vb=valueAt(after,second);
      if(!ni || !isESNumber(ni.binding.value) || !isESNumber(va) || !isESNumber(vb)) continue;
      const endpoint=exactIntegerEndpoint(ni.binding.value,after.value.knowledge||[]);
      if(!endpoint || endpoint.base!==k || endpoint.offset!==1 ||
          !conserved(va,vb,a,b,ni.binding.value,after.value.knowledge||[])) continue;
      const exit=proofContext(reached,array); if(!exit) return undefined;
      const head=replace(exit.context,index,length), checked=evaluate(ast.test!,head), done=normal(checked);
      if(!done || (checked[0] as any).value!==false || !pure(head,done)) continue;
      const resultA=integer(0,shape.maximumLength);
      resultA.knowledge=resultA.knowledge!.concat({kind:"order",left:resultA,right:length,strict:false});
      const resultB=binary("-",length,resultA);
      // Exact bounded difference of integers is itself exact; give the proven
      // nonnegative range explicitly for later arithmetic and comparisons.
      resultB.knowledge=[{kind:"integer",subject:resultB},{kind:"finite",subject:resultB},
        {kind:"order",left:ESNumber(0),right:resultB,strict:false},
        {kind:"order",left:resultB,right:length,strict:false}];
      return replace(replace(replace(reached,index,length),first,resultA),second,resultB);
    }
  } catch (_) { /* Disposable proof: ordinary execution retains all boundaries. */ }
  return undefined;
}
