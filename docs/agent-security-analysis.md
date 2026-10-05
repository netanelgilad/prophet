# Security tooling on top of Prophet

## Layer boundary and current status

This is a **downstream use-case roadmap**, not Prophet's core input/output
contract. The authoritative [symbolic-runtime contract](symbolic-runtime.md)
defines the use-case-agnostic VM and its primary CLI surface:

```text
execute(program, runtime): SymbolicEnvironment -> SymbolicEnvironment
```

Security, bug-finding and performance tools consume that result. Prophet's input
values do not carry a security `sensitivity`, its invocation does not select
security policies, and its result does not classify behavior as malicious,
approved or violating. A security consumer owns those interpretations and can
associate external classifications with input identities without changing the
VM's value representation. This correction supersedes this document's earlier
library-first request/report proposal and its security-specific input fields.

The durable security goal is **pre-execution dependency admission**: examine
packages before their install/import/use code can access the real environment,
then evaluate possible network activity, credential disclosure, protected-file
changes, process execution or other behavior against an external policy.
"Malicious" is not a runtime primitive. A consumer must explain its decision
using the symbolic state, conditions, observable history and execution limits.

Today the VM exposes scoped internal TypeScript APIs, supplied CommonJS graphs,
host models, state, completions and effect traces. The [static-server milestone](real-world-target.md)
has bounded proofs and native witnesses. The public environment/CLI contract,
security scanner, npm admission wrapper, outbound-network model and original
Shai-Hulud benchmark are not implemented. Known legacy semantics gaps limit all
uses of the engine; they must be repaired or exposed as unsupported behavior,
not silently accepted outside a special security mode. REPORT-001 and
SECURITY-001/002 in the [gap register](implementation-gaps.md) retain these gaps.

## How a security consumer uses the runtime

1. Acquire and verify exact package artifacts/dependencies without running them.
2. Construct an initial symbolic environment for a selected runtime and command.
   Values can be concrete or unknown, with shared identities and constraints.
   The same representation supports an explicitly captured concrete environment.
3. Invoke Prophet through its CLI and read the resulting environment from stdout
   or a redirected file. An optional library convenience may exist, but neither
   the consumer nor this roadmap depends on Prophet remaining implemented in JS.
4. Inspect state changes, conditional effects, exceptions and unfinished work.
   Apply security policy in the consumer and retain its decisions separately.
5. If implementing an admission gate, enforce the decision before executing the
   exact reviewed artifacts under the approved environment/capabilities.

The consumer's own configuration may say that the input symbol named `token`
represents a credential, or that a particular file is protected. Prophet sees
ordinary values, references, expressions and resource state. Generic dependency,
origin and control relationships in the execution result can support analysis;
they do not encode what a given organization considers sensitive or acceptable.
Likewise, redaction/classification rules belong to capture and consumer tooling.

A future npm wrapper is useful, but its correctness includes package resolution,
acquisition and lifecycle orchestration. It is not the Prophet VM itself. The
wrapper may invoke the CLI or an optional embedding interface; it must consume
the same execution semantics. A hook run after normal installation has already
executed cannot prevent an install-time compromise.

## Consumer reports and proof limits

The VM supplies execution state/history, source/runtime provenance, conditions,
unknowns and unsupported or unfinished continuations. The security tool derives
its own report, keeping completeness separate from a policy verdict:

| Consumer result | Meaning |
| --- | --- |
| Proven within the declared execution domain | The policy holds for every represented execution, with an adequate semantics/coverage argument. |
| Demonstrated violation | An established feasible execution violates policy; attach source/condition evidence and witness/replay status. |
| Possible violation | A retained overapproximation may violate policy but feasibility is not established. |
| Inconclusive | Unsupported semantics, unresolved work, resource budgets or reasoning limits prevent a decision. |

A feasible violation can be established before later code becomes unsupported.
Conversely, finding no violation in a partial run does not establish safety.
A retained effect path is not automatically feasible. Invalid input and engine
failures also cannot become clean scans or ordinary target-program exceptions.
An external strict admission policy may block violations and inconclusive runs
for different reasons. Accepted risk is recorded as an exception, not a proof.

These are consumer classifications, not fields required in the symbolic
runtime's values or environment. The same raw result remains usable by a debugger
or a performance tool with unrelated questions and policies.

## Network destinations and information flow

