import { createCommonJSLoader, createFileSystemModel, fileSystemDirectory, fileSystemFile, nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { ExecutionContext } from '../src/execution-context/ExecutionContext';
import { isExecutionBoundary, isForkedCompletion } from '../src/execution-context/Completion';
import { getProperties } from '../src/execution-context/Heap';
import { BranchResult } from '../src/execution-context/branches';
import { ESObject } from '../src/Object';
import { resolveBoolean, selectValue } from '../src/symbolic';
import { ESString } from '../src/string/String';
import { Any, ESNull, Undefined } from '../src/types';

function run(model: ReturnType<typeof createFileSystemModel>, body: string, inputs: { [name: string]: Any } = {}) {
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, ...inputs }) });
  return createCommonJSLoader({ '/entry.cjs': 'const fs = require("fs"); ' + body },
    { builtins: { fs: model.module } }).load('/entry.cjs', initial);
}
function leaves(result: BranchResult): BranchResult[] {
  return isForkedCompletion(result[0]) ? leaves(result[0].consequent).concat(leaves(result[0].alternate)) : [result];
}

test('closed directories enumerate byte-sorted present names with fresh arrays and no metadata keys', () => {
  const root = fileSystemDirectory({ ['__proto__']: fileSystemFile(''), '2': fileSystemFile(''), '10': fileSystemFile(''),
    absent: ESNull, '\ue000': fileSystemFile(''), '😀': fileSystemDirectory({}) });
  const model = createFileSystemModel({ root });
  expect(run(model, `const first = fs.readdirSync("/"); first[0] = "changed";
    const second = fs.readdirSync(".", null); module.exports = first !== second &&
      second.join("|") === "10|2|__proto__|\ue000|😀" && fs.readdirSync("😀").length === 0;`)[0]).toMatchObject({ value: true });
});

test('symbolic names, directory paths and resource/access errors retain their original conditions', () => {
  const present = ESBoolean(), readable = ESBoolean(), available = ESBoolean();
  const root = fileSystemDirectory({ directory: fileSystemDirectory({ optional: selectValue(present, fileSystemFile(''), ESNull) }, { readable }),
    empty: fileSystemDirectory({}) });
  const model = createFileSystemModel({ root, fileDescriptorsAvailable: available });
  const [value, after] = run(model, `let names, code;
    try { names = fs.readdirSync("directory"); } catch (error) { code = error.code; }
    module.exports = !available ? code === "EMFILE" : !readable ? code === "EACCES" :
      present ? names.length === 1 && names[0] === "optional" : names.length === 0;`, { present, readable, available });
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
  const selected = ESBoolean();
  const [choice, context] = run(createFileSystemModel({ root }), `const names = fs.readdirSync(selected ? "empty" : "/empty");
    module.exports = names.length === 0;`, { selected });
  expect(resolveBoolean(choice as ReturnType<typeof ESBoolean>, context.value.knowledge)).toBe(true);
});

test('listing needs read permission on the final directory but no final search permission', () => {
  const root = fileSystemDirectory({ directory: fileSystemDirectory({ file: fileSystemFile('') }, { searchable: ESBoolean(false) }) });
  expect(run(createFileSystemModel({ root }), `let code; const names = fs.readdirSync("directory");
    try { fs.statSync("directory/file"); } catch (error) { code = error.code; }
    module.exports = names[0] === "file" && code === "EACCES";`)[0]).toMatchObject({ value: true });
});

test('path failures retain scandir diagnostics and do not simplify missing prefixes', () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({ file: fileSystemFile('') }) });
  for (const [path, code] of [['missing', 'ENOENT'], ['missing/..', 'ENOENT'], ['file', 'ENOTDIR'], ['file/..', 'ENOTDIR'], ['', 'ENOENT']]) {
    expect(run(model, `let valid = false; try { fs.readdirSync(${JSON.stringify(path)}); } catch (error) {
      valid = error.code === ${JSON.stringify(code)} && error.syscall === "scandir" && error.path === ${JSON.stringify(path)};
    } module.exports = valid;`)[0]).toMatchObject({ value: true });
  }
});

test('open enumeration is an explicit branch-local boundary, never a partial or empty listing', () => {
  const selected = ESBoolean();
  const model = createFileSystemModel({ root: fileSystemDirectory({ closed: fileSystemDirectory({}),
    open: fileSystemDirectory({ known: fileSystemFile('') }, { complete: false }) }) });
  const outcomes = leaves(run(model, 'module.exports = fs.readdirSync(selected ? "open" : "closed").length;', { selected }));
  expect(outcomes.some(([value]) => isExecutionBoundary(value) && value.kind === 'unsupported')).toBe(true);
  expect(outcomes.some(([value]) => (value as any).value === 0)).toBe(true);
});

