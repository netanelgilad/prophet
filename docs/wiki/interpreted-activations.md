# Dynamic activations without fabricated callers

P036 tracks createFunction entries with frozen `{target, sourceFile, parent}`
records and snapshots `{sourceFile, activation}` on HostCall. See
[boundary](../interpreted-activations.md) and [task](../agent-tasks/P036-effect-activation/task.md).

Review lessons:

- Restore **both leaf and joined context** after a callee. mapCompletions can
  transform normal/throw leaves but merge against their original callee-active
  base. mergeContexts must reconcile the transformed activation identities.
- Enter before receiver boxing/default parameters and capture failures there.
  Those operations can stop before evaluate has saved an inner AST checkpoint.
- Use current invocation ancestry, never closure creation or callback registration
  ancestry. A deferred callback retains its lexical file without reviving its
  completed module wrapper.
- Summary infer executes scratch implementations. The proof-only interception
  hook must suppress application frames, including on failed inference.
- Direct effect source and activation lexical file can differ during eval. An
  ancestor filename is not a substitute for an unknown generated source.
- Linked frame creation is O(1); existing interpreter/graph recursion still has
  no complete native-stack bound. Small stress probes establish only their depth.

Native metadata cannot be validated as a V8 stack. Test actual function identity,
branches and graph aliases and run existing language/Node regressions. Evidence
is provisional until the task's independent review and publication record lands.