A no-outbound policy examines possible **attempts**, including failed attempts.
The runtime must preserve invocation, attempt and delivered-byte distinctions,
conditions, arguments and ordering in its observations. A first-attempt model
can be useful before full transport support, but its unfinished continuation
cannot establish a complete destination inventory.

The consumer may derive exact endpoints, conditional finite alternatives,
symbolic constraints or unknown destinations from those observations. A value
computed from an arbitrary input or remote response may have infinitely many
possibilities; a finite sampled list is not exhaustive. DNS, redirects, proxies,
raw sockets and subprocess traffic must be accounted for or remain explicit
execution gaps.

Destination approval alone does not establish benign behavior. A legitimate
service can receive credentials in an URL/header/body or perform an unauthorized
publish/write action. A consumer can ask about data reaching network/log/file/
process outputs, protected resources or process launches. This needs adequate
value/control relationships from the runtime and suitable analysis rules in the
consumer; current symbolic strings are not a complete information-flow model.
Never infer missing evidence or reinterpret an unknown result as permission.

Bind decisions and caches to exact artifacts/dependency graph, starting state,
command/runtime, external policy and engine/model versions. Changes invalidate
approval. Downloaded/generated code becomes additional execution input with its
own provenance and coverage. Where prevention is promised, install/runtime
containment must enforce approved capabilities; a static result cannot stop
execution that bypasses the gate.

## Authorization gating as a history query

A separate downstream consumer can answer "did every sensitive operation go
through its required check, on the same values?" from the same execution
result. Prior art for the pattern is
[gdp-ts](https://github.com/rauchg/gdp-ts) (Ghosts of Departed Proofs for
TypeScript): name values, mint a proof only in the trusted module that
performed the check, and demand that proof in the sensitive function's
signature. `gdp-ts` enforces this at compile time through types plus lint;
Prophet never sees those phantom types and must not add proof, sensitivity or
policy fields to its values to imitate them.

What the consumer asks of a Prophet graph instead, for unmodified code:

- On every represented path where the sensitive operation occurs, did the
  required check operation occur earlier, with the same argument/receiver
  identities and with path knowledge implying success?
- Are ordering, conditions, argument values and resource state at each event
  preserved, so a check on a different user, project or token cannot satisfy
  the query?

The runtime prerequisites are the same generic ones: ordered conditional
effects with call/return/throw distinction, stable operation and value
identities, heap snapshots at each event, path conditions and value
correlations across calls. The current effect trace and host-effect specs
are the foundation for this, not a verdict API. Stale-check (time-of-check
to time-of-use) questions additionally need invocation-state dependencies
across events, not registration-time values; automatic multi-request
exploration remains the bounded-scheduling work tracked under HOST-002.

Acceptance is a benign fixture with one checking function and one sensitive
function, plus safe, violating and unknown controls interpreted by a separate
consumer spec against the same VM result. One passing fixture is not
closure of authorization analysis.

## Installation, import and later use are different entry points

Analyze them separately or through an explicit sequence with persistent state:

