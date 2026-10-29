import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';
import { Any, ESNumber, TESBoolean, TESNumber, Undefined } from '../src/types';
import { assertPinnedNode } from './commonjs/oracle';

beforeAll(assertPinnedNode);
function integer(low: number, high: number) {
  const value = ESNumber();
  value.knowledge = [{kind:'integer',subject:value},
    {kind:'order',left:ESNumber(low),right:value,strict:false},
    {kind:'order',left:value,right:ESNumber(high),strict:false}];
  return value;
}
// These are ordinary interpreted closures and an explicit synchronous event driver.
// The domain is zero through three deliveries, with arbitrary repetitions and one
// optional synchronous reentrant delivery. It is not an automatic async scheduler.
const setup = `
let settled = false;
let result = "pending";
let settlements = 0;
let cleanups = 0;
let entered = false;
function notify() {
  if (reenter && !entered) {
    entered = true;
    deliver(nested);
  }
}
function finish(value) {
  if (settled) return;
  settled = true;
  result = value;
  settlements = settlements + 1;
  cleanups = cleanups + 1;
  notify();
}
function success() { finish("success"); }
function timeout() { finish("timeout"); }
function cancel() { finish("cancel"); }
function deliver(event) {
  if (event === 0) success();
  else if (event === 1) timeout();
  else cancel();
}
`;
const lateFlag = setup.replace('  settled = true;\n', '')
  .replace('  notify();\n}', '  notify();\n  settled = true;\n}');
const missingCleanup = setup.replace('  cleanups = cleanups + 1;',
  '  if (value !== "cancel") cleanups = cleanups + 1;');
const driver = `
let historyViolation = false;
function step(event) {
  const wasSettled = settled;
  const before = result;
  deliver(event);
  if (wasSettled && result !== before) historyViolation = true;
}
if (count > 0) step(first);
if (count > 1) step(second);
if (count > 2) step(third);
const repeatedSettlement = settlements > 1;
const cleanupViolation = cleanups !== settlements;
const stateViolation = settled !== (settlements === 1);
const pendingViolation = count === 0 ? settled || result !== "pending" : !settled;
const expected = first === 0 ? "success" : first === 1 ? "timeout" : "cancel";
const firstResultViolation = count > 0 && result !== expected;
`;
function inputs(): {[key:string]:Any} {
  return { count:integer(0,3),first:integer(0,2),second:integer(0,2),
    third:integer(0,2),nested:integer(0,2),reenter:ESBoolean() };
}
function run(source: string, given = inputs()) {
  const [completion,context] = evaluateCode(source,
    setVariablesInScope(nodeInitialExecutionContext,given));
  expect(completion).toBe(Undefined);
  expect(context.value.uncaught).toBeUndefined();
  return context.value.scope;
}
test('zero through three arbitrary callback deliveries settle at most once and preserve the first result',()=>{
  const scope=run(setup+driver);
  for(const key of ['repeatedSettlement','cleanupViolation','stateViolation',
    'pendingViolation','firstResultViolation','historyViolation'])
    expect(scope[key]).toMatchObject({value:false});
  expect((scope.settled as TESBoolean).value).toBeUndefined();
});
test('no delivered event preserves a pending operation without cleanup',()=>{
  const scope=run(setup+driver,{...inputs(),count:ESNumber(0)});
  expect(scope.settled).toMatchObject({value:false});
  expect(scope.result).toMatchObject({value:'pending'});
  expect(scope.cleanups).toMatchObject({value:0});
});
test('setting the settled flag after notification must not prove single settlement',()=>{
  const scope=run(lateFlag+driver,{...inputs(),count:ESNumber(1)});
  expect((scope.repeatedSettlement as TESBoolean).value).toBeUndefined();
  expect((scope.firstResultViolation as TESBoolean).value).toBeUndefined();
});
test('omitting cancellation cleanup must not prove cleanup accounting',()=>{
  const scope=run(missingCleanup+driver,{...inputs(),count:ESNumber(1)});
  expect((scope.cleanupViolation as TESBoolean).value).toBeUndefined();
  expect(scope.repeatedSettlement).toMatchObject({value:false});
});
test('reentrant timeout concretely exposes the late-flag mutation inside Prophet',()=>{
  const scope=run(lateFlag+driver,{...inputs(),count:ESNumber(1),first:ESNumber(0),
    nested:ESNumber(1),reenter:ESBoolean(true)});
  expect(scope.repeatedSettlement).toMatchObject({value:true});
  expect(scope.firstResultViolation).toMatchObject({value:true});
  expect(scope.settlements).toMatchObject({value:2});
});
test('pinned Node independently checks all declared concrete histories and mutant witnesses',()=>{
  const oracle = `function check(code,events,again,inner) {
    const count=events.length, first=events[0],second=events[1],third=events[2];
    const reenter=again,nested=inner;
    return eval(code + ${JSON.stringify(driver)} +
      ';[repeatedSettlement,cleanupViolation,stateViolation,pendingViolation,firstResultViolation,historyViolation]');
  }
  let checked=0;
  const histories=[[]];
  for(let n=0;n<3;n++) for(const prefix of histories.filter(h=>h.length===n))
    for(let event=0;event<3;event++) histories.push(prefix.concat(event));
  for(const h of histories) for(const again of [false,true]) for(let inner=0;inner<3;inner++) {
    if(check(${JSON.stringify(setup)},h,again,inner).some(Boolean)) throw Error('valid history failed');
    checked++;
  }
  console.log(JSON.stringify([checked,
    check(${JSON.stringify(lateFlag)},[0],true,1),
    check(${JSON.stringify(missingCleanup)},[2],false,0)]));`;
  const actual=JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,
    ['-e',oracle],{encoding:'utf8'}));
  expect(actual).toEqual([240,[true,false,true,false,true,false],
    [false,true,false,false,false,false]]);
});

