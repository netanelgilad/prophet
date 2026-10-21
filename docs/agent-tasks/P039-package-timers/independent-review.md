# P039 independent semantic review

Accepted for the declared queued IPv4 startup domain; no remaining concrete correctness finding. This is not a proof of full Node socket/timer semantics or all paths.

## Reviewed candidate

Read the final contract, complete `src/node/net.ts`, its entire P039 production diff, `test/node-net-timeout.spec.ts`, and `test/node-notifier-startup.spec.ts`. Independently authored only `test/node-net-timeout-review.spec.ts`; no production changes or commits. Exact frozen SHA256 values:

- `src/node/net.ts`: `6acf168e4dcdf62f80452ebee27b9c6e6578466d0239c4d8d8d66c3c241bf076`
- `test/node-net-timeout-review.spec.ts`: `a3940f7b2b1e83ef1853be2cf37d360560b384d7b8df173125991ab5f6aae613`
- `test/node-net-timeout.spec.ts`: `1c133a0707d62e73680540d4b05f0cdf731415d074657ad83908c37666466549`
- `test/node-notifier-startup.spec.ts`: `2901f8de4b59e45be68b175793bc12cabaccb6a1567788c746e5ac9d160593be`

## Evidence and review conclusions

- `review-red.log` / `review-red-evidence.json`: 15 genuine behavioral red tests against the existing P038 implementation, compiled imports, expected-normal assertions failed at unsupported positional/timer behavior. These are not missing-module failures.
- `review-initial.log` / `review-initial-evidence.json`: 14 passed, one reviewer assertion-shape mistake (full primitive object equality omitted string intrinsic fields). Corrected to partial primitive shape plus callback identity; no implementation defect claimed.
- `review-final.log` / `review-final-evidence.json`: 16/16 pass, pinned Node24.21.0, external 45-second watchdog, stable source/spec hashes before and after. Native child has an independent 10-second timeout and sanitized Node options/path. No full suite was run by this reviewer.

Independent probes verify original positional call arguments and single public effect; caught invalid negative/fractional-negative/NaN/infinite durations write raw public timeout while retaining the previous active unrefed arm; symbolic valid/error and valid/stopped siblings preserve correlations; reset, negative-zero disable, rearm and queued destroy preserve past snapshots and change only current arm state; post-creation intrinsic mutation stops before setter effects; protected property writes and wrong receivers stop; accepted and stopped submission preserve active arms without refresh; connectionAttempt-phase setters stop before writes/submission.

The independent native fixture constructs unconnected sockets, sets then synchronously cancels timers, and compares complete Node duration-error messages for nine values including the 2^32 grouping boundary, exponent notation and -Number.MAX_VALUE. It additionally verifies native raw public write, old timer identity, active state and unref status. It performs no network connection. Native Timeout identity is not equated with the model's fresh abstract arm identity.

Source review confirms the new WeakMap stores only immutable socket-to-timer-object identities; all arm/configuration changes live in the persistent VM heap. No mutable native active-timer registry, counter, time reading, asynchronous callback delivery, or resource-success assumption was introduced. Cancel branches use the selected current arm; invalid numeric errors occur after public write and before cancellation; unsupported domains stop before public writes. Positional normalization is internal and does not fabricate a second public HostCall. Admission guards cover altered intrinsic/property domains and non-queued phases. Error formatting work is bounded by a native numeric string. No new arbitrary cap was introduced.

Reviewed integration evidence executes the complete unchanged package helper through the CLI and verifies source/manifest/cache provenance, retained callbacks, source activation, socket identity and independent deferred submission outcomes. Its native tests exercise controlled built-in fixtures with transport/DNS guards and immediate destruction, not package/network execution. The package's default hostname remains an explicit DNS boundary.

## Limits retained

This acceptance does not claim clock/deadline semantics, timeout event delivery, completion/error/close/end handling, post-initiation setter support, full native Timeout reuse, arbitrary prototype/property changes, DNS/default-host support or whole-package behavior. Unrefed timers remain active; a pending arm is not a proof that a callback cannot later fire. Existing host NUL scanning, graph/history size and general VM resource limits are unchanged. Root owns final full-suite/typecheck/audits and exact-candidate CI/publication.
