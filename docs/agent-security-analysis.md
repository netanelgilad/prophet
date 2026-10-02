# Agent-facing analysis and supply-chain security

## Product objective and present status

Prophet is for agents analyzing real, unmodified JavaScript applications and
dependencies. An agent should supply code, possible inputs and an environment,
then receive machine-readable answers about outcomes, escaping exceptions,
effects and policy violations, with the conditions and evidence behind them.
Concrete execution remains a subset of the same VM. Full JavaScript/Test262
coverage and advanced symbolic reasoning remain the long-term engine goals.

One durable use case is **pre-execution dependency admission**: examine incoming
packages before their install scripts, module initialization or application use
can access the real environment. Questions include whether they can contact
unapproved destinations, disclose credentials, modify protected files, launch
unexpected programs, or cause an unhandled exception. "Malicious" is not a
primitive the VM can prove; it reports behavior against explicit policies.

**This document is a proposed product contract and roadmap, not an implemented
scanner or a safety guarantee.** Today the library exposes evaluation, supplied
CommonJS graphs, explicit host models, symbolic state, completions and effect
traces. The [static-server milestone](real-world-target.md) has bounded proofs
and native witnesses. There is no supported scan CLI, npm wrapper, serialized
analysis contract, outbound-network model, information-flow policy engine or
successful Shai-Hulud analysis. The current VM also has known legacy semantics
gaps; catching unsupported-operation errors alone cannot make it a sound security
scanner. See REPORT-001 and SECURITY-001/002 in the [gap register](implementation-gaps.md).

## Library, CLI and package-manager adapter

Build one analysis engine, exposed in three layers:

1. **Library:** a versioned `analyze(request) -> report` API plus lower-level
   trusted embedding APIs. Agents running inside other applications can use it
   directly. Scenario data compiles into the existing VM values, facts, source
   graph and host state; it does not introduce a second evaluator.
2. **CLI:** a thin transport for the same contract, with JSON input/output,
   deterministic identifiers, documented exit codes, cancellation and resource
   limits. Progress belongs on stderr or a separate stream; stdout is parseable
   JSON or a declared NDJSON protocol. Large traces can be content-addressed
   artifacts referenced by the report. Interactive prompts and terminal
   formatting are optional consumers, not the primary interface.
3. **npm adapter:** a later admission layer that acquires exact artifacts without
   running package code, constructs install/import/use scenarios, invokes the
   library and applies policy. It does not reinterpret Prophet findings or
   contain another scanner. Other package managers need their own pinned
   orchestration contracts.

Illustrative future invocation; **these commands/API do not exist yet**:

```sh
prophet analyze --request scan.json --output report.json
```

```ts
const report = await analyze(request);
```

An npm wrapper is useful eventually, but its correctness includes resolution,
acquisition and actual lifecycle orchestration. A script run after the normal
installation has already executed cannot prevent an install-time compromise.

## Scenario input

Use validated declarative data as the normal agent interface. Do not require
agents to author executable JavaScript configuration or know internal VM object
layouts. Named symbols and references preserve correlations across arguments,
environment variables, filesystem entries and subsequent host observations.
An absent variable differs from a present unknown string; unknown does not mean
missing. Unknown or omitted environment behavior must be rejected or explicitly
modeled, never silently replaced by the developer machine or a healthy outcome.

This illustrative JSON describes a **future** small import scenario. Manifest
references and profiles must be supplied, resolved, validated and hashed by the
caller; the example does not claim a current parser or real fixture:

```json
{
  "schemaVersion": "prophet.request/v0-proposal",
  "artifacts": "./artifact-manifest.json",
  "runtime": { "node": "24.21.0", "platform": "linux" },
  "symbols": {
    "hasToken": { "type": "boolean" },
    "token": { "type": "string", "sensitivity": "secret" },
    "ci": { "type": "string", "oneOf": ["", "true"] }
  },
  "scenarios": [{
    "id": "dependency-import",
    "trigger": { "kind": "commonjs-load", "specifier": "candidate" },
    "environment": {
      "variables": {
        "closed": true,
        "entries": {
          "CI": { "present": true, "value": { "ref": "ci" } },
          "NPM_TOKEN": { "present": { "ref": "hasToken" }, "value": { "ref": "token" } }
        }
      },
      "filesystem": { "manifest": "./filesystem.json", "closed": true },
      "network": { "model": "attempt-boundary", "afterAttempt": "unmodeled" },
      "schedule": { "kind": "synchronous-only" }
    }
  }],
  "policies": [{ "id": "no-egress", "kind": "forbid-effect", "effect": "network.outbound.attempt" }],
  "limits": { "evaluationSteps": 100000, "retainedBranches": 1000 }
}
```

