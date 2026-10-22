# P042 design: fresh read(0) through pending TCP input

Read-only proposal; no repository changes. Pinned Node24.21.0 sources and the
native scout's nine controlled cases are in this directory. Implementation awaits
root approval and independent review.

## Domain and normal completion

After the admitted P040 full-duplex completion has emitted actual connect and
ready callbacks normally, model Node's fresh unpaused `self.read(0)` prefix.
Allow both an untouched writable side and P041's pending first empty end: shutdown
submission clears native WRITABLE, not READABLE. Failed/partial completions keep
their existing earlier frontiers. Throws/typed stops from either callback still
prevent every later read step.

The current socket must remain model-owned, live, connected/not-connecting, with
retained successful readable+writable completion facts and unchanged protected
property/prototype domain. The readable side is constructed, empty, not reading,
ended, paused, errored or destroyed; flowing is null; no user buffer, prior read,
readable/data listener, EOF, resume, custom hook or high-water-mark change exists.
Those restrictions follow the existing API guards. Do not infer arbitrary stream
state empty, expose `_handle`/`_readableState`, or silently accept pause/resume,
read/data registration or generic public read calls.

Revalidate current heap Object.prototype and Function.prototype defaults after
ready returns, immediately before read-state changes. Socket.read dynamically
calls Duplex.prototype.read.call; the guard must catch intrinsic changes made by
either callback. Preserve all earlier effects, including a completed P041 end.
A conservative intrinsic-change boundary is acceptable and explicit. Preserve
getters/descriptor/prototype/private-property guards. No new public readable
getters are required for this prefix; keep their current unsupported domain.

## Persistent facts and exact ordering

Suggested `node.stream.readable` state, created with the socket: constructed=true,
length=0, highWaterMark=65536, reading=false, sync=true, needReadable=false,
ended=false, endEmitted=false, flowing=null, paused=false, emittedReadable=false,
readableListening=false, resumeScheduled=false, readingMore=false. These are
actual fresh POSIX default facts, not a full raw ReadableState layout. The pinned
stream state module establishes 64KiB; custom global defaults are outside the
current module domain. Keep empty buffer content/private APIs guarded.

Suggested `node.net.read` state: handleReading=false, pending=false, changed only
at the reached operation. This represents logical read registration, not a native
pointer, data receipt or guaranteed future callback.

Use an internal traced `net.socket.read` with argument [0] and socket receiver;
public socket.read may remain unavailable. Its guarded fresh transition follows
Readable.read/howMuchToRead: n remains0, no HWM growth/coercion, no buffered/ended
fast path. Set reading=true, sync=true, needReadable=true, then enter Socket._read.
Connecting=false/live handle/not handleReading entails tryReadStart. Set
handleReading=true before the traced `net.socket.readStart` call, with no arguments
and the same receiver. It returns numeric0 and sets pending=true. Clear sync,
retain reading/needReadable=true and length0, and return null from the read step.
Neither EOF nor data is produced; no read buffer is fabricated.

The fresh read emits no readable/data/end/error event, schedules no nextTick,
maybeReadMore or resume work, and neither refreshes nor cancels the P039 timer.
P041 shutdown/writable facts and timer-arm identity remain unchanged. No extra
JS interpreted frame is invented: effects after connect/ready return use the
restored execution context, not a captured listener activation.

Then `net.socket.complete` returns normally with undefined. Let the existing
ExternalEvents normal-delivery machinery clear its active record and drain actual
callback-enqueued shared jobs in their existing order. Do not clear active state
by hand. The consumed provider remains ineligible. A normal callback result still
retains open socket/read, possible shutdown and timer work; it does not certify
program termination or a complete network timeline.

## Why no admission Boolean or OS-success assumption

StreamBase::ReadStartJS directly returns LibuvStreamWrap::ReadStart, which passes
nonnull fixed allocation/read callbacks and the live TCP stream to uv_read_start.
Its immediate errors require missing pointers, closing, already READING, or absent
READABLE. The fresh selected successful readable connection and guarded lifecycle
exclude these cases. uv__read_start sets READING/callbacks, requests POLLIN,
activates the handle, and returns0 without reading bytes or invoking JS.

uv__io_start may resize its watcher table, but uv__read_start does not propagate
that helper's status as a binding error. More strongly, an actual successful fresh
TCP connect already registered this same fd for POLLOUT; no intervening supported
operation changes the fd or shrinks the table. Thus this slice does not need new
watcher capacity. This is a native source invariant, not an inference from manually
injected completion flags in the oracle. Generic fatal native/allocation failures
remain the existing gap. Future poll registration/syscalls/data/EOF/error status
and eventual delivery remain unknown; binding return0 proves only this prefix.

No new environment model, read provider, byte domain, clock, budget or horizon is
introduced. Existing HTTP/TCP completion horizons still count those events only.
Read/shutdown/timeout delivery and their competing schedules remain unmodeled.

## Acceptance matrix

Start red: admitted full completion must return normally, clear active through
the generic scheduler, and retain exact readable/native pending facts. Assert
read/readStart call-return order and entry heaps, callback context restoration,
no new queued job/emission, unchanged timer, with and without P041 end. Waiting,
immediate submission failure, failed/partial completion and callback throw/typed
boundaries stay distinct; conditional record choices preserve correlations.

Cover callback-enqueued shared jobs after complete returns, horizon0/1/2,
independent sockets, mixed HTTP/TCP selection and no duplicate TCP delivery. Test
Object/Function intrinsic mutations inside connect and ready retain pre-read
facts and earlier effects. The unchanged complete checkGrowl module must reach its
actual null,true callback and then a normal completion path with pending read and
shutdown, not a service-availability or all-path verdict.

Keep pinned nine-case native oracle controls distinct: fresh/end-pending cases
prove JS state/order; injected readStart EIO is an excluded-domain reaction, while
pause/data/readable registration cases demonstrate why their earlier ordering
cannot silently enter this slice. No real native I/O or native package execution.
Review entire upstream candidates without extracting fragments or claiming full
stream coverage. Full tests/typecheck, boundary docs and stable-gap audit precede
publication.
