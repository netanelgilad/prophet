import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { removeSync } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCommonJSLoader, nodeInitialExecutionContext } from '../src';
import { ESBoolean } from '../src/boolean/ESBoolean';
import { captureFileSystem } from '../src/cli/filesystem-capture';
import { isExecutionBoundary } from '../src/execution-context/Completion';
import { ExecutionContext } from '../src/execution-context/ExecutionContext';
import { getProperties } from '../src/execution-context/Heap';
import { ESObject, TESObject } from '../src/Object';
import { resolveBoolean } from '../src/symbolic';
import { assertPinnedNode } from './commonjs/oracle';

const fs: typeof import('fs') = require('fs');
let directory: string;
beforeAll(assertPinnedNode);
beforeEach(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), 'prophet-enumerate-'))); });
afterEach(() => removeSync(directory));
function captured(options: Partial<Parameters<typeof captureFileSystem>[0]> = {}) {
  return captureFileSystem({ cwd: directory, fileDescriptorsAvailable: ESBoolean(true), ...options });
}
function run(model: ReturnType<typeof captureFileSystem>, body: string, initial = nodeInitialExecutionContext) {
  return createCommonJSLoader({ '/entry.cjs': 'const fs = require("fs"); ' + body },
    { builtins: { fs: model.module } }).load('/entry.cjs', initial);
}
function native(body: string) {
  return JSON.parse(execFileSync(process.env.PROPHET_NODE_BINARY || process.execPath,
    ['-e', 'const fs = require("fs"); ' + body + '; process.stdout.write(JSON.stringify(module.exports));'],
    { cwd: directory, encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } }));
}

test('bounded acquired names match pinned Node byte ordering, including prototype and numeric names', () => {
  for (const name of ['2', '10', '__proto__', 'z', '\ue000', '😀']) writeFileSync(join(directory, name), '');
  const body = 'module.exports = fs.readdirSync(".").join("|") === "10|2|__proto__|z|\ue000|😀";';
  expect(native(body)).toBe(true);
  const model = captured();
  const [value, after] = run(model, body);
  expect(value).toMatchObject({ value: true });
  let cwd = model.inspectRoot(after) as TESObject;
  for (const name of directory.split('/').filter(Boolean)) cwd = getProperties(cwd, after)[name] as TESObject;
  expect(getProperties(cwd, after)['2']).toBeUndefined();
  expect(getProperties(cwd.hostSlots!['node.fs.entry'] as TESObject, after).names).toBeDefined();
});

test('first complete name observation is memoized without rereading later host changes', () => {
  writeFileSync(join(directory, 'first'), '');
  const model = captured();
  expect(run(model, 'module.exports = fs.readdirSync(".")[0] === "first";')[0]).toMatchObject({ value: true });
  writeFileSync(join(directory, 'later'), '');
  expect(run(model, 'module.exports = fs.readdirSync(".").join("|") === "first";')[0]).toMatchObject({ value: true });
  expect(() => run(model, 'fs.existsSync("later");')).toThrow(/changed|contradict/);
});

test('unlisted case and normalization spellings are probed instead of fabricated absent', () => {
  writeFileSync(join(directory, 'File'), 'case');
  writeFileSync(join(directory, 'é'), 'unicode');
  const names = fs.readdirSync(directory);
  const unicode = names.find(name => name !== 'File')!;
  const otherUnicode = unicode === unicode.normalize('NFC') ? unicode.normalize('NFD') : unicode.normalize('NFC');
  const model = captured();
  run(model, 'fs.readdirSync(".");');
  for (const name of ['file', otherUnicode]) {
    expect(names.includes(name)).toBe(false);
    // The fixture's filesystem decides whether this spelling is an alias; both
    // outcomes have assertions, without skipping case-sensitive hosts.
    const exists = native(`module.exports = fs.existsSync(${JSON.stringify(name)});`);
    const inspect = jest.spyOn(fs, 'lstatSync');
    try {
      if (exists) expect(() => run(model, `fs.existsSync(${JSON.stringify(name)});`)).toThrow(/alias|contradict/);
      else expect(run(model, `module.exports = !fs.existsSync(${JSON.stringify(name)});`)[0]).toMatchObject({ value: true });
      expect(inspect).toHaveBeenCalledWith(join(directory, name));
    } finally { inspect.mockRestore(); }
  }
});

test('conditional name observations reuse one native acquisition after branch joins and preserve child identity', () => {
  writeFileSync(join(directory, 'file'), 'content');
  const selected = ESBoolean();
  const initial = ExecutionContext({ ...nodeInitialExecutionContext.value,
    global: ESObject({ ...nodeInitialExecutionContext.value.global.properties, selected }) });
  const model = captured(), open = jest.spyOn(fs as any, 'opendirSync');
  try {
    const [value, after] = run(model, `if (selected) fs.readdirSync(".");
      module.exports = fs.readdirSync(${JSON.stringify(directory)})[0] === "file" &&
        fs.readFileSync("file", "utf8") === "content" && fs.readdirSync("./")[0] === "file";`, initial);
    expect(resolveBoolean(value as ReturnType<typeof ESBoolean>, after.value.knowledge)).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  } finally { open.mockRestore(); }
});

