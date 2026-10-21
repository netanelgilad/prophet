import { execFileSync } from 'child_process';
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary, isThrownValue, isForkedCompletion } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { createFileSystemModel, fileSystemDirectory, fileSystemFile } from '../src/node/filesystem';
import { createHTTPModel } from '../src/node/http';
import { ESString } from '../src/string/String';
import { ESObject } from '../src/Object';
import { Array as ESArray } from '../src/array/Array';
import { ESNumber } from '../src/types';
import { matchSymbol, replaceSymbol } from '../src/Object/wellKnownSymbols';
import { createRegExpLiteral } from '../src/regexp/RegExp';
import { setVariablesInScope } from '../src/execution-context/ExecutionContext';

import { assertPinnedNode } from './commonjs/oracle';
beforeAll(assertPinnedNode);
const node = process.env.PROPHET_NODE_BINARY || process.execPath;
function compare(source: string) {
  const native = execFileSync(node, ['-e', source + ';process.stdout.write(JSON.stringify(answer));'], {encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
  const [completion, context] = evaluateCode(source, setVariablesInScope(nodeInitialExecutionContext, {}));
  expect(hasExecutionBoundary(completion)).toBe(false);
  expect(isThrownValue(completion)).toBe(false);
  expect((context.value.scope.answer as any).value).toEqual(JSON.parse(native));
}
test('array binding stops permanently once iterator exhausts', () => compare(`
 const source = [];
 let [a = source.push(42, 43), b] = source;
 const answer = b === undefined;
`));
test('sloppy string receiver retains own length', () => compare(`
 function f() { return this.length; }
 const answer = f.call('abc');
`));
test('for-in lexical head has TDZ during RHS', () => compare(`
 let k = {a:1}; let answer = false;
 try { for (let k in k) {} } catch(e) { answer = e instanceof ReferenceError; }
`));
test('for-in sees added Object.prototype fields', () => compare(`
 Object.prototype.extra = 42;
 let answer = ''; for (const k in {}) answer = answer + k;
`));

test('replace converts noncallable replacement despite no match', () => compare(`
 let answer = 0;
 'abc'.replace(/z/, {toString(){answer = answer + 1; return 'x';}});
`));
test('replace resets global lastIndex despite no match', () => compare(`
 const pattern = /z/g; pattern.lastIndex = 2;
 'abc'.replace(pattern, 'x'); const answer = pattern.lastIndex;
`));

test('symbolic stream permission retains both outcomes', () => {
 const allowed = ESBoolean();
 const fs = createFileSystemModel({root:fileSystemDirectory({file:fileSystemFile('abc',{readable:allowed})})});
 const [,after] = evaluateCode(`const stream = fs.createReadStream('/file'); let answer = false;
 stream.on('data', function(){answer = true;}); stream.on('error', function(){});`,
 setVariablesInScope(nodeInitialExecutionContext,{fs:fs.module,allowed}));
 const [completion, delivered] = fs.deliverReadStream(fs.createdReadStreams[0],after);
 expect(hasExecutionBoundary(completion)).toBe(false);
 const [,checked] = evaluateCode('const proof = answer === allowed;', delivered);
 expect(checked.value.scope.proof).toMatchObject({value:true});
});
test('stream callback sees current bytesRead and closed', () => {
 const fs = createFileSystemModel({root:fileSystemDirectory({file:fileSystemFile('abc')})});
 const [,after] = evaluateCode(`const stream = fs.createReadStream('/file'); let answer = '';
 stream.on('data', function(){answer = answer + stream.bytesRead;});
 stream.on('close', function(){answer = answer + ':' + stream.closed;});`,
 setVariablesInScope(nodeInitialExecutionContext,{fs:fs.module}));
 const [completion,delivered] = fs.deliverReadStream(fs.createdReadStreams[0],after);
 expect(hasExecutionBoundary(completion)).toBe(false);
 expect(isThrownValue(completion)).toBe(false);
 expect(delivered.value.scope.answer).toMatchObject({value:'3:true'});
});
function httpCompare(source: string) {
 const native = execFileSync(node, ['-e', `const res = new (require('http').ServerResponse)({method:'GET'}); ${source};process.stdout.write(JSON.stringify(answer));`], {encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
 const http = createHTTPModel();
 const [, setup] = evaluateCode('const server = http.createServer(function(req,res) { '+source+'; result.answer = answer; }); server.listen(0);',
 setVariablesInScope(nodeInitialExecutionContext,{http:http.module,result:ESObject()}));
 const [,ready] = http.completeListen(setup.value.scope.server, setup);
 const delivered = http.deliverRequest(setup.value.scope.server,{method:ESString('GET'),url:ESString('/')},ready);
 expect(hasExecutionBoundary(delivered.result[0])).toBe(false);
 expect(isThrownValue(delivered.result[0])).toBe(false);
 const [completion, after] = evaluateCode('const answer = result.answer;',delivered.result[1]);
 expect(hasExecutionBoundary(completion)).toBe(false);
 expect((after.value.scope.answer as any).value).toEqual(JSON.parse(native));
}
test('numeric setHeader names are rejected', () => httpCompare(`let answer = ''; try {res.setHeader(42,'x');} catch(e) {answer = e.code;}`));
test('setHeader observes object conversion', () => httpCompare(`let answer = 0; res.setHeader('x', {toString(){answer = answer + 1;return 'x';}});`));
test('writeHead preserves partial raw-header writes before failure', () => httpCompare(`res.setHeader('x','old');try {res.writeHead(200,{'x':'new','bad name':'x'});}catch(e){} const answer = res.getHeader('x');`));

test('boxed string primitive extraction, tags and character data match Node', () => compare(`
 function f() { return this.valueOf() + ':' + this[1] + ':' + Object.prototype.toString.call(this); }
 const answer = f.call('abc');
`));
test('for-in includes inherited primitive prototype additions', () => compare(`
 String.prototype.extra = 1; let answer = ''; for (const k in 'a') answer = answer + k;
`));

test('for-in selected symbolic heads preserve their key', () => {
 const [,after] = evaluateCode(`let answer = ''; for (const key in (flag ? {a:1} : {b:1})) answer = key;
 const proof = flag ? answer === 'a' : answer === 'b';`, setVariablesInScope(nodeInitialExecutionContext,{flag:ESBoolean()}));
 expect(after.value.scope.proof).toMatchObject({value:true});
});
test('array binding rejects embedding iterator overrides instead of reading indices', () => {
 const array = Object.assign(ESArray([ESNumber(42)]), {wellKnownSymbols:new Map([[{name:'Symbol.iterator'}, ESNumber(1)]])});
 const [completion] = evaluateCode('const [answer] = array;',setVariablesInScope(nodeInitialExecutionContext,{array}));
 expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
});
test('includes rejects true Symbol.match before search conversion', () => {
 const input = Object.assign(ESObject(),{wellKnownSymbols:new Map([[matchSymbol,ESBoolean(true)]])});
 const [completion, after] = evaluateCode(`let answer = false; try {'abc'.includes(input);}catch(e){answer = e instanceof TypeError;}`,
 setVariablesInScope(nodeInitialExecutionContext,{input}));
 expect(hasExecutionBoundary(completion)).toBe(false);
 expect(after.value.scope.answer).toMatchObject({value:true});
});
test('includes does not report TypeError for RegExp with false Symbol.match override', () => {
 const input = Object.assign(createRegExpLiteral('a',''),{wellKnownSymbols:new Map([[matchSymbol,ESBoolean(false)]])});
 const [completion] = evaluateCode(`'abc'.includes(input);`,setVariablesInScope(nodeInitialExecutionContext,{input}));
 expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
});
test('custom Symbol.replace stops before receiver conversion', () => {
 const input = Object.assign(ESObject(),{wellKnownSymbols:new Map([[replaceSymbol,ESNumber(1)]])});
 const [completion, after] = evaluateCode(`let seen = 0; String.prototype.replace.call({toString(){seen=1;return 'abc';}},input,'x');`,
 setVariablesInScope(nodeInitialExecutionContext,{input}));
 expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
 expect(after.value.scope.seen).toMatchObject({value:0});
});
test('new native string scans enforce their input budgets', () => {
 for (const expression of ["input.split('')", "parseInt(input)", "input.replace('z', '')"]) {
  const [completion] = evaluateCode(expression,setVariablesInScope(nodeInitialExecutionContext,{input:ESString('1'.repeat(65537))}));
  expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'budget'});
 }
});
test('for-in string snapshot is bounded before materialization', () => {
 const [completion] = evaluateCode('for(const k in input) {}',setVariablesInScope(nodeInitialExecutionContext,{input:ESString('a'.repeat(1025))}));
 expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'budget'});
});
test('array binding nested defaults respect already-exhausted iterators', () => compare(`
 const input = []; let [, a = input.push(1,2,3), b] = input; const answer = b === undefined;
`));