- **Install:** pin npm as well as Node; model the actual command, root/dependency
  graph, lifecycle selection/order, cwd, environment, PATH and command resolution.
  `preinstall`, `install`, `postinstall`, Git `prepare` and rebuild behavior have
  distinct triggers. An exact supported `node file.js` launcher can be the first
  subset; shell commands are not JavaScript and cannot be silently split or
  evaluated as if they were. Unknown commands, downloaded executables, native
  addons and alternate runtimes remain explicit boundaries. See the official
  [npm lifecycle contract](https://docs.npmjs.com/cli/v11/using-npm/scripts/).
- **Load/import:** interpret the actual selected CommonJS or ESM entry and its
  dependency initialization, with scheduled continuations explicitly included
  or excluded. Current CommonJS support does not establish ESM support.
- **Use:** declare export calls and symbolic arguments, CLI invocation, server
  events, timers or other callbacks. A clean import cannot certify arbitrary
  future calls or an agent/IDE that later reads configuration the package wrote.

Acquisition is separate from target-code effects. The adapter may need trusted
registry access to obtain data; that is not permission for package code to use
the network. Acquire/cache/extract without lifecycle execution and verify bytes
before analysis. npm's [`ignore-scripts` option](https://docs.npmjs.com/cli/v11/commands/npm-ci/#ignore-scripts)
is useful but is not, on its own, a sandbox or a complete orchestration model.

## Defensive Shai-Hulud benchmark

Maintain distinct, immutable incident fixtures and clean controls; do not make
an incident name, hash or source pattern an inference rule. Verified public
references as of **2026-10-02** include:

| Reference | Dates and why it matters |
| --- | --- |
| [GitHub campaign summary](https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/) | Published 2025-12-23; describes the 2025 waves, credential theft, propagation and CI-dependent behavior. |
| [Microsoft Shai-Hulud 2.0 analysis](https://www.microsoft.com/en-us/security/blog/2025/12/09/shai-hulud-2-0-guidance-for-detecting-investigating-and-defending-against-the-supply-chain-attack/) | First indicators 2025-11-24; published 2025-12-09. Install hooks, an alternate runtime and credential-dependent behavior require more than module-load analysis. |
| [TanStack maintainer postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem) | Incident/postmortem 2026-05-11, updated 2026-05-15; the optional Git dependency/prepare path makes package-manager semantics part of the target. |
| [Aikido Keyv investigation](https://www.aikido.dev/blog/keyv-and-friends-compromised-in-npm-supply-chain-attack) | Incident/report 2026-08-04, updated 2026-08-05; ESM/Bun, dynamic destinations and later editor/agent triggers expand the required domain. |
| [Aikido recurrence report](https://www.aikido.dev/blog/shai-hulud-npm-resurfaces) | Incident/report 2026-09-07; reports reuse of a May payload in four packages. This confirms a recurrence weeks before this planning session. |

The September report's `feishu-docx-mcp@0.3.2` is a **candidate**, not an acquired,
verified or analyzed fixture. Pin the complete archive and dependency hashes,
manifest, runtime and source provenance before adopting any candidate. A
reported payload hash alone is not proof of a complete artifact. Start with one
original loader reaching its first prohibited effect; report Bun or other
unmodeled continuation explicitly. A first-effect finding can be actionable
without pretending the entire obfuscated worm was analyzed.

No malicious artifact was downloaded or executed for this planning increment.
Known-malicious fixtures must be handled as inert data in a controlled corpus.
Never install or execute them under native Node as an ordinary Jest oracle.
Use benign fixtures/fake credentials for native compatibility checks; any later
adversarial replay requires a separately reviewed isolation harness with no
ambient credentials or external effect authority. The interpreter, parsers and
archive handling also process hostile input: symbolic execution is not itself
a hardened sandbox. Bound resource usage and isolate acquisition/extraction/
analysis; reject archive traversal, unsafe links and decompression exhaustion.

## Delivery sequence and acceptance

1. **Generic runtime CLI/state contract.** Follow [the core roadmap](symbolic-runtime.md):
   symbolic environment in, symbolic environment out, with concrete values as a
   subset and optional concrete initial-state construction. Serialize program
   output, conditional state/effects, completions and execution limits. Use the
   existing unchanged server as a regression target. No sensitivity, policies
   or admission verdicts enter the core representation.
2. **Generic observable-effect coverage plus a consumer.** A benign complete
   dependency fixture conditionally uses a supported Node outbound API. Preserve
   exact/finite/unknown destinations, related input values, a no-attempt path and
   an unsupported subprocess continuation in the VM result. A separate security
   tool/spec interprets that same result to test allowed/forbidden effects and
   externally classified credential flows. Other consumers must be able to use
   the same result without those classifications.
3. **Pinned lifecycle executions.** Represent selected npm install/import/use
   commands and environment state, expanding shared runtime/host semantics only
   as needed. Verify orchestration with harmless whole fixtures against the
   pinned package manager. Shell/ESM/native/async gaps remain visible. Future
   Bash/GNU-tool support belongs to reusable runtime semantics, not security rules.
4. **One original incident artifact and clean control.** Analyze a controlled,
   immutable Shai-Hulud loader to its first relevant effect. Derive a feasible
   policy violation in the consumer from execution evidence, preserve every
   blocker and expand one reusable feature at a time. Whole-worm/destination
   coverage is a later acceptance criterion; no malware-name inference rules.
5. **Admission adapter and regression corpus.** Prevent target execution before
   the decision, bind it to reviewed inputs, test invalidation/bypasses, and keep
   legitimate-download controls. Grow to other incidents and ordinary packages.
   Existing malware feeds and artifact matching remain complementary defenses.

The runtime CLI/state representation is the immediate product priority. The
security objective remains durable alongside debugging, correctness and
performance uses. Filesystem, transport and other existing gaps stay open and
advance when an execution scenario or shared semantic correctness requires them.
