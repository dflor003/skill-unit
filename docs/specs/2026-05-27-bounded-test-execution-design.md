# Bounded Test Execution

**Status:** Draft
**Date:** 2026-05-27

## Goal

Stop wall-clock timeouts from masquerading as behavioral failures, and give the test-subject agent the context it needs to be decisive within its turn budget. Today, open-ended prompts (e.g. STT-13 "Fix the failing SU-2 test", when the failure is environmental and unfixable) invite the agent to dig until the 300s `SIGTERM` kills it mid-turn. The runner produces a truncated transcript with no `result` event, the grader reads a fragment, and the test fails for the wrong reason.

This design makes three coordinated changes to the existing pipeline:

1. Parameterize the system prompt with the manifest's `max-turns` and add a decisiveness directive.
2. Surface the existing `'timedout'` status in the rollup, summary, and `report.md` (most of this is already wired; the counter is the missing piece).
3. Distinguish timeout-tainted runs from behavioral-fail runs at the CLI exit code.

Defaults for `runner.max-turns` (10) and per-spec `timeout` (300s) are unchanged. The system-prompt nudge does the heavy lifting at the default budget. Specs that legitimately need tighter or looser bounds tune them per-spec.

## What Is Already In Place

A scan of the codebase before drafting this spec turned up substantial existing scaffolding for TIMEOUT, which narrows the scope of the work:

- [`TestStatus`](src/types/run.ts#L1-L9) already includes `'timedout'`.
- [test.ts:351-357](src/cli/commands/test.ts#L351-L357) already maps `tr.timedOut` to `status: 'timedout'` on the per-test result.
- [ci-reporter.ts](src/core/ci-reporter.ts) already renders the hourglass glyph, the "TIMEOUT" label, and a "N timed out" count in the CI-mode summary.
- [junit.ts](src/core/junit.ts) already emits `<error>` (not `<failure>`) for timed-out tests so JUnit consumers distinguish them.
- The TUI ([progress-tree.tsx](src/tui/components/progress-tree.tsx), [session-panel.tsx](src/tui/components/session-panel.tsx), [split-panes.tsx](src/tui/components/split-panes.tsx), [ticker.tsx](src/tui/components/ticker.tsx), [runner.tsx](src/tui/screens/runner.tsx)) already handles the `'timedout'` state visually.

What is **not** yet in place: the system-prompt change, the `RunResult.timedOut` counter, the non-CI terminal summary line, the `report.md` rendering, and the exit-code precedence. The actual work below is a thin layer over what already exists.

## Non-Goals

- **Live turn counter for the agent.** The runner uses `--print` (single-shot, prompt via stdin). The CLI does not expose a way to inject mid-conversation messages between assistant turns. Telling the agent "you are now on turn 7 of 10" would require switching to an interactive/streaming-input model. Out of scope. The agent learns only the ceiling.
- **Lowering the default `max-turns`.** Some specs legitimately need 10 turns. Per-spec tuning remains the lever; the systemic fix is the disposition shift.
- **Lowering the default `timeout`.** The timeout becomes a safety net, not the primary constraint. Keeping it generous matters because hitting it now produces a distinct, actionable signal rather than a misleading fail.
- **Grader skip on timeout.** The grader still runs on truncated transcripts. Its verdict is preserved in `*.results.md` for diagnostic value, but it does not determine the test's top-level classification when the run timed out (status already overrides at [test.ts:351-357](src/cli/commands/test.ts#L351-L357)).
- **New CLI subcommands or `.skill-unit.yml` schema changes.**
- **Changing [TestStats.lastResult](src/types/run.ts#L58) from `'pass' | 'fail'` to include `'timeout'`.** Trend tracking in the TUI currently buckets timeouts as `'fail'`; revisiting that is a separate decision that touches stats migration.

## Problem

Two failure modes look identical in today's terminal summary and `report.md`:

1. **Behavioral failure** — agent reaches a conclusion within turns and time, but the conclusion is wrong. Transcript is complete. Grader reads it and emits FAIL with a specific reason.
2. **Wall-clock timeout** — agent runs out of clock mid-turn. Process killed by `SIGTERM` at [runner.ts:549-552](src/core/runner.ts#L549-L552). No `result` event fires, transcript is truncated, grader reads a fragment and emits FAIL.

Per-test status correctly distinguishes them ([test.ts:351-357](src/cli/commands/test.ts#L351-L357)), but the rollup does not. [test.ts:395-396](src/cli/commands/test.ts#L395-L396) computes `totalFailed = testResults.filter((t) => !t.passed).length`, which silently absorbs timeouts. From there, `RunResult.failed` carries that conflated count into `generateSummary`, `report.md`, the stats file, and the exit-code branch.

The root cause of the churn itself is the open-endedness of certain prompts combined with the absence of any budget cue in the system prompt. STT-13 is the canonical case: the _correct_ behavior is for the agent to conclude "no file I can edit fixes this missing dependency" and stop. With no decisiveness signal, the agent keeps investigating instead.

## Design

### 1. System-prompt turn budget

[`buildSystemPrompt`](src/core/runner.ts#L51-L60) gains a `maxTurns: number` parameter. The function appends a "Turn Budget" section after the existing workspace-scoping content:

```
## Turn Budget

You have up to N assistant turns to complete this task. Be decisive. Prefer
reaching a conclusion over exhaustive investigation. If the task is out of
scope, if you cannot make progress, or if you have determined the answer,
state your conclusion and stop rather than continuing to explore.
```

Where `N` is the resolved `maxTurns` value (local variable on [runner.ts:679](src/core/runner.ts#L679), passed into `TOOL_PROFILES.claude` at [runner.ts:128](src/core/runner.ts#L128)).

**Why this wording.** "Be decisive" and "state your conclusion and stop" are real harness-natural directives. They do not signal that the agent is being tested. Production sessions under any harness have implicit budgets; this just makes the existing reality explicit.

**Why include the number.** The ceiling lets the agent calibrate aggressiveness. "Up to 4 turns" and "up to 20 turns" warrant very different exploration depths. A generic nudge without the number leaves the agent guessing.

**What the agent does not get.** A live turn counter. The agent knows the ceiling but not which turn it is currently on. This is a hard architectural constraint of the `--print` single-shot model and is documented as a Non-Goal above.

The signature change ripples through the existing `ArgBuilder` profile call at [runner.ts:128](src/core/runner.ts#L128) and any future tool profiles in [`TOOL_PROFILES`](src/core/runner.ts#L104-L137).

### 2. TIMEOUT counter in the rollup and reports

[`RunResult`](src/types/run.ts#L28-L39) gains a `timedOut: number` field alongside `passed` and `failed`. [`StatsIndex.runs[]`](src/types/run.ts#L74-L83) gets the same field for consistency, recorded by [`recordRun`](src/core/stats.ts) so historical timeout rate is queryable.

**Counter computation in [test.ts](src/cli/commands/test.ts).** Replace the current [lines 395-396](src/cli/commands/test.ts#L395-L396):

```typescript
const totalPassed = testResults.filter((t) => t.passed).length;
const totalFailed = testResults.filter((t) => !t.passed).length;
```

with:

```typescript
const totalPassed = testResults.filter((t) => t.status === 'passed').length;
const totalTimedOut = testResults.filter((t) => t.status === 'timedout').length;
const totalFailed = testResults.filter(
  (t) => !t.passed && t.status !== 'timedout'
).length;
```

so a timed-out test is excluded from `totalFailed`, and `'error'`-status tests still roll up into `totalFailed` (preserving current behavior for non-timeout exit failures).

**`generateSummary`.** [reporter.ts:700-716](src/core/reporter.ts#L700-L716) reads `runResult.passed` and `runResult.failed`. Add a `timedOut` part to the joined line when `runResult.timedOut > 0`:

```
12 passed | 1 failed | 1 timed out | 14 total | 42.3s | $0.1234 | 12,345 tokens
```

Omit the `timed out` part when the count is zero so the common-case output is unchanged.

**`report.md`.** [`generateReport`](src/core/reporter.ts#L525) currently assembles report content only from parsed `*.results.md` files (grader output). It has no visibility into timeouts, because the grader's view of a timed-out transcript is just a low-quality FAIL. Solution: thread `runResult.tests` into `generateReport` so it can emit a `## Timed Out` section listing any tests whose `status === 'timedout'`, plus a counter in the header. The grader's `*.results.md` for those tests is still parsed and surfaces under its existing section; the `## Timed Out` section is additive and explanatory.

The signature of `generateReport` changes from `(runDir: string)` to `(runDir: string, tests: TestResult[])`. The single call site at [test.ts:264](src/cli/commands/test.ts) has the test list available before `generateReport` runs and can pass it in.

### 3. Distinct CLI exit code

[test.ts:454-456](src/cli/commands/test.ts#L454-L456) currently:

```typescript
if (totalFailed > 0) {
  process.exit(1);
}
```

becomes:

```typescript
if (totalTimedOut > 0) {
  process.exit(2);
} else if (totalFailed > 0) {
  process.exit(1);
}
```

| Exit | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | All tests passed.                                                     |
| 1    | At least one behavioral FAIL, and no timeouts.                        |
| 2    | At least one TIMEOUT (regardless of whether other tests also FAILed). |

**Rationale.** TIMEOUT is the more actionable signal for CI ("retry, or investigate infra/budget"). Behavioral FAIL is the developer signal ("the skill regressed"). CI that just wants "did anything go wrong?" keeps working (`exit != 0`). CI that wants to branch (auto-retry timeouts but not fails) reads the specific code.

Exit code 2 takes precedence over 1 because a timeout-tainted run is fundamentally inconclusive about the skill's behavior. A maintainer looking at a 2 knows to fix the infra/budget first before drawing conclusions about any other failures in the same run.

The early-exit branches at [test.ts:225](src/cli/commands/test.ts#L225) and [test.ts:455](src/cli/commands/test.ts#L455) (error paths) stay on exit 1; they are framework errors, not test outcomes.

## Files Touched

- [src/core/runner.ts](src/core/runner.ts) — `buildSystemPrompt` gets a `maxTurns` parameter; `TOOL_PROFILES.claude` threads it in.
- [src/types/run.ts](src/types/run.ts) — `timedOut: number` on `RunResult` and on `StatsIndex.runs[]`.
- [src/cli/commands/test.ts](src/cli/commands/test.ts) — split `totalFailed` from `totalTimedOut`, populate `runResult.timedOut`, exit-code precedence.
- [src/core/reporter.ts](src/core/reporter.ts) — `generateSummary` emits the timed-out part; `generateReport` accepts `tests: TestResult[]` and emits a `## Timed Out` section.
- [src/core/stats.ts](src/core/stats.ts) — persist `timedOut` in stats `runs[]` entries.
- Existing unit tests under [tests/core/](tests/core/) and [tests/cli/](tests/cli/) — coverage for `generateSummary`, `generateReport`, and the exit-code branch when a run contains a timeout.

## Verification

The systemic claim of this design is verifiable directly against the failing case that prompted it: STT-13 currently times out because the agent does not conclude "I cannot fix this; the failure is environmental" within 300s. After this change, the agent's system prompt should produce that conclusion within its turn budget, and the test should pass on its existing expectations. If STT-13 still times out after the change, the system-prompt wording is not strong enough and needs another pass.

Beyond STT-13, the other tests that have been timing out should be re-run after the change. Any that still time out are candidates for per-spec `max-turns` or `timeout` tuning, and now show up distinctly in the report and exit code rather than as ambiguous FAILs.
