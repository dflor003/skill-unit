# Bounded Test Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop wall-clock timeouts from masquerading as behavioral failures by adding a turn-budget directive to the system prompt, surfacing TIMEOUT as a first-class counter in the rollup and reports, and giving CI a distinct exit code for timeout-tainted runs.

**Architecture:** Three coordinated changes to the existing pipeline. (1) [`buildSystemPrompt`](../../src/core/runner.ts) gains a `maxTurns` parameter and appends a "Turn Budget" section telling the agent to be decisive. (2) [`RunResult`](../../src/types/run.ts) and [`StatsIndex.runs[]`](../../src/types/run.ts) gain a `timedOut: number` counter, [test.ts](../../src/cli/commands/test.ts) computes it (splitting timeouts out of `totalFailed`), and [`generateSummary`](../../src/core/reporter.ts) + [`generateReport`](../../src/core/reporter.ts) surface it. (3) The CLI exit code becomes `0`/`1`/`2`, with `2` reserved for timeout-tainted runs. Most of the TIMEOUT plumbing (`'timedout'` status, CI reporter, JUnit, TUI) is already in place — this plan only fills the remaining gaps.

**Tech Stack:** TypeScript (strict mode), Vitest for unit tests. The existing test files import from `vitest` and use multiple top-level `describe` blocks per file; match that convention (the `.claude/rules/test-conventions.md` file describes an older `node:test` convention that the codebase no longer follows).

**Reference spec:** [docs/specs/2026-05-27-bounded-test-execution-design.md](../specs/2026-05-27-bounded-test-execution-design.md).

---

## File Structure

| File                                                               | Change           | Responsibility                                                                                                                             |
| ------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [src/core/runner.ts](../../src/core/runner.ts)                     | Modify           | `buildSystemPrompt` takes `maxTurns`; `TOOL_PROFILES.claude` threads it in.                                                                |
| [src/types/run.ts](../../src/types/run.ts)                         | Modify           | `RunResult.timedOut: number`; `StatsIndex.runs[].timedOut: number`.                                                                        |
| [src/core/stats.ts](../../src/core/stats.ts)                       | Modify           | `recordRun` / `rebuildIndex` persist the new field.                                                                                        |
| [src/cli/commands/test.ts](../../src/cli/commands/test.ts)         | Modify           | Split `totalFailed`/`totalTimedOut`; populate `runResult.timedOut`; exit-code precedence; thread `tests` into `generateReport`.            |
| [src/core/reporter.ts](../../src/core/reporter.ts)                 | Modify           | `generateSummary` shows "N timed out"; `generateReport` accepts `tests` and emits `## Timed Out` section.                                  |
| [src/core/exit-code.ts](../../src/core/exit-code.ts)               | Create           | New small pure module exporting `computeExitCode(failed, timedOut)` so the exit-code precedence is unit-testable without spawning the CLI. |
| [tests/core/runner.spec.ts](../../tests/core/runner.spec.ts)       | Modify           | Update `buildSystemPrompt` test for new signature + new "Turn Budget" content.                                                             |
| [tests/core/reporter.spec.ts](../../tests/core/reporter.spec.ts)   | Modify           | `generateSummary` cases for `timedOut`; new `generateReport` cases for `## Timed Out` section.                                             |
| [tests/core/stats.spec.ts](../../tests/core/stats.spec.ts)         | Create or Modify | `recordRun` and `rebuildIndex` persist `timedOut`. (Create the file if it does not already exist; otherwise add a `describe` block.)       |
| [tests/core/exit-code.spec.ts](../../tests/core/exit-code.spec.ts) | Create           | Cover the `computeExitCode` precedence table from the spec.                                                                                |

The extracted [src/core/exit-code.ts](../../src/core/exit-code.ts) is the only new file. It keeps the test-runner command thin and the precedence rule unit-testable without integration overhead.

---

## Pre-flight

- [ ] **Step 0: Verify baseline is green**

Run from the repo root:

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all three commands exit 0. If any are red on `main`/`feature/SupportTroubleshooting` before you begin, stop and surface the failures — do not start work on top of a broken baseline.

---

## Task 1: System-prompt turn budget

**Files:**

