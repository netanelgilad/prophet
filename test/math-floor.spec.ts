import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { removeSync } from "fs-extra";
import { runFile } from "../src/cli/runtime";
import { assertPinnedNode } from "./commonjs/oracle";
import { evaluateCode, nodeInitialExecutionContext, hasExecutionBoundary } from "../src";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { ESNumber, Undefined, isThrownValue } from "../src/types";

beforeAll(assertPinnedNode);

test("Math.floor handles concrete numeric and primitive coercion cases", () => {
  for (const source of ["1.9", "-1.1", "-0", "0", "NaN", "Infinity", "-Infinity", "undefined", "null", "true", "false", '"3.9"', '"bad"']) {
    const [completion, context] = evaluateCode(`const answer=Math.floor(${source});`, nodeInitialExecutionContext);
    expect(completion).toBe(Undefined);
    const expected = JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath, ["-e", `const value=Math.floor(${source});process.stdout.write(JSON.stringify([String(value),Object.is(value,-0)]));`], {encoding:"utf8", timeout:10000, env:{...process.env,NODE_OPTIONS:"",NODE_PATH:""}}));
    const actual=(context.value.scope.answer as ReturnType<typeof ESNumber>).value;
    expect([String(actual),Object.is(actual,-0)]).toEqual(expected);
  }
});
test("Math.floor executes coercion exactly once and preserves thrown completions", () => {
  const [completion, context] = evaluateCode(`let calls=0; const answer=Math.floor({valueOf:function(){calls++; return 3.9;}}); let caught=false; try { Math.floor({valueOf:function(){throw 7;}}); } catch (e) {caught=e===7;}`, nodeInitialExecutionContext);
  expect(completion).toBe(Undefined);
  expect(context.value.scope.answer).toMatchObject({value:3});
  expect(context.value.scope.calls).toMatchObject({value:1});
  expect(context.value.scope.caught).toMatchObject({value:true});
});
test("Math.floor does not fabricate a concrete answer for open numbers", () => {
  const [completion] = evaluateCode("const answer=Math.floor(x);", setVariablesInScope(nodeInitialExecutionContext,{x:ESNumber()}));
  expect(hasExecutionBoundary(completion)).toBe(true);
});

test("Math.floor splits finite choices and preserves result correlation", () => {
  const input = ESNumber();
  const [completion, context] = evaluateCode("const n=x<0 ? -1.2 : 2.8; const result=Math.floor(n); const answer=x<0 ? result===-2 : result===2;", setVariablesInScope(nodeInitialExecutionContext,{x:input}));
  expect(completion).toBe(Undefined);
  expect(context.value.scope.answer).toMatchObject({value:true});
});
test("Math.floor rejects construction as a guest TypeError", () => {
  const [completion, context] = evaluateCode("let answer=false; try {new Math.floor(1);} catch(e) {answer=e.name==='TypeError';}",nodeInitialExecutionContext);
  expect(completion).toBe(Undefined);
  expect(context.value.scope.answer).toMatchObject({value:true});
});


test("automatic CLI runtime exposes the same Math.floor intrinsic", () => {
  const directory=mkdtempSync(join(tmpdir(),"prophet-floor-"));
  try {
    writeFileSync(join(directory,"entry.cjs"), "if (Math.floor(-1.2) !== -2) throw 1;");
    const result=runFile({script:"entry.cjs",args:[],runtime:"node@24.21.0",maxSteps:10000,maxEvents:0}, directory);
    expect(result.completion).toBeDefined();
    expect(hasExecutionBoundary(result.completion!)).toBe(false);
    expect(isThrownValue(result.completion!)).toBe(false);
  } finally { removeSync(directory); }
});

test("Math.floor ignores extra arguments after their evaluation and uses NaN without an argument", () => {
  const [completion, context] = evaluateCode("let calls=0; const result=Math.floor(2.9, calls++); const empty=Math.floor();",nodeInitialExecutionContext);
  expect(completion).toBe(Undefined);
  expect(context.value.scope.result).toMatchObject({value:2});
  expect(context.value.scope.calls).toMatchObject({value:1});
  expect((context.value.scope.empty as ReturnType<typeof ESNumber>).value).toBeNaN();
});
test("Math.floor falls back to toString only after object-valued valueOf", () => {
  const [completion, context] = evaluateCode("let order=''; const answer=Math.floor({valueOf:function(){order=order+'v'; return {};},toString:function(){order=order+'s'; return '-2.1';}});",nodeInitialExecutionContext);
  expect(completion).toBe(Undefined);
  expect(context.value.scope.answer).toMatchObject({value:-3});
  expect(context.value.scope.order).toMatchObject({value:'vs'});
});
