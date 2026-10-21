# Bounded Function.prototype.bind

Implemented by Instinct in-sandbox on the P016 head; full suite 146/
4505/46skip and typecheck green. See [specs](../../test/function-bind.spec.ts)
and [task](../agent-tasks/P017-function-bind/task.md).

Model only what is provable for concrete callable receivers: bind captures
thisArg (default undefined) and the partial arguments into a fresh bound
function identity, and bound length is max(target.length - partial count, 0)
admitted only from a current concrete own numeric length. The bound function
is boundary-marked: construction is a typed boundary, name/caller/arguments
reads are unmodeled, metadata writes and descriptors are guarded, and
inherited Function.prototype.call stays modeled. Calling the bound function
forwards through ordinary invocation with the captured receiver and partial +
call arguments, preserving completions exactly like call; non-callable
receivers are guest TypeErrors and symbolic receivers branch before the
check.

Measured unchanged sirv: viaCache.bind captures the completed FILES table and
the factory returns its request handler closure - the CLI exits 0 with empty
stderr and the completion fork's leaves are the returned function value and
the unchanged EMFILE readdir throw. Calling the returned handler next reaches
the pre-existing sloppy primitive receiver boxing rejection; bound name
metadata, bound construction and request-path analysis remain open.