- Modify: [src/core/runner.ts:51-60](../../src/core/runner.ts#L51-L60) (`buildSystemPrompt`)
- Modify: [src/core/runner.ts:104-137](../../src/core/runner.ts#L104-L137) (`TOOL_PROFILES.claude` call site at line 128)
- Modify: [tests/core/runner.spec.ts:12-18](../../tests/core/runner.spec.ts#L12-L18)

- [ ] **Step 1.1: Update the existing `buildSystemPrompt` test to require the new signature and Turn Budget content**

Replace the existing `describe('buildSystemPrompt', ...)` block in [tests/core/runner.spec.ts](../../tests/core/runner.spec.ts) with:

```typescript
describe('buildSystemPrompt', () => {
  it('includes workspace path constraint', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 10);
    expect(prompt).toContain('/workspace/abc123');
    expect(prompt).toContain('workspace');
  });

  it('includes the turn budget number', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 7);
    expect(prompt).toContain('Turn Budget');
    expect(prompt).toContain('up to 7 assistant turns');
  });

  it('includes the decisiveness directive', () => {
    const prompt = buildSystemPrompt('/workspace/abc123', 10);
    expect(prompt).toContain('Be decisive');
    expect(prompt).toContain('state your conclusion and stop');
  });
});
```

- [ ] **Step 1.2: Run the test and confirm it fails**

```bash
npm test -- tests/core/runner.spec.ts
```

Expected: the new `buildSystemPrompt` tests fail. The first one fails because the current signature only accepts one argument (TypeScript compile error or runtime error depending on how vitest reports it); the other two fail because the new content does not exist.

- [ ] **Step 1.3: Update `buildSystemPrompt` to accept `maxTurns` and emit the Turn Budget section**

Replace [src/core/runner.ts:51-60](../../src/core/runner.ts#L51-L60) with:

```typescript
/**
 * Build a system prompt that constrains the agent to the given workspace path
 * and informs it of its turn budget.
 */
export function buildSystemPrompt(
  workspacePath: string,
  maxTurns: number
): string {
  return `You are working in the directory: ${workspacePath}
You MUST NOT read, write, or access any files outside this directory.
All file operations (Read, Write, Edit, Glob, Grep, Bash) must target only files within this directory.
Do not use parent directory traversal or absolute paths outside this directory.

Always use relative paths from within the working directory for all tool calls.

Always use the Write or Edit tools for writing files. DO NOT fall back to the Bash tool for file writes if a tool call is blocked. Instead, inform the user and wait for further instructions.

## Turn Budget

You have up to ${maxTurns} assistant turns to complete this task. Be decisive. Prefer reaching a conclusion over exhaustive investigation. If the task is out of scope, if you cannot make progress, or if you have determined the answer, state your conclusion and stop rather than continuing to explore.`;
}
```

- [ ] **Step 1.4: Update the `TOOL_PROFILES.claude` call site to pass `maxTurns` into `buildSystemPrompt`**

At [src/core/runner.ts:127-128](../../src/core/runner.ts#L127-L128), change:

```typescript
    '--system-prompt',
    buildSystemPrompt(workspacePath),
```

to:

```typescript
    '--system-prompt',
    buildSystemPrompt(workspacePath, maxTurns),
```

The `maxTurns` parameter is already in scope inside the `claude` arg builder ([runner.ts:106](../../src/core/runner.ts#L106)).

- [ ] **Step 1.5: Run the runner tests and confirm they pass**

```bash
npm test -- tests/core/runner.spec.ts
```

Expected: all `buildSystemPrompt` tests pass.

- [ ] **Step 1.6: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: both exit 0. If there is a TypeScript error elsewhere about `buildSystemPrompt` arity, it means there is another call site to update — search for it with `Grep` and add the `maxTurns` argument.

- [ ] **Step 1.7: Commit**

```bash
git add src/core/runner.ts tests/core/runner.spec.ts
git commit -m "$(cat <<'EOF'
feat(runner): Add turn-budget directive to system prompt

- Parameterized buildSystemPrompt with maxTurns
- Appended a Turn Budget section telling the agent to be decisive and stop on reaching a conclusion
- Updated TOOL_PROFILES.claude call site to thread maxTurns through
EOF
)"
```

---

## Task 2: Add `timedOut` field to `RunResult` and `StatsIndex.runs`

**Files:**

- Modify: [src/types/run.ts:28-39](../../src/types/run.ts#L28-L39) (`RunResult`)
- Modify: [src/types/run.ts:74-83](../../src/types/run.ts#L74-L83) (`StatsIndex.runs[]` items)
- Modify: [src/core/stats.ts](../../src/core/stats.ts) (`recordRun`, `rebuildIndex`)
- Create or Modify: [tests/core/stats.spec.ts](../../tests/core/stats.spec.ts)

This task only adds the field and persists it. The producer (`test.ts`) is updated in Task 3, so for now any code that constructs a `RunResult` needs `timedOut` defaulted to `0`. TypeScript will flag missing properties; address them by adding `timedOut: 0` to those literals.

- [ ] **Step 2.1: Check whether `tests/core/stats.spec.ts` exists**

Run from the repo root:

```bash
ls c:/Projects/skill-unit/tests/core/stats.spec.ts
```

If the file exists, you will add a new `describe` block in the steps below. If it does not exist, you will create it. Note which case applies before continuing.

- [ ] **Step 2.2: Write the failing test for `recordRun` persisting `timedOut`**

In [tests/core/stats.spec.ts](../../tests/core/stats.spec.ts), add (or create the file containing) this `describe` block:

```typescript
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { recordRun, loadIndex } from '../../src/core/stats.js';
import type { RunResult } from '../../src/types/run.js';

describe('recordRun timedOut field', () => {
  it('persists timedOut on the StatsIndex.runs entry', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-stats-'));
    const run: RunResult = {
      id: '2026-05-27-12-00-00',
      timestamp: '2026-05-27T12:00:00Z',
      testCount: 3,
      passed: 1,
      failed: 1,
      timedOut: 1,
      durationMs: 5000,
      cost: 0.01,
      tokens: 500,
      tests: [],
    };

    recordRun(run, tmp);

    const index = loadIndex(tmp);
    expect(index.runs).toHaveLength(1);
    expect(index.runs[0].timedOut).toBe(1);
  });
});
```

If the file already exists, append the `describe` block above the existing top-level structure (multiple top-level describes are allowed in this codebase).

- [ ] **Step 2.3: Run the test and confirm it fails**

```bash
npm test -- tests/core/stats.spec.ts
```

Expected: fails on the type system or at runtime because `RunResult` does not yet declare `timedOut` and the index entry does not carry it.

- [ ] **Step 2.4: Add `timedOut` to `RunResult`**

In [src/types/run.ts](../../src/types/run.ts), modify the `RunResult` interface at lines 28-39:

```typescript
export interface RunResult {
  id: string;
  timestamp: string;
  testCount: number;
  passed: number;
  failed: number;
  timedOut: number;
  durationMs: number;
  cost: number;
  tokens: number;
  tests: TestResult[];
  reportPath?: string;
}
```

- [ ] **Step 2.5: Add `timedOut` to `StatsIndex.runs[]` items**

In [src/types/run.ts](../../src/types/run.ts), modify the `StatsIndex` interface at lines 74-83:

```typescript
runs: Array<{
  id: string;
  timestamp: string;
  testCount: number;
  passed: number;
  failed: number;
  timedOut: number;
  duration: number;
  cost: number;
  tokens: number;
}>;
```

- [ ] **Step 2.6: Persist `timedOut` in `recordRun`**

In [src/core/stats.ts:48-57](../../src/core/stats.ts#L48-L57), modify the `index.runs.push(...)` call:

```typescript
index.runs.push({
  id: result.id,
  timestamp: result.timestamp,
  testCount: result.testCount,
  passed: result.passed,
  failed: result.failed,
  timedOut: result.timedOut,
  duration: result.durationMs,
  cost: result.cost,
  tokens: result.tokens,
});
```

- [ ] **Step 2.7: Persist `timedOut` in `rebuildIndex`**

In [src/core/stats.ts:223-232](../../src/core/stats.ts#L223-L232), modify the corresponding `index.runs.push(...)` call inside `rebuildIndex`:

```typescript
index.runs.push({
  id: runData.id,
  timestamp: runData.timestamp,
  testCount: runData.testCount,
  passed: runData.passed,
  failed: runData.failed,
  timedOut: runData.timedOut,
  duration: runData.durationMs,
  cost: runData.cost,
  tokens: runData.tokens,
});
```

- [ ] **Step 2.8: Run typecheck and fix all `RunResult` construction sites**

```bash
npm run typecheck
```

Expected: TypeScript flags every place that constructs a `RunResult` literal without `timedOut`. Sites you will likely need to update:

- [src/cli/commands/test.ts:398-412](../../src/cli/commands/test.ts) (the production producer — set `timedOut: 0` for now; Task 3 will compute the real value).
- [tests/core/reporter.spec.ts:618-636](../../tests/core/reporter.spec.ts#L618-L636) (existing `generateSummary` test literal — add `timedOut: 0`).
- Any other `runResult` literal across `tests/` flagged by tsc.

For each flagged literal, add `timedOut: 0,` next to the existing `passed:` / `failed:` fields. Do **not** restructure unrelated code.

Re-run `npm run typecheck` until it exits clean.

- [ ] **Step 2.9: Run the stats test and confirm it passes**

```bash
npm test -- tests/core/stats.spec.ts
```

Expected: PASS.

- [ ] **Step 2.10: Run the full test suite**

```bash
npm test
```

Expected: all tests pass. If something else breaks because `result.timedOut` is `undefined` somewhere, trace it back to a missing `timedOut: 0` in a `RunResult` literal.

- [ ] **Step 2.11: Commit**

```bash
git add src/types/run.ts src/core/stats.ts tests/core/stats.spec.ts src/cli/commands/test.ts tests/core/reporter.spec.ts
git commit -m "$(cat <<'EOF'
feat(stats): Add timedOut counter to RunResult and stats index

- Added timedOut: number to RunResult and StatsIndex.runs entries
- Persisted the field in recordRun and rebuildIndex
- Defaulted timedOut to 0 at construction sites (real value computed in next change)
EOF
)"
```

---

## Task 3: Compute `timedOut` counter in `test.ts` and add exit-code precedence

**Files:**

- Create: [src/core/exit-code.ts](../../src/core/exit-code.ts)
- Create: [tests/core/exit-code.spec.ts](../../tests/core/exit-code.spec.ts)
- Modify: [src/cli/commands/test.ts:395-396](../../src/cli/commands/test.ts#L395-L396) (counter computation)
- Modify: [src/cli/commands/test.ts:398-412](../../src/cli/commands/test.ts) (populate `runResult.timedOut`)
- Modify: [src/cli/commands/test.ts:454-456](../../src/cli/commands/test.ts#L454-L456) (exit code)

The exit-code precedence is extracted into a pure helper so it can be tested with vitest without spawning the CLI.

- [ ] **Step 3.1: Write the failing test for `computeExitCode`**

Create [tests/core/exit-code.spec.ts](../../tests/core/exit-code.spec.ts):

```typescript
import { describe, it, expect } from 'vitest';
import { computeExitCode } from '../../src/core/exit-code.js';

describe('computeExitCode', () => {
  it('returns 0 when nothing failed and nothing timed out', () => {
    expect(computeExitCode(0, 0)).toBe(0);
  });

  it('returns 1 when something failed and nothing timed out', () => {
    expect(computeExitCode(3, 0)).toBe(1);
  });

  it('returns 2 when something timed out, even if nothing else failed', () => {
    expect(computeExitCode(0, 1)).toBe(2);
  });

  it('returns 2 when both failed and timed out are non-zero (timeout takes precedence)', () => {
    expect(computeExitCode(2, 1)).toBe(2);
  });
});
```

- [ ] **Step 3.2: Run the test and confirm it fails**

```bash
npm test -- tests/core/exit-code.spec.ts
```

Expected: fails with "Cannot find module '../../src/core/exit-code.js'".

- [ ] **Step 3.3: Implement `computeExitCode`**

Create [src/core/exit-code.ts](../../src/core/exit-code.ts):

```typescript
/**
 * Determine the CLI exit code for a completed test run.
 *
 * Precedence:
 *   - 2 if any test timed out (regardless of other failures)
 *   - 1 if any test failed behaviorally
 *   - 0 if everything passed
 *
 * Timeouts are inconclusive about skill behavior, so they take precedence:
 * a maintainer seeing exit 2 should fix the infra/budget first before drawing
 * conclusions about any other failures in the same run.
 */
export function computeExitCode(failed: number, timedOut: number): number {
  if (timedOut > 0) return 2;
  if (failed > 0) return 1;
  return 0;
}
```

- [ ] **Step 3.4: Run the test and confirm it passes**

```bash
npm test -- tests/core/exit-code.spec.ts
```

Expected: all four cases pass.

- [ ] **Step 3.5: Update `test.ts` to compute the three counters separately**

Replace [src/cli/commands/test.ts:395-396](../../src/cli/commands/test.ts#L395-L396):

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

This preserves current behavior for non-timeout failures: a test with `status: 'error'` and `passed: false` still rolls up into `totalFailed`.

- [ ] **Step 3.6: Populate `runResult.timedOut`**

In [src/cli/commands/test.ts:398-412](../../src/cli/commands/test.ts), modify the `runResult` literal to include the new field (replacing the `timedOut: 0` placeholder added in Task 2):

```typescript
const runResult: RunResult = {
  id: timestamp,
  timestamp,
  testCount: testResults.length,
  passed: totalPassed,
  failed: totalFailed,
  timedOut: totalTimedOut,
  durationMs: runDurationMs,
  cost: testRunResults.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
  tokens: testRunResults.reduce(
    (sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0),
    0
  ),
  tests: testResults,
  reportPath: reportResult.reportPath,
};
```

- [ ] **Step 3.7: Replace the exit-code branch with `computeExitCode`**

Add an import at the top of [src/cli/commands/test.ts](../../src/cli/commands/test.ts), grouped with other `../../core/` imports:

```typescript
import { computeExitCode } from '../../core/exit-code.js';
```

Replace [src/cli/commands/test.ts:454-456](../../src/cli/commands/test.ts#L454-L456):

```typescript
if (totalFailed > 0) {
  process.exit(1);
}
```

with:

```typescript
const exitCode = computeExitCode(totalFailed, totalTimedOut);
if (exitCode !== 0) {
  process.exit(exitCode);
}
```

Leave the early-exit branches at [test.ts:225](../../src/cli/commands/test.ts#L225) and [test.ts:455](../../src/cli/commands/test.ts) (the framework-error paths) on `process.exit(1)` — these are not test-outcome exits and the spec explicitly preserves them.

- [ ] **Step 3.8: Run typecheck, lint, and the full test suite**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all three exit 0.

- [ ] **Step 3.9: Commit**

```bash
git add src/core/exit-code.ts tests/core/exit-code.spec.ts src/cli/commands/test.ts
git commit -m "$(cat <<'EOF'
feat(cli): Split timeouts from failures in counters and exit code

- Added computeExitCode helper with 0/1/2 precedence (timeout takes precedence over fail)
- Split totalFailed and totalTimedOut in the test command rollup
- Populated runResult.timedOut from the per-test status
- test command now exits 2 when any test timed out, 1 for behavioral fails, 0 otherwise
EOF
)"
```

---

## Task 4: `generateSummary` shows the timed-out count

**Files:**

- Modify: [src/core/reporter.ts:700-716](../../src/core/reporter.ts#L700-L716) (`generateSummary`)
- Modify: [tests/core/reporter.spec.ts:618-636](../../tests/core/reporter.spec.ts#L618-L636)

- [ ] **Step 4.1: Extend the `generateSummary` test block**

Replace the existing `describe('generateSummary', ...)` block in [tests/core/reporter.spec.ts](../../tests/core/reporter.spec.ts) with:

```typescript
describe('generateSummary', () => {
  it('produces terminal summary with pass/fail counts when no timeouts', () => {
    const runResult = {
      id: '2026-04-07-10-00-00',
      timestamp: '2026-04-07T10:00:00Z',
      testCount: 3,
      passed: 2,
      failed: 1,
      timedOut: 0,
      durationMs: 5000,
      cost: 0.05,
      tokens: 3000,
      tests: [],
    };
    const summary = generateSummary(runResult);
    expect(summary).toContain('2 passed');
    expect(summary).toContain('1 failed');
    expect(summary).toContain('3 total');
    expect(summary).not.toContain('timed out');
  });

  it('includes the timed out count when greater than zero', () => {
    const runResult = {
      id: '2026-04-07-10-00-00',
      timestamp: '2026-04-07T10:00:00Z',
      testCount: 4,
      passed: 2,
      failed: 1,
      timedOut: 1,
      durationMs: 5000,
      cost: 0.05,
      tokens: 3000,
      tests: [],
    };
    const summary = generateSummary(runResult);
    expect(summary).toContain('2 passed');
    expect(summary).toContain('1 failed');
    expect(summary).toContain('1 timed out');
    expect(summary).toContain('4 total');
  });
});
```

- [ ] **Step 4.2: Run the test and confirm it fails**

```bash
npm test -- tests/core/reporter.spec.ts -t generateSummary
```

Expected: the "includes the timed out count" test fails because the current implementation never emits the string `timed out`.

- [ ] **Step 4.3: Update `generateSummary`**

Replace [src/core/reporter.ts:700-716](../../src/core/reporter.ts#L700-L716) with:

```typescript
export function generateSummary(runResult: RunResult): string {
  const { passed, failed, timedOut, testCount, durationMs, cost, tokens } =
    runResult;
  const durationSec = (durationMs / 1000).toFixed(1);
  const costStr = `$${cost.toFixed(4)}`;
  const tokStr = tokens.toLocaleString();

  const parts = [`${passed} passed`, `${failed} failed`];
  if (timedOut > 0) {
    parts.push(`${timedOut} timed out`);
  }
  parts.push(
    `${testCount} total`,
    `${durationSec}s`,
    costStr,
    `${tokStr} tokens`
  );

  return parts.join(' | ');
}
```

- [ ] **Step 4.4: Run the tests and confirm they pass**

```bash
npm test -- tests/core/reporter.spec.ts -t generateSummary
```

Expected: both `generateSummary` cases pass.

- [ ] **Step 4.5: Run the full test suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 4.6: Commit**

```bash
git add src/core/reporter.ts tests/core/reporter.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporter): Show timed-out count in terminal summary

- generateSummary appends "N timed out" when runResult.timedOut > 0
- Omitted the segment when zero to keep common-case output unchanged
EOF
)"
```

---

## Task 5: `generateReport` accepts tests and emits a `## Timed Out` section

**Files:**

- Modify: [src/core/reporter.ts:525](../../src/core/reporter.ts#L525) (`generateReport` signature)
- Modify: [src/core/reporter.ts:660-695](../../src/core/reporter.ts) (the report-assembly tail of `generateReport`)
- Modify: [src/cli/commands/test.ts](../../src/cli/commands/test.ts) (call site)
- Modify: [tests/core/reporter.spec.ts](../../tests/core/reporter.spec.ts) (multiple `generateReport(tmpDir)` call sites — update to pass an empty `tests` array, plus add new assertions for the timed-out section)

`generateReport` currently reads only grader `*.results.md` files. To surface timeouts (which the grader cannot meaningfully classify), the function takes a `tests: TestResult[]` argument and emits an additive `## Timed Out` section when any test has `status === 'timedout'`.

- [ ] **Step 5.1: Read the tail of `generateReport` so you know where to append the section**

Open [src/core/reporter.ts](../../src/core/reporter.ts) and locate the block ending around lines 660-695 (the assembly of `lines` / `termLines` and the `terminalSummary` / `report.md` write). You will insert the `## Timed Out` section in the report content before the final write.

If the structure has drifted since this plan was written, hold position — find where `report.md` content is concatenated, that is the insertion point. Do not restructure unrelated code.

- [ ] **Step 5.2: Write the failing test for the new section**

Add this `describe` block to [tests/core/reporter.spec.ts](../../tests/core/reporter.spec.ts):

```typescript
describe('generateReport with timed-out tests', () => {
  it('emits a Timed Out section when at least one test has status timedout', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-report-'));
    fs.mkdirSync(path.join(tmpDir, 'results'), { recursive: true });

    // Seed one passing grader result file so generateReport finds something
    // (its bail-out path returns early when results dir is empty).
    const minimalJson = {
      testId: 'SU-1',
      testName: 'A passing test',
      passed: true,
      expectations: [{ text: 'works', met: true }],
      negativeExpectations: [],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'demo.SU-1.results.md'),
      `\`\`\`json\n${JSON.stringify(minimalJson)}\n\`\`\`\n`
    );

    const tests = [
      {
        id: 'SU-1',
        name: 'A passing test',
        specName: 'demo',
        status: 'passed' as const,
        durationMs: 1000,
        passed: true,
        passedChecks: 1,
        failedChecks: 0,
        totalChecks: 1,
        expectationLines: [],
        negativeExpectationLines: [],
      },
      {
        id: 'SU-2',
        name: 'A timed-out test',
        specName: 'demo',
        status: 'timedout' as const,
        durationMs: 300000,
        passed: false,
        passedChecks: 0,
        failedChecks: 0,
        totalChecks: 0,
        expectationLines: [],
        negativeExpectationLines: [],
      },
    ];

    const report = generateReport(tmpDir, tests);
    const reportMd = fs.readFileSync(report.reportPath!, 'utf-8');

    expect(reportMd).toContain('## Timed Out');
    expect(reportMd).toContain('SU-2');
    expect(reportMd).toContain('A timed-out test');
  });

  it('does not emit a Timed Out section when no tests timed out', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-report-'));
    fs.mkdirSync(path.join(tmpDir, 'results'), { recursive: true });

    const minimalJson = {
      testId: 'SU-1',
      testName: 'A passing test',
      passed: true,
      expectations: [{ text: 'works', met: true }],
      negativeExpectations: [],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'demo.SU-1.results.md'),
      `\`\`\`json\n${JSON.stringify(minimalJson)}\n\`\`\`\n`
    );

    const tests = [
      {
        id: 'SU-1',
        name: 'A passing test',
        specName: 'demo',
        status: 'passed' as const,
        durationMs: 1000,
        passed: true,
        passedChecks: 1,
        failedChecks: 0,
        totalChecks: 1,
        expectationLines: [],
        negativeExpectationLines: [],
      },
    ];

    const report = generateReport(tmpDir, tests);
    const reportMd = fs.readFileSync(report.reportPath!, 'utf-8');

    expect(reportMd).not.toContain('## Timed Out');
  });
});
```

The test imports `fs`, `os`, `path` from `node:fs` / `node:os` / `node:path` — match the existing imports at the top of the file, do not duplicate.

- [ ] **Step 5.3: Run the test and confirm it fails**

```bash
npm test -- tests/core/reporter.spec.ts -t 'Timed Out'
```

Expected: fails because `generateReport` does not yet accept a `tests` argument and does not emit the section. Also fails to compile if you have not yet updated the signature.

- [ ] **Step 5.4: Update existing `generateReport` test call sites**

The existing `generateReport` tests in [tests/core/reporter.spec.ts](../../tests/core/reporter.spec.ts) call `generateReport(tmpDir)` (single argument). Update each call site to pass an empty array as the second argument:

```typescript
const report = generateReport(tmpDir, []);
```

Use `Grep` for `generateReport(tmpDir)` in the test file to find every site. There are about five.

- [ ] **Step 5.5: Update `generateReport` signature and emit the section**

Change the signature of `generateReport` at [src/core/reporter.ts:525](../../src/core/reporter.ts#L525):

```typescript
export function generateReport(
  runDir: string,
  tests: TestResult[]
): GenerateReportResult {
```

Add the import at the top of [src/core/reporter.ts](../../src/core/reporter.ts) (combine with the existing `RunResult` import):

```typescript
import type { RunResult, TestResult } from '../types/run.js';
```

Immediately before the final assembly that writes `report.md` (the block ending around lines 660-695), insert:

```typescript
const timedOutTests = tests.filter((t) => t.status === 'timedout');
if (timedOutTests.length > 0) {
  lines.push('');
  lines.push('## Timed Out');
  lines.push('');
  lines.push(
    "These tests did not finish within their wall-clock timeout. The transcripts are truncated and any grader verdict on them is inconclusive. Tune the spec's `runner.max-turns` or `timeout`, or tighten the prompt, before drawing conclusions about skill behavior."
  );
  lines.push('');
  for (const t of timedOutTests) {
    lines.push(`- **${t.id}** (${t.specName}) — ${t.name}`);
  }
  lines.push('');
}
```

The `lines` array is the variable that accumulates the report markdown. If the variable name differs in the current code (e.g., `mdLines`), use whatever the current code uses — locate it by reading the block immediately before the `fs.writeFileSync(reportPath, ...)` call.

- [ ] **Step 5.6: Update the call site in `test.ts`**

Search [src/cli/commands/test.ts](../../src/cli/commands/test.ts) for `generateReport(`:

```bash
grep -n "generateReport(" c:/Projects/skill-unit/src/cli/commands/test.ts
```

The call is currently `generateReport(runDir)`. The variable `testResults` is computed at [test.ts:344](../../src/cli/commands/test.ts) — but **`generateReport` is called before `testResults` is built**. Check the actual order in the current file.

If `generateReport` runs before `testResults`, you have two options:

**Option A (preferred):** Move `generateReport` to after the `testResults` map. The intermediate values `reportResult.grouped`, `reportResult.reportPath`, and `reportResult.terminalSummary` are read after this point only — verify by `Grep` for those names in `test.ts`. If they are not read between the current `generateReport` call site and the `testResults` map, just move the `generateReport` call down.

**Option B (fallback):** Compute a slim `TestResult[]`-shape array of just `{id, name, specName, status, ...}` before calling `generateReport`, using the same `tr.timedOut` logic as the full map. This duplicates a few lines but avoids the move.

Pick whichever option produces a smaller, cleaner diff. Pass `testResults` (or the slim array) as the second argument.

- [ ] **Step 5.7: Run typecheck, lint, and tests**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all exit 0.

- [ ] **Step 5.8: Commit**

```bash
git add src/core/reporter.ts src/cli/commands/test.ts tests/core/reporter.spec.ts
git commit -m "$(cat <<'EOF'
feat(reporter): Emit a Timed Out section in report.md

- generateReport now accepts a TestResult[] alongside the run directory
- When any test has status 'timedout', appends a ## Timed Out section listing the affected tests with an explanatory note
- Updated the test command call site and existing reporter tests to thread tests through
EOF
)"
```

---

## Post-implementation verification

- [ ] **Step P.1: Full local validation**

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

Expected: all four exit 0.

- [ ] **Step P.2: Smoke-test the binary end-to-end**

```bash
npm run build
npm run su -- ls
```

Expected: `ls` exits 0 and prints the discovered specs. This confirms the CLI still wires up cleanly after the refactor.

- [ ] **Step P.3: Optional — run a single fast skill test to confirm the system-prompt change does not break the runner contract**

```bash
npm run su -- test SU-1
```

(Costs API tokens. Skip if not necessary.) Expected: SU-1 still passes. The runner CLI invocation should include the new Turn Budget content in `--system-prompt`. If it fails, inspect the printed system prompt for syntax errors in the appended section.

- [ ] **Step P.4: Verify the STT-13 regression target**

Run the originally-failing case:

```bash
npm run su -- test STT-13
```

Expected: STT-13 either passes (the agent now concludes "no file I can edit fixes this missing dependency" and stops within budget), or it surfaces as TIMEOUT in the summary line (`... | 1 timed out | ...`) with exit code 2 — distinct from a behavioral fail. If neither, the system-prompt wording is too weak and needs another pass; capture the transcript and revise Task 1's Step 1.3 wording.

---

## Self-Review

Re-checked the plan against the spec at [docs/specs/2026-05-27-bounded-test-execution-design.md](../specs/2026-05-27-bounded-test-execution-design.md):

- **System-prompt turn budget** → Task 1. Covers signature change, content, and call-site threading.
- **`RunResult.timedOut` counter** → Task 2 adds the field and persistence; Task 3 populates it.
- **Counter computation in `test.ts`** → Task 3, Step 3.5.
- **`generateSummary` shows timed-out count** → Task 4.
- **`report.md` `## Timed Out` section** → Task 5.
- **Exit code 0/1/2 precedence** → Task 3 via `computeExitCode`.
- **`StatsIndex.runs[].timedOut`** → Task 2.
- **Non-goal: `TestStats.lastResult` extension** → Untouched, as the spec specifies.
- **Non-goal: lower `max-turns` / `timeout` defaults** → Untouched.

Method-name consistency: `computeExitCode`, `generateSummary`, `generateReport`, `buildSystemPrompt`, `recordRun`, `rebuildIndex` are all named consistently across tasks. The new field `timedOut` is spelled the same way everywhere (lowercase `timedOut`, matching the existing local variable in [runner.ts](../../src/core/runner.ts) and the `'timedout'` status enum value).

No placeholders. Every step contains the actual content.
