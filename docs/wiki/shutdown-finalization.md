# Shutdown arrival is not syscall success

Pinned Node24.21.0 afterShutdown ignores its asynchronous status and invokes the
saved final callback without error. The public model can project the unused
native status out; it cannot turn absence of an observed error into successful
shutdown, peer receipt or socket closure. P043 contract/native evidence records
status0 and EIO controls with identical JS behavior.

onFinish consumes finalization and marks prefinished before synchronous prefinish.
Only normal emission return queues finish; a listener throw leaves prefinished
true with no finish job. Queued finish marks finished before emitting finish and
does not repeat needFinish. The readable side can remain open; writable finish
alone does not imply duplex autodestroy. Model the actual shared queue order.

Boundary placement matters: a legacy unsupported dispatch must retain the state
at emission after these writes. Independent P043 probes caught an untyped custom
listener.apply error; the narrow correction classifies that guard at its current
branch checkpoint. Do not convert arbitrary host errors by message matching or
claim full custom-apply semantics. Current source/evidence: P043 task record.
