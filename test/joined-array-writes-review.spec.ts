import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { getArrayElements, getPropertyKeys, getProperties } from '../src/execution-context/Heap';
import { Array as ESArray } from '../src/array/Array';
import { getObjectPrototype } from '../src/Object/prototype';
import { Any, ESNumber, Undefined, WithProperties } from '../src/types';
import { PropertyKeys } from '../src/execution-context/PropertyKeys';
import { resolveBoolean, assume } from '../src/symbolic';
import { assertPinnedNode } from './commonjs/oracle';

beforeAll(assertPinnedNode);
function run(source: string, inputs: { [name: string]: Any } = {}) {
  return evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, { flag: ESBoolean(), ...inputs }));
}
function compare(source: string) {
  for (const flag of [true, false]) {
    expect(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
      ['-e', `const flag=${flag};${source};process.stdout.write(JSON.stringify(proof));`],
      { encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })).toBe('true');
  }
  const [completion, context] = run(source);
  expect(completion).toBe(Undefined);
  expect(context.value.scope.proof).toMatchObject({ value: true });
}

test('review: holes remain absent and own undefined remains present after joined growth', () => {
  compare(`const a=[undefined,,3];a.length=flag?1:3;a[4]=undefined;
    const proof=a.length===5 && a.hasOwnProperty('0') && a[0]===undefined &&
      !a.hasOwnProperty('1') && !a.hasOwnProperty('3') && a.hasOwnProperty('4') && a[4]===undefined &&
      (flag?!a.hasOwnProperty('2'):a[2]===3);`);
});
test('review: truncation then regrowth never resurrects deleted elements', () => {
  compare(`const a=[1,2,3];a.length=flag?0:2;a.length=4;a[3]=9;a.length=1;a.length=4;
    const proof=a.length===4 && !a.hasOwnProperty('1') && !a.hasOwnProperty('2') &&
      !a.hasOwnProperty('3') && (flag?!a.hasOwnProperty('0'):a[0]===1);`);
});
test('review: inherited data is current and new own values shadow it', () => {
  compare(`const a=[1,2];a.length=flag?0:1;Object.prototype[0]=7;
    const before=a[0];a[0]=undefined;Object.prototype[1]=8;a.length=2;
    const proof=(flag?before===7:before===1) && a[0]===undefined && a.hasOwnProperty('0') &&
      a[1]===8 && !a.hasOwnProperty('1');`);
});
test('review: non-index names survive truncation and stored integer keys enumerate numerically', () => {
  const source=`const a=[1,2];a.length=flag?0:1;a.label=7;a['01']=8;a['4294967295']=9;
    a[10]=10;a[2]=2;a.length=3;const proof=a.length===3 && a.label===7 && a['01']===8 && a['4294967295']===9;`;
  compare(source);
  const flag=ESBoolean();const [completion,context]=run(source,{flag});expect(completion).toBe(Undefined);
  const order=getPropertyKeys(context.value.scope.a as WithProperties,context);
  for(const selected of [true,false]) {
    const knowledge=assume(context.value.knowledge||[],flag,selected)!;
    const keys=(entry:PropertyKeys):ReadonlyArray<string>=>entry.kind==='keys'?entry.keys:
      keys(resolveBoolean(entry.condition,knowledge)===true?entry.consequent:entry.alternate);
    const native=JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,
      ['-e',`const flag=${selected};${source};process.stdout.write(JSON.stringify(Object.getOwnPropertyNames(a)));`],{encoding:'utf8'}));
    expect(keys(order)).toEqual(native);
  }
});
test('review: receiver and key are captured before RHS replaces the local receiver', () => {
  compare(`let trace='';const a=[1,2],b=[8];a.length=flag?0:1;let target=a;
    function receiver(){trace=trace+'o';return target;}function key(){trace=trace+'k';return 1;}
    function rhs(){trace=trace+'r';target=b;return 9;}const assigned=receiver()[key()]=rhs();
    const proof=trace==='okr' && assigned===9 && target===b && b[0]===8 && b.length===1 && a[1]===9 && a.length===2;`);
});
test('review: throwing RHS preserves earlier side effects but never writes the destination', () => {
  compare(`const a=[1,2];a.length=flag?0:1;let trace='';let caught=false;
    function rhs(){trace='r';throw 42;}try{a[3]=rhs();}catch(e){caught=e===42;}
    const proof=caught && trace==='r' && !a.hasOwnProperty('3') && (flag?a.length===0:a.length===1);`);
});
test('review: aliases observe current state while older execution context stays immutable', () => {
  const a=ESArray([ESNumber(1),ESNumber(2)]);
  const [, joined]=run('a.length=flag?0:1;', { a });
  expect(getArrayElements(a, joined)).toBeUndefined();
  const [completion, after]=evaluateCode('const alias=a;a[2]=9;const proof=alias===a && alias[2]===9 && a.length===3;', joined);
  expect(completion).toBe(Undefined);expect(after.value.scope.proof).toMatchObject({value:true});
  const [oldCompletion, old]=evaluateCode('const oldProof=flag?a.length===0:a.length===1;', joined);
  expect(oldCompletion).toBe(Undefined);expect(old.value.scope.oldProof).toMatchObject({value:true});
  expect(getArrayElements(a,nodeInitialExecutionContext)).toEqual([ESNumber(1),ESNumber(2)]);
});
test('review: uint32 maximum index grows sparsely and maximum length name remains ordinary', () => {
  compare(`const a=[1];a.length=flag?0:1;a[4294967294]=7;a[4294967295]=8;
    const atMax=a.length===4294967295 && a[4294967294]===7;
    a.length=1;const proof=atMax && a.length===1 && !a.hasOwnProperty('4294967294') &&
      a[4294967295]===8 && (flag?!a.hasOwnProperty('0'):a[0]===1);`);
});
test('review: unsafe inherited setter boundary preserves RHS effects and the previous heap', () => {
  const a=ESArray([ESNumber(1),ESNumber(2)]);
  const [, joined]=run('a.length=flag?0:1;', {a});
  const proto=getObjectPrototype(),saved=proto.propertyAccess;
  try {
    proto.propertyAccess={read(){return undefined;},write(){throw new Error('unverified setter must not run');}};
    const [completion, after]=evaluateCode('let rhs=0;let caught=false;try{a[2]=(rhs=1);}catch(e){caught=true;}',joined);
    expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
    expect(after.value.scope.caught).toMatchObject({value:false});
    expect(getArrayElements(a,after)).toBeUndefined();
  } finally {if(saved===undefined)delete proto.propertyAccess;else proto.propertyAccess=saved;}
});

