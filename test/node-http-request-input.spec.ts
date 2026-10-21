import { createCommonJSLoader, nodeInitialExecutionContext } from "../src";
import { effectPaths } from "../src/effects";
import { createExternalEvents } from "../src/external-events";
import { isExecutionBoundary, isForkedCompletion } from "../src/execution-context/Completion";
import { BranchResult } from "../src/execution-context/branches";
import { isThrownValue } from "../src/types";
import { createJobQueue } from "../src/jobs";
import { createHTTPModel, IncomingRequestInput } from "../src/node/http";
import { ESObject } from "../src/Object";
import { ESString } from "../src/string/String";

function expectNormal(result: BranchResult): BranchResult {
  const value = result[0];
  if (isForkedCompletion(value)) {
    expectNormal(value.consequent);
    expectNormal(value.alternate);
  } else {
    expect(isThrownValue(value)).toBe(false);
    expect(isExecutionBoundary(value)).toBe(false);
  }
  return result;
}

function start(source: string, requestInput: () => IncomingRequestInput) {
  const queue = createJobQueue(), events = createExternalEvents();
  // This embedding explicitly declares successful bind; CLI bind stays symbolic.
  const http = createHTTPModel(undefined, { nextTick: queue, externalEvents: events, requestInput });
  const loaded = expectNormal(createCommonJSLoader({ "/entry.cjs": source }, { builtins: { http: http.module } })
    .load("/entry.cjs", nodeInitialExecutionContext));
  expect(isForkedCompletion(loaded[0])).toBe(false);
  const drained = expectNormal(queue.drain(loaded[1], 100));
  expect(isForkedCompletion(drained[0])).toBe(false);
  const ready = drained[1];
  return { events, ready };
}

test("request factory is lazy until a selected eligible arrival", () => {
  const requestInput = jest.fn(() => ({ method: ESString("GET"), url: ESString("/") }));
  const unbound = start("require('http').createServer();", requestInput);
  expectNormal(unbound.events.explore(unbound.ready, 2));
  expect(requestInput).not.toHaveBeenCalled();
  const bound = start("require('http').createServer().listen(8080);", requestInput);
  expectNormal(bound.events.explore(bound.ready, 0));
  expect(requestInput).not.toHaveBeenCalled();
  expectNormal(bound.events.explore(bound.ready, 1));
  expect(requestInput).toHaveBeenCalled();
  expect(requestInput.mock.calls.every(args => args.length === 0)).toBe(true);
});

test("all eligible servers receive the domain, with fresh inputs and retained shorter histories", () => {
  const requestInput = jest.fn(() => ({ method: ESString("GET"), url: ESString(), headers: { "x-input": "declared" } }));
  const { events, ready } = start(`const http = require('http');
    http.createServer(function(req, res) { res.end(req.headers['x-input']); }).listen(8080);
    http.createServer(function(req, res) { res.end(req.headers['x-input']); }).listen(8081);`, requestInput);
  const [, current] = expectNormal(events.explore(ready, 2));
  const paths = effectPaths(current.value.effects).map(path => path.events.filter(event => event.kind === "call"));
  const histories = paths.map(path => path.filter(event => event.call.operation === "http.server.request"));
  expect(new Set(histories.map(history => history.length))).toEqual(new Set([0, 1, 2]));
  const receivers = new Set();
  for (const history of histories) {
    const urls = history.map(event => {
      receivers.add(event.call.args[0]);
      return (event.call.args[1] as ReturnType<typeof ESObject>).properties.url;
    });
    expect(new Set(urls).size).toBe(urls.length);
  }
  expect(receivers.size).toBe(2);
  for (const path of paths) {
    const ends = path.filter(event => event.call.operation === "http.response.end");
    for (const end of ends) expect(end.call.args[0]).toMatchObject({ type: "string", value: "declared" });
  }
  expect(requestInput.mock.calls.every(args => args.length === 0)).toBe(true);
});

test.each([null, false, {}])("invalid request input factory rejects at model construction: %j", requestInput => {
  expect(() => createHTTPModel(undefined, { requestInput: requestInput as any })).toThrow(/request.*function/i);
});
