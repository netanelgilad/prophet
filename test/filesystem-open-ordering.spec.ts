import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory,
  hasExecutionBoundary, isForkedCompletion, nodeInitialExecutionContext } from "../src";
import { invoke } from "../src/ASTResolvers";
import { ESBoolean } from "../src/boolean/ESBoolean";
import { ExecutionContext } from "../src/execution-context/ExecutionContext";
import { getProperties } from "../src/execution-context/Heap";
import { ESObject } from "../src/Object";
import { resolveBoolean } from "../src/symbolic";
import { isThrownValue, TESBoolean, WithProperties } from "../src/types";

function run(options: { platform?: "linux" | "darwin"; fileDescriptorsAvailable?: TESBoolean;
  emptyPathBeforeOpenDescriptorCheck?: TESBoolean }, source: string) {
  const model = createFileSystemModel({ root: fileSystemDirectory({}), ...options });
  const ordering = model.state.properties.emptyPathBeforeOpenDescriptorCheck;
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ordering }) });
  const pair = createCommonJSLoader({ "/entry.cjs": 'const fs = require("fs"); ' + source },
    { builtins: { fs: model.module } }).load("/entry.cjs", initial);
  expect(isThrownValue(pair[0]) || isForkedCompletion(pair[0]) || hasExecutionBoundary(pair[0])).toBe(false);
  return { model, initial, value: pair[0], context: pair[1] };
}

for (const profile of [true, false]) {
  for (const available of [true, false]) {
    test(`declared Linux open ordering ${profile} with descriptors ${available}`, () => {
      const expected = profile || available ? "ENOENT" : "EMFILE";
      const { value } = run({ platform: "linux", fileDescriptorsAvailable: ESBoolean(available),
        emptyPathBeforeOpenDescriptorCheck: ESBoolean(profile) }, `
        let first, second;
        try { fs.readFileSync("", "utf8"); } catch (e) { first = e.code; }
        try { fs.readFileSync(""); } catch (e) { second = e.code; }
        module.exports = first === "${expected}" && second === first;
      `);
      expect(value).toMatchObject({ value: true });
    });
  }
}

for (const platform of [undefined, "linux"] as Array<undefined | "linux">) {
  test(`unspecified Linux ordering stays unknown and correlates repeated reads (${platform})`, () => {
    const { value, context, model, initial } = run({ platform, fileDescriptorsAvailable: ESBoolean(false) }, `
      function read() { try { fs.readFileSync(""); } catch (e) { return e.code; } }
      const first = read(), second = read();
      module.exports = { proof: first === second && (ordering ? first === "ENOENT" : first === "EMFILE"),
        uncertain: first === "ENOENT" };
    `);
    const properties = getProperties(value as WithProperties, context);
    expect(resolveBoolean(properties.proof as TESBoolean, context.value.knowledge)).toBe(true);
    expect(resolveBoolean(properties.uncertain as TESBoolean, context.value.knowledge)).toBeUndefined();
    const ordering = getProperties(model.state, context).emptyPathBeforeOpenDescriptorCheck as TESBoolean;
    expect(resolveBoolean(ordering, context.value.knowledge)).toBeUndefined();
    expect(getProperties(model.state, initial).emptyPathBeforeOpenDescriptorCheck).toBe(ordering);
  });
}

test("unknown open ordering with available descriptors always yields ENOENT", () => {
  const { value } = run({ fileDescriptorsAvailable: ESBoolean(true) }, `
    let code; try { fs.readFileSync(""); } catch (e) { code = e.code; }
    module.exports = code === "ENOENT";
  `);
  expect(value).toMatchObject({ value: true });
});

test("Darwin retains descriptor-first default while Linux scandir retains libc precheck", () => {
  const darwin = run({ platform: "darwin", fileDescriptorsAvailable: ESBoolean(false) }, `
    let code; try { fs.readFileSync(""); } catch (e) { code = e.code; }
    module.exports = code === "EMFILE";
  `);
  expect(darwin.value).toMatchObject({ value: true });
  const linux = run({ platform: "linux", fileDescriptorsAvailable: ESBoolean(false),
    emptyPathBeforeOpenDescriptorCheck: ESBoolean(false) }, `
    let code; try { fs.readdirSync(""); } catch (e) { code = e.code; }
    module.exports = code === "ENOENT";
  `);
  expect(linux.value).toMatchObject({ value: true });
});

for (const available of [true, false]) {
  test(`stream delivery shares unknown open ordering with synchronous reads (descriptors ${available})`, () => {
    const { model, context, value } = run({ fileDescriptorsAvailable: ESBoolean(available) }, `
      let syncCode, streamCode, closed = false;
      try { fs.readFileSync(""); } catch (e) { syncCode = e.code; }
      const stream = fs.createReadStream("");
      stream.on("error", function(e) { streamCode = e.code; });
      stream.on("close", function() { closed = true; });
      module.exports = function() { return closed && streamCode === syncCode &&
        (${available} || ordering ? streamCode === "ENOENT" : streamCode === "EMFILE"); };
    `);
    const delivered = model.deliverReadStream(model.createdReadStreams[0], context);
    expect(isThrownValue(delivered[0]) || isForkedCompletion(delivered[0]) || hasExecutionBoundary(delivered[0])).toBe(false);
    const [proof, after] = invoke(value, [], delivered[1]);
    expect(resolveBoolean(proof as TESBoolean, after.value.knowledge)).toBe(true);
  });
}

test("open ordering requires a VM Boolean fact", () => {
  for (const invalid of [true, null, "linux"] as unknown as TESBoolean[]) {
    expect(() => createFileSystemModel({ root: fileSystemDirectory({}),
      emptyPathBeforeOpenDescriptorCheck: invalid } as any)).toThrow(/Boolean/);
  }
});
