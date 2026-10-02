# Node Buffer compatibility and proof boundary

The reference is **Node v24.21.0**, commit
`955266bfdd854cd280dffd47548673914484e4c0`. The model follows the supported slice of
[`lib/buffer.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/buffer.js)
and the default read path in
[`lib/fs.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/lib/fs.js).
The [local compatibility specs](../test/node-buffer.spec.ts) compare interpreted
fixtures with independent pinned Node children. This is host coverage, separate
from Test262 and from complete upstream Node tests.

## Values, bytes and shared state

`createBufferValue(bytes)` is an embedding helper, not an interpreted Buffer
constructor. It requires an array of concrete unsigned bytes, copies those
bytes and creates a fresh VM object identity. It can supply arbitrary byte
sequences, including malformed UTF-8. The [filesystem model](node-filesystem.md)
uses this same value for successful `readFileSync` calls with omitted, undefined
or null options. Each read returns a separate object, including empty reads;
the declared filesystem still accepts UTF-8 text contents only.

The JavaScript type remains `object`. A private brand identifies the supported
Buffer value and records its fixed length; indexed bytes live in the persistent
VM heap. Shared property hooks handle Buffer's special indexed operations before
ordinary object lookup. There is no separate filesystem-specific byte type or
new knowledge variant.

Supported observations and changes are:

- `length` and `byteLength`, counting bytes rather than UTF-16 characters.
- Reads through concrete numeric keys: valid indices return unsigned numbers;
  canonical numeric keys outside the buffer return undefined without consulting
  prototypes. This includes `"-0"`, negative numbers, fractions, NaN and infinity.
  Noncanonical strings such as `"01"` are ordinary names and remain guarded.
- Indexed writes of concrete numbers or symbolic choices with concrete numeric
  leaves. Conversion truncates and wraps modulo 256; NaN and infinities become
  zero. The assignment expression retains the assigned number, not its converted
  byte. Out-of-bounds writes do not grow the buffer or create properties.
- A shared inherited `toString` method with name `"toString"` and length `3`.
  Omitted/undefined encoding and case-insensitive `utf8`/`utf-8` decode the current
  bytes. Start and end must be omitted or undefined. Empty buffers return `""`
  before examining encoding. Extra argument expressions still execute normally.

Aliases observe the same writes. Earlier execution contexts retain their earlier
bytes, and changing a read result changes neither another read nor the file.
The decoder reads the current heap, including symbolic byte choices, rather than
an allocation-time string. Shared branch knowledge preserves correlations across
bytes, lengths, filesystem choices and decoded text; specs assert both valid
relations and observations that must remain unknown.

The conversion method may be borrowed between modeled Buffers. An instance can
shadow its own `toString` through ordinary assignment; a previously captured
method still decodes that instance's bytes. Host traces can record conversion
calls and returns, but decoding performs no external I/O.

## Explicit gaps and assumptions

This partial value is not a complete Buffer, Uint8Array or ArrayBuffer model.
There is no interpreted Buffer global or `buffer` module, public constructor,
`from`, allocator, pool, slice/subarray, shared backing store or other Buffer API.
Backing-store fields, byte offsets, constructor/prototype access, descriptors,
enumeration and spread remain guarded. Read support for length does not establish
its inherited accessor or assignment behavior: length writes stop analysis.
Other method metadata, method construction and public prototype reflection are
also unsupported. Internal links now preserve Buffer.prototype -> Uint8Array.prototype
-> TypedArray.prototype -> Object.prototype for shared instanceof reasoning;
knowing these links does not expose those prototypes' unmodeled APIs. Reflection/presence operations are not supplied by the indexed
read/write hooks.

Numeric writes support neither open symbolic numbers nor conversions from
strings, Booleans, objects, BigInts or Symbols. Node converts a write's value even
for an invalid index; unsupported conversions therefore stop instead of silently
ignoring their effects. Symbolic lengths and open/computed symbolic indices remain
gaps. General named properties, typed-array detachment/resizing, descriptors,
deletion and concurrent/shared memory need their own semantics.

Nonempty conversions with other encodings or encoding coercions stop analysis.
So do non-undefined ranges, including ranges whose concrete Node result could be
empty. Borrowing from unmodeled receivers is an analysis gap, not a claim that
Node always throws: some Uint8Array receivers work in Node. Captured internal
UTF-8 decoding does not consult an instance's mutable `utf8Slice` property.
Broader conversion validation, exceptions, resource limits and diagnostics remain
unfinished.

Successful reads assume required resource operations succeed and Node's internal
allocation behavior is unchanged. Default reads use mutable Buffer allocators:
nonempty files allocate their size, empty files allocate a read buffer then
concatenate, and directories can allocate before EISDIR. Those APIs are currently
inaccessible to interpreted code. Exposing them must preserve replacements,
ordering, throws, pool/backing-store effects and failures rather than bypass them.
No general memory-availability or large-allocation claim follows from this model.

These residuals are tracked by BUFFER-001/BUFFER-002 and FS-001/FS-002 in the
[implementation backlog](implementation-gaps.md).

## Progress in the unchanged server

The [pico-static-server specs](../test/pico-static-server-analysis.spec.ts) now
execute successful default reads in the original GET/HEAD handler for both a
regular file and a directory's existing index file. The actual local `data`
binding contains the byte value, with its length, indexed bytes and decoded text
checked by a read-only observer. The shared JavaScript `data instanceof Error`
operator now returns false by following these prototype links. The original
success branch computes MIME through path.parse, commits status 200 and serves
the Buffer through write/end and explicit finish delivery. The application still
reverses its writeHead arguments, discarding the intended MIME/length fields.
The [HTTP body model](node-http.md#writing-a-response-body) queues Buffer
references and consumes current bytes at synchronous end under a declared
no-intervening-flush schedule; other transport timings remain open. The missing-directory 404 versus missing-index ENOENT proof
and its independent native witnesses remain intact.

## Complete upstream cases reviewed

The following complete files were reviewed at the same pinned revision. None is
activated or counted passing, and no easier fragment is substituted for a file:

- [`test-buffer-tostring.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-tostring.js)
  needs Buffer.from, additional encodings, isEncoding, array iteration and the
  common/assert harness, including coded encoding errors.
- [`test-buffer-tostring-range.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-tostring-range.js)
  adds range coercions, object conversions, ASCII/hex/base64/base64url, allocation
  and the complete assertion harness.
- [`test-buffer-tostring-rangeerror.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-tostring-rangeerror.js)
  requires large allocators, SlowBuffer, constants, memory-dependent skips and
  allocation/string-size errors.
- [`test-buffer-inheritance.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-inheritance.js)
  builds a custom prototype chain using Uint8Array and Buffer, then exercises
  prototype reflection, fill, loops and the harness.
- [`test-buffer-read.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-read.js)
  covers numeric endian/float read methods and their bounds errors; it is not
  an indexed-property-read test.
- [`test-buffer-alloc.js`](https://github.com/nodejs/node/blob/955266bfdd854cd280dffd47548673914484e4c0/test/parallel/test-buffer-alloc.js)
  covers the broader allocation/conversion/mutation API, encodings, typed arrays,
  views, the vm module and common/assert support.