test('review: unsafe receiver hook is rejected before invoking unverified code', () => {
  const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
  let calls=0;
  a.propertyAccess={read(){return undefined;},write(){calls++;return undefined;}};
  const [completion,after]=evaluateCode('let rhs=0;a[2]=(rhs=1);',joined);
  expect(hasExecutionBoundary(completion)).toBe(true);expect(calls).toBe(0);
  expect(after.value.scope.rhs).toMatchObject({value:1});
  expect(getProperties(a,after)).toBe(getProperties(a,joined));
});

for(const scenario of ['property-count','key-depth','key-cycle','length-depth','length-cycle','unknown-length']) {
  test(`review: ${scenario} boundary preserves RHS effect and existing storage`,()=>{
    const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
    // Deliberately malformed/oversized host state tests bounded rejection,
    // independently of the parser and guest-side construction budgets.
    const prior=joined.value.heap!.get(a)!;
    if(scenario==='property-count') {
      prior.properties={...prior.properties};for(let i=0;i<4097;i++)prior.properties['extra'+i]=ESNumber(i);
    } else if(scenario.startsWith('key-')) {
      let order:PropertyKeys={kind:'keys',keys:['length']};
      if(scenario==='key-depth')for(let i=0;i<34;i++)order={kind:'choice',condition:ESBoolean(),consequent:order,alternate:{kind:'keys',keys:['length']}};
      else {order={kind:'choice',condition:ESBoolean(),consequent:order,alternate:order};order.consequent=order;}
      prior.keyOrder=order;
    } else {
      let length:Any=ESNumber(0);
      if(scenario==='unknown-length')length=ESNumber();
      else {
        for(let i=0;i<(scenario==='length-depth'?18:1);i++)length={...ESNumber(),expression:{kind:'select',condition:ESBoolean(),consequent:length,alternate:ESNumber(1)}} as Any;
        if(scenario==='length-cycle')(length as any).expression.consequent=length;
      }
      prior.properties={...prior.properties,length};
    }
    const [completion,after]=evaluateCode('let rhs=0;a[2]=(rhs=1);',joined);
    expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
    expect(after.value.heap!.get(a)).toBe(prior);
  });
}