test('notification observes settlement and cleanup already completed',()=>{
  const observed=setup.replace('function notify() {', `let notificationViolation=false;
function notify() {
  notificationViolation = !settled || settlements !== 1 || cleanups !== 1;`);
  const scope=run(observed+driver);
  expect(scope.notificationViolation).toMatchObject({value:false});
});
const throwingSetup=setup.replace('function notify() {',
  'function notify() { if (callbackThrows) throw "notification";');
const catchingDriver=driver.replace('  deliver(event);',
  '  try { deliver(event); } catch (error) { caught = caught + 1; }');
test('a throwing notification leaves settled state and cleanup intact for subsequent deliveries',()=>{
  const scope=run('let caught=0;'+throwingSetup+catchingDriver,
    {...inputs(),callbackThrows:ESBoolean()});
  for(const key of ['repeatedSettlement','cleanupViolation','stateViolation',
    'pendingViolation','firstResultViolation','historyViolation'])
    expect(scope[key]).toMatchObject({value:false});
  // The user callback may throw; catching the exception in the explicit driver
  // permits later events. The fixture does not assume notification success.
  expect((scope.caught as TESNumber).value).toBeUndefined();
});
test('moving cleanup after notification loses cleanup if the callback throws',()=>{
  const cleanupAfter=throwingSetup.replace('  cleanups = cleanups + 1;\n', '')
    .replace('  notify();\n}', '  notify();\n  cleanups = cleanups + 1;\n}');
  const scope=run('let caught=0;'+cleanupAfter+catchingDriver,
    {...inputs(),count:ESNumber(1),callbackThrows:ESBoolean()});
  expect((scope.cleanupViolation as TESBoolean).value).toBeUndefined();
});
test('pinned Node witnesses cleanup loss across a throwing notification',()=>{
  const cleanupAfter=throwingSetup.replace('  cleanups = cleanups + 1;\n', '')
    .replace('  notify();\n}', '  notify();\n  cleanups = cleanups + 1;\n}');
  const oracle=`function check(code) {
    const count=3,first=0,second=1,third=2,nested=1,reenter=true,callbackThrows=true;
    return eval('let caught=0;'+code+${JSON.stringify(catchingDriver)}+
      ';[settlements,cleanups,caught,result,cleanupViolation]');
  }
  console.log(JSON.stringify([check(${JSON.stringify(throwingSetup)}),
    check(${JSON.stringify(cleanupAfter)})]));`;
  expect(JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY||process.execPath,
    ['-e',oracle],{encoding:'utf8'}))).toEqual([
      [1,1,1,'success',false],[1,0,1,'success',true]]);
});