test('complete name observations remain separate from acquired child metadata and survive joins', () => {
  const root = fileSystemDirectory({}, { complete: false }), selected = ESBoolean();
  let acquired = 0;
  const options = { root, observeDirectoryNames: () => ['file'], observeEntry: (_directory: ReturnType<typeof ESObject>, name: string) => {
    acquired++; return name === 'file' ? fileSystemFile('content') : ESNull;
  } };
  const model = createFileSystemModel(options);
  options.observeDirectoryNames = () => { throw new Error('mutated options'); };
  const [value, after] = run(model, `if (selected) fs.readdirSync(".");
    module.exports = fs.readdirSync("/")[0] === "file" && !fs.existsSync("unlisted");`, { selected });
  expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
  expect(acquired).toBeGreaterThan(0);
  expect(getProperties(root, after).file).toBeUndefined();
  expect(getProperties(root.hostSlots!['node.fs.entry'] as ReturnType<typeof ESObject>, after).names).not.toBe(Undefined);
  expect(run(model, 'module.exports = fs.readdirSync(".")[0] === "file" && fs.readFileSync("file", "utf8") === "content";')[0])
    .toMatchObject({ value: true });
});

test.each(['{ withFileTypes: true }', '{ recursive: true }', '"buffer"', '"utf8"', '{}'])('unsupported enumeration option %s stops explicitly', option => {
  const model = createFileSystemModel({ root: fileSystemDirectory({}) });
  const [value] = run(model, `fs.readdirSync(".", ${option});`);
  expect(isExecutionBoundary(value)).toBe(true);
});

test('conflicting supplied complete names and known children are diagnostic failures', () => {
  for (const root of [fileSystemDirectory({ missing: ESNull }, { complete: false }),
    fileSystemDirectory({ present: fileSystemFile('') }, { complete: false })]) {
    const model = createFileSystemModel({ root, observeDirectoryNames: () => ['missing'] });
    expect(() => run(model, 'fs.readdirSync(".");')).toThrow(/contradict/);
  }
});

test('symbolic paths preserve different lists and an unknown length until the path is known', () => {
  const selected = ESBoolean();
  const model = createFileSystemModel({ root: fileSystemDirectory({
    empty: fileSystemDirectory({}), populated: fileSystemDirectory({ file: fileSystemFile('') }) }) });
  const [value, after] = run(model, `const names = fs.readdirSync(selected ? "empty" : "populated");
    module.exports = { proof: selected ? names.length === 0 : names[0] === "file" && names.length === 1,
      unknown: names.length === 0 };`, { selected });
  const fields = getProperties(value as ReturnType<typeof ESObject>, after);
  expect(resolveBoolean(fields.proof as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
  expect(resolveBoolean(fields.unknown as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBeUndefined();
});

test('unknown path strings stop only their branch, preserving a concrete sibling enumeration', () => {
  const selected = ESBoolean();
  const model = createFileSystemModel({ root: fileSystemDirectory({}) });
  const outcomes = leaves(run(model, 'module.exports = fs.readdirSync(selected ? unknown : ".").length;', { selected, unknown: ESString() }));
  expect(outcomes.some(([value]) => isExecutionBoundary(value))).toBe(true);
  expect(outcomes.some(([value]) => (value as any).value === 0)).toBe(true);
});

test('large concrete declared listings do not recurse per entry or expose the cached list to mutation', () => {
  const children: { [name: string]: Any } = {};
  for (let index = 0; index < 3000; index++) children['file-' + index] = fileSystemFile('');
  const model = createFileSystemModel({ root: fileSystemDirectory(children) });
  expect(run(model, `const names = fs.readdirSync("."); names[0] = "changed";
    module.exports = names.length === 3000 && fs.readdirSync(".")[0] === "file-0";`)[0]).toMatchObject({ value: true });
});

test('complete names cannot hide positive acquisition observations for unlisted spellings', () => {
  const root = fileSystemDirectory({}, { complete: false });
  let observed: string | undefined;
  const model = createFileSystemModel({ root, observeDirectoryNames: () => ['File'], observeEntry: (_directory, name) => {
    observed = name;
    return fileSystemFile('alias or changed namespace');
  } });
  expect(() => run(model, 'fs.readdirSync("."); fs.existsSync("file");')).toThrow(/contradict/);
  expect(observed).toBe('file');
});

test('complete exact names can establish absence without a native acquisition hook', () => {
  const model = createFileSystemModel({ root: fileSystemDirectory({}, { complete: false }), observeDirectoryNames: () => ['File'] });
  expect(run(model, 'fs.readdirSync("."); module.exports = !fs.existsSync("file");')[0]).toMatchObject({ value: true });
});
