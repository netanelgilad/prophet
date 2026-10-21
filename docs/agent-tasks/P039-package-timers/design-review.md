# P039 timer contract review

Approved for implementation within the proposed scope, with the clarifications below. This is independent design review, not implementation or validation approval. Read the unchanged installed node-notifier5.4.0/lib/checkGrowl.js and pinned Node24.21.0 net, stream_base_commons, timers and internal/timers sources. No repository edits or native package execution.

## Accepted domain

- Explicit positional connect(port,host[,function callback]) reuses the options-form endpoint validation, prototype admission and persistent socket creation. Keep original public HostCall arguments and existing alias identities; finite choices retain correlations. Default/omitted host and DNS remain boundaries. An undefined optional callback can follow the existing API contract; other ignored Node trailing forms remain explicitly narrowed.
- Queued same-environment socket, exactly one setTimeout argument. Concrete integer delays0..2147483647 are admitted. Negative numbers, including negative fractions, and nonfinite numeric values produce pinned guest duration errors. Positive fractions, overflow, nonnumeric/unknown values, extra/callback arguments and later phases are typed model-domain boundaries.
- Known-invalid admitted numeric duration first writes public socket.timeout, then throws without clearing or changing the prior timer. Valid duration first writes public timeout, clears prior scheduling, and rearms a positive unrefed timer or disables it for0. Return the same socket.
- Repeated positive calls reset the active configuration;0 cancels. Existing queued destroy cancels the active timer while retaining public timeout value, callback records and separate close-pending state. No timeout provider, time advance, deadline, callback invocation or automatic error/destruction is introduced.
- Timeout event registration remains unsupported. The unchanged helper registers only connect/error, so this does not block the accepted real-package prefix.

## Required clarifications

1. Apply declared unsupported-domain guards before model-side timer/public-property changes. Argument expressions and the public HostCall have already occurred and must remain visible. For the expressly supported numeric-error cases, preserve the opposite ordering required by Node: socket.timeout assignment BEFORE duration validation; old timer untouched on error. Do not let a generic integer-range guard erase those admitted error-side effects. -0 should disable timing; retain its raw public property value unless pinned Node says otherwise.

2. Keep public timeout separate from active scheduling state. Assigning socket.timeout directly does not reschedule a native timer. Either support those ordinary writes with this separation or deliberately guard them; never derive the active timer solely from the public property. Validate receiver identity/queued phase and protect method/internal metadata consistently with P038. Prototype or property-access changes that could alter timeout assignment must stop explicitly; checking the options prototype only at earlier connect creation is not evidence that later property behavior is unchanged.

3. A fresh abstract arm/generation identity may represent a rearming occurrence, but must not be presented as native Timeout object identity. Node may reuse a cleared Timeout on rearm. The timer object is not returned by socket.setTimeout; a persistent O(1) configuration with explicit arm identity is sufficient. Repeated calls must not accumulate multiple simultaneously active timers. Do not invent native timestamps, remaining duration or an absolute expiration.

4. The already queued literal-IPv4 internalConnect does not refresh a timer configured after public connect returned. Do not reset it on submission. Future afterConnect and stream activity refresh through _unrefTimer, and remain later lifecycle gaps. Destroy must cancel even if called after setTimeout but before initiation; subsequent initiation observes existing P038 cancellation.

5. Unrefed means the timer alone does not keep Node alive. It still can fire while the socket/other resources keep the event loop alive. Startup nextTick draining precedes timer delivery even if wall time has elapsed; this justifies the finite startup prefix, not a claim that the100ms timer never becomes due. HTTP --max-events remains its existing declared arrival domain and does not cover timer interleavings.

6. setTimeout configures an idle timeout notification; it is not an automatic socket cancellation or connection deadline. checkGrowl has no timeout listener. Its retained connect/error callbacks call socket.end and remain unexecuted/unsupported future behavior. A startup prefix must not be labeled a completed Growl availability check.

## Acceptance evidence required

Pinned native controls must cover100ms setup/return identity, repeated reset,0 and-0, configured timer canceled by pre-tick destroy, unref state, and negative/nonfinite duration errors with public timeout changed and the old arm retained. Intercept transport and cancel before nextTick; no actual network is required. Positive fractions/overflow/callback forms are valid Node behaviors intentionally excluded, so their tests assert typed boundaries rather than fabricated argument errors.

Model tests should cover two independent sockets; finite delay/endpoint alternatives; healthy siblings beside duration/phase boundaries; old timer retained after a caught numeric error; no reset on submit; no timeout/connect/error/close delivery during startup; and protected state/prototype paths. Verify source/origin/socket/timer graph identities without introducing test-only fields.

The actual package fixture must load the unchanged checkGrowl file with explicit IPv4 configuration, preserve its byte identity/version evidence, reach both admitted-pending and stopped submission outcomes after setTimeout100/listener registration, and show that the helper callback and socket.end have not executed. Default localhost remains an honest DNS frontier. Full completion obligations remain separately recorded in completion-review.md.
