import { evaluateCode, nodeInitialExecutionContext } from "../src";
import { isExecutionBoundary } from "../src/execution-context/Completion";
import { setVariablesInScope } from "../src/execution-context/ExecutionContext";
import { createEventEmitterModel } from "../src/node/events";
import { ESObject } from "../src/Object";

function run(source: string, restricted: boolean, restrictedEvents: string[] = []) {
  const events = createEventEmitterModel();
  const socket = ESObject();
  const policy = { allowedRegistrations: ["connectionAttempt", "connect"], restrictedEvents };
  const initialized = events.attach(socket, nodeInitialExecutionContext, restricted ? policy : {});
  return evaluateCode(source, setVariablesInScope(initialized, { socket, EventEmitter: events.module }));
}

test.each(["data", "custom", "newListener", "removeListener"])(
  "host registration allowlist retains a typed frontier for %s even through borrowed methods", name => {
    const [result, context] = run(`
      var after = false;
      EventEmitter.prototype.on.call(socket, "${name}", function() {});
      after = true;
    `, true);
    expect(result).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
    expect(context.value.scope.after).toMatchObject({ type: "boolean", value: false });
  });

test("allowed host events keep ordinary once and receiver behavior", () => {
  const [result, context] = run(`
    var count = 0;
    var same = false;
    socket.once("connectionAttempt", function() { count++; same = this === socket; });
    socket.emit("connectionAttempt");
    socket.emit("connectionAttempt");
    var valid = count === 1 && same;
  `, true);
  expect(isExecutionBoundary(result)).toBe(false);
  expect(context.value.scope.valid).toMatchObject({ type: "boolean", value: true });
});

test("emitters without a registration policy still accept arbitrary ordinary events", () => {
  const [result, context] = run(`
    var called = false;
    socket.on("custom", function() { called = true; });
    socket.emit("custom");
  `, false);
  expect(isExecutionBoundary(result)).toBe(false);
  expect(context.value.scope.called).toMatchObject({ type: "boolean", value: true });
});


test.each(["emit", "listenerCount"])("host public %s cannot observe missing internal listeners", method => {
  for (const event of ["end", "connect"]) {
    const [result] = run(`socket.${method}("${event}");`, true, ["connect"]);
    expect(result).toMatchObject({ type: "ExecutionBoundary", kind: "unsupported" });
  }
});