The artifact manifest pins package bytes, package metadata, the complete supplied
dependency graph, resolution/configuration inputs, and their integrity hashes.
The filesystem manifest explicitly distinguishes a closed tree from unknown
regions and can eventually contain symbolic secret data; today's filesystem
contents are still a narrower concrete-text domain. Credentials in a scan are
symbolic values or inert test values, not production tokens.

Keep three things separate: **assumptions** about the modeled world, **scope**
such as permitted entry points/schedules, and **exploration budgets**. Exhausting
a budget yields incomplete analysis; it never narrows the input domain until a
proof passes. A synchronous-only scenario cannot certify later timers or jobs.
The attempt-only network example can identify a reachable forbidden attempt;
unmodeled continuation after it prevents a complete destination inventory.

Environment presets may cover local development, CI and production, with
symbolic alternatives within each. They need explicit expansion and hashes in
the report. Treating one machine snapshot as every possible environment would
miss credential-, platform-, filesystem-, time- or network-dependent behavior.

## Reports and policy meaning

Serialize stable symbolic expressions/constraints with IDs and references,
separately from mutable internal VM objects. Report source locations and the
dependency/call chain, condition, attempted operation, arguments/data provenance,
ordered prior effects, resulting state/exception and remaining continuations.
Do not export real secrets. The existing traces need source attribution and a
serialization layer before they satisfy this contract.

Keep **coverage** separate from **policy verdicts**:

| Field | Meaning |
| --- | --- |
| `coverage: complete-within-scope` | All relevant executions in the declared domain are soundly accounted for under the stated engine/model contract. This is not all JavaScript or all future uses of the package. |
| `coverage: incomplete` | Unsupported semantics, unfinished continuations, budgets or solver limits prevent complete accounting. Preserve partial findings and exact blockers. |
| `verdict: proven-within-scope` | The property holds for every represented execution, with an adequate coverage/model argument for that property. |
| `verdict: violated` | An established feasible execution violates the policy. Record feasibility evidence and whether a witness/replay exists. |
| `verdict: possible-violation` | An overapproximated path may violate policy but feasibility is not established. It is not yet a counterexample. |
| `verdict: inconclusive` | The property cannot currently be decided. No findings is not evidence of safety. |

A violation can be established even when later code or another path remains
unexplored. Conversely, a retained effect path is not automatically feasible;
the current reasoner can overapproximate. Unsupported operations, invalid
requests and engine failures must have distinct structured reasons and must
never become ordinary program exceptions or clean scans.

An illustrative future report fragment for a benign synthetic fixture:

```json
{
  "schemaVersion": "prophet.report/v0-proposal",
  "coverage": {
    "status": "incomplete",
    "blockers": [{ "kind": "unmodeled-continuation", "after": "effect-1" }]
  },
  "policies": [{ "id": "no-egress", "verdict": "violated", "findings": ["finding-1"] }],
  "findings": [{
    "id": "finding-1",
    "scenario": "dependency-import",
    "location": { "artifact": "candidate", "file": "index.js", "line": 12 },
    "effect": "network.outbound.attempt",
    "effectId": "effect-1",
    "condition": { "op": "symbol", "id": "hasToken" },
    "destination": { "kind": "exact", "protocol": "https:", "host": "collector.example", "port": 443 },
    "feasibility": { "status": "established", "witness": { "hasToken": true } },
    "replay": { "status": "not-run" }
  }]
}
```

The complete report must also carry artifact/graph, scenario, policy, runtime,
engine and model versions/hashes, assumptions, explored entry points, budgets
and unresolved boundaries. Agents can request an effect trace, refine a scenario,
or compare a candidate report with a previous immutable version. Finding a new
effect in a diff is a review signal; unchanged effects are not automatically safe.