test('symbolic stream paths retain healthy completion beside unsupported delivery', () => {
 const fs = createFileSystemModel({root:fileSystemDirectory({small:fileSystemFile('abc'),big:fileSystemFile('x'.repeat(70000))})});
 const [created, after] = evaluateCode(`const stream = fs.createReadStream(flag ? '/small' : '/big'); let bytes = 0;
 stream.on('data', function(chunk){bytes = chunk.length;});`,
 setVariablesInScope(nodeInitialExecutionContext,{fs:fs.module,flag:ESBoolean()}));
 expect(hasExecutionBoundary(created)).toBe(false);
 const result = fs.deliverReadStream(after.value.scope.stream,after);
 const leaves: any[] = [];
 const visit = (pair: any) => {
  if (isForkedCompletion(pair[0])) {visit(pair[0].consequent);visit(pair[0].alternate);} else leaves.push(pair);
 };
 visit(result);
 expect(leaves.length).toBe(2);
 expect(leaves.filter(pair=>hasExecutionBoundary(pair[0])).length).toBe(1);
 const healthy = leaves.find(pair=>!hasExecutionBoundary(pair[0]));
 expect(isThrownValue(healthy[0])).toBe(false);
 expect(healthy[1].value.scope.bytes).toMatchObject({value:3});
});

test('regexp replace guards object lastIndex conversion after replacement effects', () => {
 const [completion, after] = evaluateCode(`const pattern = /z/; pattern.lastIndex = {valueOf(){throw 'reached';}};
 let seen = 0; 'abc'.replace(pattern,{toString(){seen=1;return 'x';}});`,nodeInitialExecutionContext);
 expect(completion).toMatchObject({type:'ExecutionBoundary',kind:'unsupported'});
 expect(after.value.scope.seen).toMatchObject({value:1});
});
