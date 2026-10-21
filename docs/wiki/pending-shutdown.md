# Pending shutdown is not syscall success

Derive branches from the admitted runtime state, rather than adding an unknown
success Boolean to every native-looking operation. P041 initially considered a
three-way shutdown outcome, but pinned POSIX source justified a narrower result:
a fresh, successful, full-duplex TCP socket has the writable/nonclosing/nonshutting
flags required by uv_shutdown. During its synchronous connect callback no native
loop callback can interleave to change them. The first empty end therefore queues
shutdown and returns0; shutdown(2) runs later and can still fail or be canceled.

This conclusion needs the full retained completion facts, intact handle/lifecycle,
empty unended writable state and guarded hooks. A phase label alone is insufficient.
Node's Socket.end wrapper dynamically calls Duplex.end.call, so a mutable guest
Function.prototype.call is also part of the dependency. Guard it before replacing
native control flow with a model; Object.prototype checks alone miss this dispatch.

Public writableEnded reflects ending, which is set before _final/submission.
The internal ended bit is set after finishMaybe returns. A trace/checkpoint taken
inside shutdown must preserve that difference. Empty end does not refresh a timer
or emit finish. Retain the pending final callback and shutdown separately from
finished, closed or OS success.

Controlled immediate status injections establish how Node JavaScript reacts;
they do not prove every status is reachable in this fresh POSIX state. Read the
C++ wrapper and backend as well as the JS API. Explicit ShutdownWrap/default TCP
Error() exclude otherwise visible generic allocation/error-string fallback paths.
Do not reinterpret fatal allocation as an ordinary random catchable failure.

Pinned afterShutdown ignores its status argument. Even future writable finish
would therefore not prove an error-free shutdown syscall. Preserve the environment
fact separately from the guest's observation when that provider is implemented.
The unchanged helper's null,true callback is likewise its report on a selected
connection branch, not a protocol response or a completed-networking proof.

See [P041 source, native and review evidence](../agent-tasks/P041-socket-end/task.md).


An inherited completion model accepted a finite choice of records, but its caller
read fields from the joined choice without selecting an object. Independent review
caught the crash. A second probe caught mutable guard arrays accumulating facts
across sibling continuations. Select the record before property access, and keep
continuation inputs immutable or branch-local; a passing default single-record
scenario does not establish finite-choice correctness. Publication was held until
both demonstrated cases passed with the combined candidate.