for(const scenario of ['cycle','depth']) test(`review: ${scenario} in a length guard rejects before solver recursion`,()=>{
  const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
  let guard=ESBoolean();
  for(let i=0;i<(scenario==='depth'?100:1);i++)guard={...ESBoolean(),expression:{kind:'not',operand:guard}};
  if(scenario==='cycle')(guard.expression as any).operand=guard;
  const prior=joined.value.heap!.get(a)!;
  prior.properties={...prior.properties,length:{...ESNumber(),expression:{kind:'select',condition:guard,consequent:ESNumber(1),alternate:ESNumber(4)}} as Any};
  const [completion,after]=evaluateCode('let rhs=0;a[2]=(rhs=1);',joined);
  expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
  expect(after.value.heap!.get(a)).toBe(prior);
});

for(const field of ['unmodeledPropertyReads','unmodeledPropertyWrites'] as Array<'unmodeledPropertyReads'|'unmodeledPropertyWrites'>) test(`review: oversized inherited ${field} is bounded before scan`,()=>{
  const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
  const proto=getObjectPrototype(),saved=proto[field];
  try {
    const names=Array.from({length:257},(_,i)=>'unrelated'+i);
    names.includes=()=>{throw new Error('oversized metadata must not scan');};proto[field]=names;
    const [completion,after]=evaluateCode('let rhs=0;a[2]=(rhs=1);',joined);
    expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
    expect(after.value.heap!.get(a)).toBe(joined.value.heap!.get(a));
  } finally {if(saved===undefined)delete proto[field];else proto[field]=saved;}
});

test('review: wide finite length choices hit the choice work cap before mutation',()=>{
  const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
  function choices(depth:number):Any{return depth===0?ESNumber(1):{...ESNumber(),expression:{kind:'select',condition:ESBoolean(),consequent:choices(depth-1),alternate:choices(depth-1)}} as Any;}
  const prior=joined.value.heap!.get(a)!;prior.properties={...prior.properties,length:choices(8)};
  const [completion,after]=evaluateCode('let rhs=0;a[2]=(rhs=1);',joined);
  expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
  expect(after.value.heap!.get(a)).toBe(prior);
});

test('review: length assignment returns negative zero but stores positive zero',()=>{
  compare(`const a=[1,2];a.length=flag?0:1;const assigned=(a.length=-0);
    const proof=1/assigned===-Infinity && 1/a.length===Infinity && !a.hasOwnProperty('0');`);
});
for(const source of ['-1','1.5','NaN','Infinity','4294967296','"1"','{valueOf:function(){called=1;return 1;}}']) {
  test(`review: unsupported joined length ${source} is explicit and leaves receiver untouched`,()=>{
    const a=ESArray([ESNumber(1),ESNumber(2)]);const [,joined]=run('a.length=flag?0:1;',{a});
    const [completion,after]=evaluateCode(`let called=0;let rhs=0;a.length=(rhs=1,${source});`,joined);
    expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
    expect(after.value.scope.called).toMatchObject({value:0});expect(after.value.heap!.get(a)).toBe(joined.value.heap!.get(a));
  });
}
for(const shape of ['unknown','segments']) test(`review: ${shape} array storage remains unsupported`,()=>{
  const a=shape==='unknown'?ESArray():ESArray([ESArray([ESNumber(1)])],'segments');
  const [completion,after]=run('let rhs=0;a[0]=(rhs=1);',{a});
  expect(hasExecutionBoundary(completion)).toBe(true);expect(after.value.scope.rhs).toMatchObject({value:1});
  expect(after.value.heap && after.value.heap.get(a)).toBeUndefined();
});