An admission decision is a separate policy consumer. A strict gate blocks both
demonstrated violations and inconclusive scans, with different reasons. An
authorized exception is recorded as risk acceptance, not relabeled as a proof.

## Network destinations and secret disclosure

For "no outbound network", inspect **attempts**, including ones that would fail;
blocking the model's actual I/O must not make the analyzed program appear pure.
Keep API invocation, network attempt and delivered bytes distinct. A model that
captures a first attempt can provide value before full transport semantics, but
cannot claim the rest of execution or further destinations are covered.

Report destinations as exact, conditional finite alternatives, symbolic values
with constraints, or unknown. A hostname derived from input or a remote response
may have infinitely many possibilities. Return that expression/domain and the
code that constructs it; never invent a finite exhaustive list by sampling.
Protocol, port, method, path, redirects, proxies, DNS and raw sockets matter too.
Unmodeled shell/native/subprocess traffic is a blocker, not absence of traffic.

Destination approval alone does not establish benign behavior. A permitted
service can receive a secret in an URL, header or body, or perform an unauthorized
publish/write action. Add policies for secret-to-network/log/file/process flows,
protected-file modification, unexpected process launches and package publishing.
Direct data provenance, transformations/encodings and eventually control-dependent
leakage need generic information-flow support; symbolic strings alone are not
a complete information-flow model. Until those rules are implemented, report
that policy as unsupported rather than treating an allowed hostname as sufficient.

Bind approvals/caches to exact artifact bytes and dependency graph, scenario,
allowed operation/data constraints, policy, and engine/model versions. Changes
invalidate approval. The adapter must execute the same reviewed bytes and
environment contract; future downloads are separate unreviewed artifacts.
Where prevention is promised, install/runtime containment must enforce approved
capabilities. A static report cannot stop code that bypasses the gate.

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

1. **Agent report on the existing real target.** Define the request/report
   schema in specs and expose the existing static-server outcomes through the
   library: code provenance, named symbolic inputs, conditions, source locations,
   effects, unfinished responses, explicit assumptions and structured blockers.
   Preserve the current all-assignment assertions and native witnesses. A
   terminal UI is unnecessary; the CLI later serializes the same contract.
2. **Small generic security proof.** A benign complete dependency fixture uses
   a supported Node outbound API conditionally. Report exact/finite/unknown
   destinations, a proved no-attempt control, a feasible violating condition,
   a secret-bearing allowed-host case, and an unsupported subprocess case.
   Add shared host semantics and provenance/flow rules needed by those specs;
   no application-name rules. Unsupported cases must fail admission explicitly.
   Security proof mode must reject or repair reached unverified/legacy semantics,
   including missing builtin members that currently look like ordinary undefined.
3. **Agent CLI and pinned lifecycle subset.** Expose JSON requests/reports and
   deterministic failure codes; then represent selected npm install hooks and
   import/use as separate triggers. Verify orchestration against the pinned
   package-manager runtime using harmless full fixtures. Unsupported shell/ESM/
   native/async continuations stay visible; do not claim complete npm coverage.
4. **One original incident artifact plus a clean control.** Use a controlled,
   pinned Shai-Hulud fixture. Derive at least one forbidden effect from ordinary
   execution with source/condition/evidence, retain every blocker, and expand
   coverage one reusable feature at a time. Whole-worm and all-destination
   coverage are later criteria, not prerequisites to a useful first finding.
5. **Admission adapter and regression corpus.** Prevent target execution before
   the verdict, bind decisions to reviewed bytes/configuration, distinguish
   violation from inconclusive, test invalidation and bypass cases, and keep
   controls for legitimate downloads without credential disclosure. Grow across
   incident waves, ordinary packages and larger graphs. Treat artifact matching
   and known-malware feeds as complementary defenses, not symbolic proof.

This sequence supersedes deeper descriptor-lifetime work as the immediate next
priority. The filesystem, transport and language gaps remain open in the backlog
and are implemented when required by a declared analysis question or shared
semantic correctness. The real-application goal remains active: its existing
proof is the first consumer of the agent contract, not an abandoned demo.