test('names can include symlinks, nonregular entries and binary files without acquiring their metadata or contents', () => {
  writeFileSync(join(directory, 'binary'), Buffer.from([0xff]));
  symlinkSync('binary', join(directory, 'link'));
  execFileSync('mkfifo', [join(directory, 'pipe')]);
  const body = 'module.exports = fs.readdirSync(".").join("|") === "binary|link|pipe";';
  expect(native(body)).toBe(true);
  expect(run(captured(), body)[0]).toMatchObject({ value: true });
});

test('observed absence/positive facts conflicting with a first enumeration remain diagnostic failures', () => {
  const model = captured();
  run(model, 'fs.existsSync("later");');
  writeFileSync(join(directory, 'later'), '');
  expect(() => run(model, 'fs.readdirSync(".");')).toThrow(/changed|contradict/);
  const second = captured();
  run(second, 'fs.statSync("later");');
  unlinkSync(join(directory, 'later'));
  expect(() => run(second, 'fs.readdirSync(".");')).toThrow(/changed|contradict/);
});

test('a listed child disappearing before first metadata observation is not silently absent', () => {
  writeFileSync(join(directory, 'file'), '');
  const model = captured();
  run(model, 'fs.readdirSync(".");');
  unlinkSync(join(directory, 'file'));
  expect(() => run(model, 'fs.existsSync("file");')).toThrow(/changed|contradict/);
});

test('invalid UTF8 filenames and enumeration budgets retain explicit unsupported outcomes without truncation', () => {
  // Darwin rejects such filenames at creation. Exercise the raw-byte adapter
  // boundary directly without pretending replacement text is the original name.
  const close = jest.fn();
  const stream = jest.spyOn(fs as any, 'opendirSync').mockImplementationOnce(() => ({
    readSync: () => ({ name: Buffer.from([0xff]) }), closeSync: close
  }));
  try { expect(isExecutionBoundary(run(captured(), 'fs.readdirSync(".");')[0])).toBe(true); }
  finally { stream.mockRestore(); }
  expect(close).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 12; index++) writeFileSync(join(directory, String(index)), '');
  expect(isExecutionBoundary(run(captured({ maxEntries: directory.split('/').filter(Boolean).length + 3 }), 'fs.readdirSync(".");')[0])).toBe(true);
});

test('pinned Node descriptor exhaustion precedes directory resolution while NUL validation comes first', () => {
  writeFileSync(join(directory, 'file'), '');
  const source = `const fs = require("fs"), descriptors = []; let exhausted;
    for (let count = 0; count < 64; count++) {
      try { descriptors.push(fs.openSync("file", "r")); }
      catch (error) { exhausted = error.code; break; }
    }
    const result = {};
    for (const path of [".", "file", "missing", "", "bad\\0path"]) {
      try { fs.readdirSync(path); result[path] = "success"; }
      catch (error) { result[path] = error.code; }
    }
    for (const fd of descriptors) fs.closeSync(fd);
    fs.writeSync(1, JSON.stringify({ exhausted, result }));`;
  const observed = JSON.parse(execFileSync('sh', ['-c', 'ulimit -n 64 || exit $?; exec "$@"', 'prophet-directory-capacity',
    process.env.PROPHET_NODE_BINARY || process.execPath, '-e', source],
    { cwd: directory, encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } }));
  expect(observed.exhausted).toBe('EMFILE');
  const model = captured({ fileDescriptorsAvailable: ESBoolean(false) });
  for (const path of ['.', 'file', 'missing', '', 'bad\0path']) {
    const expected = path.includes('\0') ? 'ERR_INVALID_ARG_VALUE' : path === '' && process.platform === 'linux' ? 'ENOENT' : 'EMFILE';
    expect(observed.result[path]).toBe(expected);
    expect(run(model, `let code; try { fs.readdirSync(${JSON.stringify(path)}); } catch (error) { code = error.code; }
      module.exports = code === ${JSON.stringify(expected)};`)[0]).toMatchObject({ value: true });
  }
});

test('listing final read permission differs from search permission, and errors agree with pinned Node', () => {
  mkdirSync(join(directory, 'read-only'));
  writeFileSync(join(directory, 'read-only', 'file'), '');
  mkdirSync(join(directory, 'no-read'));
  chmodSync(join(directory, 'read-only'), 0o400);
  chmodSync(join(directory, 'no-read'), 0o100);
  try {
    const body = `let read, search, missing; const names = fs.readdirSync("read-only");
      try { fs.readdirSync("no-read"); } catch (error) { read = error.code + ":" + error.syscall; }
      try { fs.statSync("read-only/file"); } catch (error) { search = error.code; }
      try { fs.readdirSync("missing"); } catch (error) { missing = error.code + ":" + error.syscall + ":" + error.path; }
      module.exports = names[0] === "file" && read === "EACCES:scandir" && search === "EACCES" && missing === "ENOENT:scandir:missing";`;
    expect(native(body)).toBe(true);
    expect(run(captured(), body)[0]).toMatchObject({ value: true });
  } finally { chmodSync(join(directory, 'read-only'), 0o700); chmodSync(join(directory, 'no-read'), 0o700); }
});

test('unexpected enumeration errors are memoized diagnostics, not empty results or program errors', () => {
  const model = captured();
  const probe = jest.spyOn(fs as any, 'opendirSync').mockImplementationOnce(() => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); });
  try { expect(() => run(model, 'fs.readdirSync(".");')).toThrow(/EIO/); }
  finally { probe.mockRestore(); }
  expect(() => run(model, 'fs.readdirSync(".");')).toThrow(/EIO/);
});
