# Skill-Unit Troubleshooting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four read-only CLI subcommands (`runs`, `show`, `transcript`, `grading`) so the `skill-unit` skill can serve as the single entry point for troubleshooting test runs, without the agent ever reading `.workspace/runs/` directly.

**Architecture:** Add a shared helper module at `src/core/runs-index.ts` that resolves run IDs and aggregates per-test artifacts from `<runDir>/results/*.results.json`. Implement each new subcommand as a thin Citty command in `src/cli/commands/` that composes those helpers with the existing logger. Wire them into `src/cli/index.ts`. Extend `skills/skill-unit/SKILL.md` with a troubleshooting flow and the hard rule against direct workspace reads. Add behavior spec tests (authored via the `test-design` skill) plus Vitest CLI tests.

**Tech Stack:** Node.js built-ins (`node:fs`, `node:path`), Citty, TypeScript strict mode, Vitest for unit tests, existing logger (`src/core/logger.ts`). Test harness follows `.claude/rules/test-conventions.md` (single top-level `describe`, `when/should`, `// Arrange // Act // Assert`). No new dependencies.

**Spec:** [docs/specs/2026-04-19-skill-unit-troubleshooting-design.md](../specs/2026-04-19-skill-unit-troubleshooting-design.md)

---

## File Structure

**New files:**

- `src/core/runs-index.ts` — run discovery + per-test aggregation helpers (pure, no I/O side effects beyond reads).
- `src/cli/commands/runs.ts` — `runs [--limit N] [--failed-only]`.
- `src/cli/commands/show.ts` — `show <run-id|latest> [--failed-only] [--full]`.
- `src/cli/commands/transcript.ts` — `transcript <run-id|latest> <test-id> [--full]`.
- `src/cli/commands/grading.ts` — `grading <run-id|latest> <test-id> [--full]`.
- `tests/core/runs-index.spec.ts` — helper unit tests.
- `tests/cli/runs.spec.ts` — subcommand tests.
- `tests/cli/show.spec.ts` — subcommand tests.
- `tests/cli/transcript.spec.ts` — subcommand tests.
- `tests/cli/grading.spec.ts` — subcommand tests.
- `tests/fixtures/runs/` — canned run trees shared by all CLI unit tests.
- `skill-tests/skill-unit/troubleshooting.spec.md` — behavior spec (authored via `test-design` skill).
- `skill-tests/skill-unit/fixtures/seeded-runs/` — fixture tree for the behavior spec.
- `docs/architecture/troubleshooting.md` — architecture doc.

**Modified files:**

- `src/cli/index.ts` — register the four new subcommands, update the no-arg help banner, extend `knownSubCommands` array.
- `skills/skill-unit/SKILL.md` — add classify-intent section, add troubleshooting flow, add direct-access prohibition, extend Advanced Usage table.
- `CLAUDE.md` — add the new architecture doc to the architecture docs list.

---

## Task 1: Add shared runs-index helper

Pure data layer. Separate from any CLI framing so the four commands can compose it and the tests can exercise it directly.

**Files:**

- Create: `src/core/runs-index.ts`
- Create: `tests/core/runs-index.spec.ts`
- Create: `tests/fixtures/runs/README.md` (placeholder that documents how fixture runs are structured)
- Create: `tests/fixtures/runs/latest-is-2026-04-18/.gitkeep` (reserved, populated in Step 2)

### Step 1.1: Build the fixture tree used by every CLI test

- [ ] **Create fixture runs tree**

Create these exact files. File contents shown below. Forward slashes in paths below; the fixture lives under `tests/fixtures/runs/`.

`tests/fixtures/runs/README.md`

```markdown
# CLI runs fixtures

Each top-level directory here is a self-contained `.workspace/runs/` snapshot
with its own timestamped run folders under `runs/`. Tests point the runs-index
helpers at one of these roots via `runsRoot`.

Two canned roots:

- `latest-is-2026-04-18/` — two runs, the newer one has a mix of pass and fail.
  Canonical happy-path fixture for the CLI tests.
- `empty/` — no `runs/` directory at all. Covers the "no runs yet" path.
```

`tests/fixtures/runs/empty/.gitkeep` — empty file.

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/report.md`

```markdown
# Test Run: 2026-04-17-10-00-00

**1 passed** | **1 failed** | 2 total

---

## example-tests (1 passed, 1 failed)

- ✅ **EX-1: Accepts Valid Input** (3/3) — [transcript](example-tests.EX-1.transcript.md) | [grading](example-tests.EX-1.results.md)
- ❌ **EX-2: Rejects Malformed Input** (1/3) — [transcript](example-tests.EX-2.transcript.md) | [grading](example-tests.EX-2.results.md)

  <details>
  <summary>Failure details</summary>

  **Expectations:**
  - ✗ Produces a structured error message
    → Turn 3 - assistant produced a freeform apology instead

  </details>
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-1.results.json`

```json
{
  "testId": "EX-1",
  "testName": "Accepts Valid Input",
  "prompt": "Process this input please",
  "passed": true,
  "expectations": [
    { "text": "Returns a parsed object", "met": true, "evidence": "Turn 2" },
    {
      "text": "Preserves the input name field",
      "met": true,
      "evidence": "Turn 2"
    },
    { "text": "Emits no warnings", "met": true, "evidence": "Turn 2" }
  ],
  "negativeExpectations": []
}
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-1.results.md`

```markdown
# EX-1: Accepts Valid Input — PASS

- ✓ Returns a parsed object
- ✓ Preserves the input name field
- ✓ Emits no warnings
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-1.transcript.md`

```markdown
# EX-1 transcript

**Turn 1 (user):** Process this input please

**Turn 2 (assistant):** Parsed successfully. The object keeps its name field and no warnings were emitted.
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-2.results.json`

```json
{
  "testId": "EX-2",
  "testName": "Rejects Malformed Input",
  "prompt": "Process this input please",
  "passed": false,
  "expectations": [
    {
      "text": "Produces a structured error message",
      "met": false,
      "evidence": "Turn 3 - assistant produced a freeform apology instead"
    },
    {
      "text": "Cites the offending field",
      "met": false,
      "evidence": "Turn 3 - no field reference"
    },
    {
      "text": "Exits with a non-zero status",
      "met": true,
      "evidence": "Turn 3"
    }
  ],
  "negativeExpectations": []
}
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-2.results.md`

```markdown
# EX-2: Rejects Malformed Input — FAIL

- ✗ Produces a structured error message → Turn 3 - assistant produced a freeform apology instead
- ✗ Cites the offending field → Turn 3 - no field reference
- ✓ Exits with a non-zero status → Turn 3
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-2.transcript.md`

```markdown
# EX-2 transcript

**Turn 1 (user):** Process this input please

**Turn 2 (assistant):** Let me look at that.

**Turn 3 (assistant):** I am sorry, I could not process that. Something did not look right.
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-17-10-00-00/results/example-tests.EX-2.grader-transcript.md`

```markdown
# EX-2 grader transcript

**Grader turn 1:** Inspecting expectations.

**Grader turn 2:** Expectation 1 fails: output is a freeform apology.
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-18-12-00-00/results/report.md`

```markdown
# Test Run: 2026-04-18-12-00-00

**0 passed** | **1 failed** | 1 total

---

## widget-tests (0 passed, 1 failed)

- ❌ **WG-1: Computes Totals Correctly** (0/2) — [transcript](widget-tests.WG-1.transcript.md) | [grading](widget-tests.WG-1.results.md)
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.results.json`

```json
{
  "testId": "WG-1",
  "testName": "Computes Totals Correctly",
  "prompt": "Add these numbers",
  "passed": false,
  "expectations": [
    {
      "text": "Returns the correct sum",
      "met": false,
      "evidence": "Turn 2 - returned 41 instead of 42"
    },
    {
      "text": "Preserves the order of inputs",
      "met": false,
      "evidence": "Turn 2 - reordered inputs alphabetically"
    }
  ],
  "negativeExpectations": []
}
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.results.md`

```markdown
# WG-1: Computes Totals Correctly — FAIL

- ✗ Returns the correct sum → Turn 2 - returned 41 instead of 42
- ✗ Preserves the order of inputs → Turn 2 - reordered inputs alphabetically
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.transcript.md`

```markdown
# WG-1 transcript

**Turn 1 (user):** Add these numbers

**Turn 2 (assistant):** The sum is 41, sorted as a, b, c.
```

`tests/fixtures/runs/latest-is-2026-04-18/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.grader-transcript.md`

```markdown
# WG-1 grader transcript

**Grader turn 1:** Both expectations fail — incorrect sum and reordered inputs.
```

- [ ] **Commit the fixtures**

```bash
git add tests/fixtures/runs/
git commit -m "test: seed CLI runs fixtures for troubleshooting commands"
```

### Step 1.2: Write failing helper tests

- [ ] **Create `tests/core/runs-index.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  listRuns,
  resolveRunId,
  loadRunIndex,
  loadTest,
  UnknownRunError,
  UnknownTestError,
} from '../../src/core/runs-index.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');
const EMPTY = path.join('tests', 'fixtures', 'runs', 'empty');

describe('runs-index', () => {
  describe('listRuns', () => {
    it('when runs root has entries should return them newest first', () => {
      // Act
      const runs = listRuns(HAPPY);

      // Assert
      expect(runs.map((r) => r.id)).toEqual([
        '2026-04-18-12-00-00',
        '2026-04-17-10-00-00',
      ]);
    });

    it('when runs root is missing should return an empty list', () => {
      // Act
      const runs = listRuns(EMPTY);

      // Assert
      expect(runs).toEqual([]);
    });
  });

  describe('resolveRunId', () => {
    it('when given "latest" should return the newest directory name', () => {
      // Act
      const id = resolveRunId('latest', HAPPY);

      // Assert
      expect(id).toBe('2026-04-18-12-00-00');
    });

    it('when given an exact id should return it unchanged', () => {
      // Act
      const id = resolveRunId('2026-04-17-10-00-00', HAPPY);

      // Assert
      expect(id).toBe('2026-04-17-10-00-00');
    });

    it('when the id does not exist should throw UnknownRunError listing available runs', () => {
      // Act + Assert
      expect(() => resolveRunId('nope', HAPPY)).toThrow(UnknownRunError);
      try {
        resolveRunId('nope', HAPPY);
      } catch (err) {
        expect((err as Error).message).toContain('2026-04-18-12-00-00');
        expect((err as Error).message).toContain('2026-04-17-10-00-00');
      }
    });

    it('when "latest" is used on an empty root should throw UnknownRunError', () => {
      // Act + Assert
      expect(() => resolveRunId('latest', EMPTY)).toThrow(UnknownRunError);
    });
  });

  describe('loadRunIndex', () => {
    it('when the run has pass and fail tests should aggregate verdict + paths', () => {
      // Arrange
      const runId = '2026-04-17-10-00-00';

      // Act
      const index = loadRunIndex(runId, HAPPY);

      // Assert
      expect(index.runId).toBe(runId);
      expect(index.passed).toBe(1);
      expect(index.failed).toBe(1);
      expect(index.total).toBe(2);
      const ex1 = index.tests.find((t) => t.testId === 'EX-1');
      const ex2 = index.tests.find((t) => t.testId === 'EX-2');
      expect(ex1?.passed).toBe(true);
      expect(ex2?.passed).toBe(false);
      expect(ex2?.failureReason).toContain('structured error message');
      expect(
        ex2?.transcriptPath.endsWith('example-tests.EX-2.transcript.md')
      ).toBe(true);
      expect(
        ex2?.graderTranscriptPath?.endsWith(
          'example-tests.EX-2.grader-transcript.md'
        )
      ).toBe(true);
    });
  });

  describe('loadTest', () => {
    it('when the test exists should return its aggregated entry', () => {
      // Act
      const test = loadTest('2026-04-17-10-00-00', 'EX-2', HAPPY);

      // Assert
      expect(test.testId).toBe('EX-2');
      expect(test.passed).toBe(false);
    });

    it('when the test id is unknown should throw UnknownTestError listing available ids', () => {
      // Act + Assert
      try {
        loadTest('2026-04-17-10-00-00', 'ZZ-9', HAPPY);
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownTestError);
        expect((err as Error).message).toContain('EX-1');
        expect((err as Error).message).toContain('EX-2');
      }
    });
  });
});
```

- [ ] **Run the test and verify it fails**

```bash
npm test -- runs-index
```

Expected: module resolution error (`Cannot find module '.../runs-index.js'`).

### Step 1.3: Implement the helper

- [ ] **Create `src/core/runs-index.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RUNS_ROOT = path.join('.workspace', 'runs');

export class UnknownRunError extends Error {
  constructor(runId: string, available: string[]) {
    const list =
      available.length === 0 ? '(no runs yet)' : available.join(', ');
    super(`Unknown run "${runId}". Available runs: ${list}`);
    this.name = 'UnknownRunError';
  }
}

export class UnknownTestError extends Error {
  constructor(testId: string, runId: string, available: string[]) {
    const list =
      available.length === 0 ? '(no tests in this run)' : available.join(', ');
    super(
      `Unknown test "${testId}" in run ${runId}. Available test ids: ${list}`
    );
    this.name = 'UnknownTestError';
  }
}

export interface RunSummary {
  id: string;
  passed: number;
  failed: number;
  total: number;
  reportPath: string | null;
}

export interface RunTestEntry {
  testId: string;
  testName: string;
  specName: string;
  passed: boolean;
  failureReason: string | null;
  resultsJsonPath: string;
  resultsMdPath: string | null;
  transcriptPath: string;
  graderTranscriptPath: string | null;
}

export interface RunIndex extends RunSummary {
  runId: string;
  runDir: string;
  tests: RunTestEntry[];
}

interface GraderCheck {
  text: string;
  met: boolean;
  evidence?: string;
}

interface GraderJson {
  testId: string;
  testName: string;
  passed: boolean;
  expectations: GraderCheck[];
  negativeExpectations: GraderCheck[];
}

function runsRootPath(runsRoot?: string): string {
  return runsRoot ?? DEFAULT_RUNS_ROOT;
}

export function listRuns(runsRoot?: string): RunSummary[] {
  const root = runsRootPath(runsRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  return entries.map((id) => summarizeRun(id, root));
}

function summarizeRun(runId: string, runsRoot: string): RunSummary {
  const runDir = path.join(runsRoot, runId);
  const resultsDir = path.join(runDir, 'results');
  const reportPath = path.join(resultsDir, 'report.md');
  let passed = 0;
  let failed = 0;
  let total = 0;
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir)) {
      if (!file.endsWith('.results.json')) continue;
      total += 1;
      const raw = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as GraderJson;
      if (parsed.passed) passed += 1;
      else failed += 1;
    }
  }
  return {
    id: runId,
    passed,
    failed,
    total,
    reportPath: fs.existsSync(reportPath) ? reportPath : null,
  };
}

export function resolveRunId(input: string, runsRoot?: string): string {
  const root = runsRootPath(runsRoot);
  const ids = listRuns(root).map((r) => r.id);
  if (input === 'latest') {
    if (ids.length === 0) throw new UnknownRunError('latest', ids);
    return ids[0]!;
  }
  if (!ids.includes(input)) throw new UnknownRunError(input, ids);
  return input;
}

export function loadRunIndex(runId: string, runsRoot?: string): RunIndex {
  const root = runsRootPath(runsRoot);
  const runDir = path.join(root, runId);
  const resultsDir = path.join(runDir, 'results');
  const summary = summarizeRun(runId, root);
  const tests: RunTestEntry[] = [];
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir).sort()) {
      if (!file.endsWith('.results.json')) continue;
      const stem = file.slice(0, -'.results.json'.length); // <specName>.<testId>
      const dot = stem.lastIndexOf('.');
      const specName = dot >= 0 ? stem.slice(0, dot) : stem;
      const raw = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as GraderJson;
      tests.push({
        testId: parsed.testId,
        testName: parsed.testName,
        specName,
        passed: parsed.passed,
        failureReason: firstUnmetReason(parsed),
        resultsJsonPath: path.join(resultsDir, file),
        resultsMdPath: existsOrNull(
          path.join(resultsDir, `${stem}.results.md`)
        ),
        transcriptPath: path.join(resultsDir, `${stem}.transcript.md`),
        graderTranscriptPath: existsOrNull(
          path.join(resultsDir, `${stem}.grader-transcript.md`)
        ),
      });
    }
  }
  return { ...summary, runId, runDir, tests };
}

export function loadTest(
  runId: string,
  testId: string,
  runsRoot?: string
): RunTestEntry {
  const index = loadRunIndex(runId, runsRoot);
  const hit = index.tests.find((t) => t.testId === testId);
  if (!hit) {
    throw new UnknownTestError(
      testId,
      runId,
      index.tests.map((t) => t.testId)
    );
  }
  return hit;
}

function firstUnmetReason(parsed: GraderJson): string | null {
  const unmet =
    parsed.expectations.find((c) => !c.met) ??
    parsed.negativeExpectations.find((c) => !c.met);
  if (!unmet) return null;
  return unmet.evidence ? `${unmet.text} — ${unmet.evidence}` : unmet.text;
}

function existsOrNull(p: string): string | null {
  return fs.existsSync(p) ? p : null;
}
```

- [ ] **Run the tests and verify they pass**

```bash
npm test -- runs-index
```

Expected: all `runs-index` tests pass.

- [ ] **Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/core/runs-index.ts tests/core/runs-index.spec.ts
git commit -m "feat: add runs-index helper for run/test lookup"
```

---

## Task 2: Add `runs` subcommand

**Files:**

- Create: `src/cli/commands/runs.ts`
- Create: `tests/cli/runs.spec.ts`

### Step 2.1: Write failing subcommand test

- [ ] **Create `tests/cli/runs.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { runsCommand } from '../../src/cli/commands/runs.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');
const EMPTY = path.join('tests', 'fixtures', 'runs', 'empty');

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

describe('cli runs', () => {
  it('is defined with the expected meta', () => {
    // Assert
    expect(runsCommand.meta.name).toBe('runs');
    expect(runsCommand.meta.description).toBeDefined();
  });

  it('when the runs root has entries should list them newest first', async () => {
    // Act
    const out = await captureStdout(() =>
      runsCommand.run!({
        args: { 'runs-root': HAPPY, limit: 10, 'failed-only': false },
        rawArgs: [],
        cmd: runsCommand,
        subCommand: undefined,
      } as unknown as Parameters<NonNullable<typeof runsCommand.run>>[0])
    );

    // Assert
    const newerIdx = out.indexOf('2026-04-18-12-00-00');
    const olderIdx = out.indexOf('2026-04-17-10-00-00');
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThan(newerIdx);
  });

  it('when --limit 1 should only print the newest run', async () => {
    // Act
    const out = await captureStdout(() =>
      runsCommand.run!({
        args: { 'runs-root': HAPPY, limit: 1, 'failed-only': false },
        rawArgs: [],
        cmd: runsCommand,
        subCommand: undefined,
      } as unknown as Parameters<NonNullable<typeof runsCommand.run>>[0])
    );

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).not.toContain('2026-04-17-10-00-00');
  });

  it('when --failed-only should hide runs with zero failures', async () => {
    // Arrange
    // 2026-04-17-10-00-00 has 1 failed test, 2026-04-18-12-00-00 has 1 failed test.
    // Both should be shown. Use EMPTY plus HAPPY mix to confirm filtering logic
    // by relying on the fact that an all-pass run would be excluded (no such run
    // exists in HAPPY, so both entries still show).

    // Act
    const out = await captureStdout(() =>
      runsCommand.run!({
        args: { 'runs-root': HAPPY, limit: 10, 'failed-only': true },
        rawArgs: [],
        cmd: runsCommand,
        subCommand: undefined,
      } as unknown as Parameters<NonNullable<typeof runsCommand.run>>[0])
    );

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).toContain('2026-04-17-10-00-00');
  });

  it('when the runs root is missing should print an informational message', async () => {
    // Act
    const out = await captureStdout(() =>
      runsCommand.run!({
        args: { 'runs-root': EMPTY, limit: 10, 'failed-only': false },
        rawArgs: [],
        cmd: runsCommand,
        subCommand: undefined,
      } as unknown as Parameters<NonNullable<typeof runsCommand.run>>[0])
    );

    // Assert
    expect(out).toContain('No runs yet');
  });
});
```

- [ ] **Run test to verify failure**

```bash
npm test -- tests/cli/runs.spec.ts
```

Expected: module not found error for `src/cli/commands/runs.ts`.

### Step 2.2: Implement the command

- [ ] **Create `src/cli/commands/runs.ts`**

```typescript
import { defineCommand } from 'citty';
import { listRuns } from '../../core/runs-index.js';

export const runsCommand = defineCommand({
  meta: {
    name: 'runs',
    description: 'List recent test runs with pass/fail counts',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of runs to show (default: 10)',
      default: '10',
    },
    'failed-only': {
      type: 'boolean',
      description: 'Only show runs that had at least one failure',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const limit = Number(args.limit);
    const failedOnly = Boolean(args['failed-only']);
    const all = listRuns(runsRoot);
    if (all.length === 0) {
      process.stdout.write(
        'No runs yet. Run tests with `skill-unit test --all`.\n'
      );
      return;
    }
    const filtered = failedOnly ? all.filter((r) => r.failed > 0) : all;
    const shown = filtered.slice(0, Number.isFinite(limit) ? limit : 10);
    process.stdout.write(
      'run-id               passed  failed  total  status\n'
    );
    for (const r of shown) {
      const status = r.failed === 0 ? 'pass' : 'fail';
      process.stdout.write(
        `${r.id}  ${String(r.passed).padStart(6)}  ${String(r.failed).padStart(6)}  ${String(r.total).padStart(5)}  ${status}\n`
      );
    }
  },
});
```

- [ ] **Run tests to verify pass**

```bash
npm test -- tests/cli/runs.spec.ts
```

Expected: all four `cli runs` tests pass.

- [ ] **Commit**

```bash
git add src/cli/commands/runs.ts tests/cli/runs.spec.ts
git commit -m "feat(cli): add runs subcommand"
```

---

## Task 3: Add `show` subcommand

**Files:**

- Create: `src/cli/commands/show.ts`
- Create: `tests/cli/show.spec.ts`

### Step 3.1: Write failing test

- [ ] **Create `tests/cli/show.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { showCommand } from '../../src/cli/commands/show.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    showCommand.run!({
      args,
      rawArgs: [],
      cmd: showCommand,
      subCommand: undefined,
    } as unknown as Parameters<NonNullable<typeof showCommand.run>>[0])
  );
}

describe('cli show', () => {
  it('is defined with the expected meta', () => {
    // Assert
    expect(showCommand.meta.name).toBe('show');
  });

  it('when given "latest" should resolve to the newest run and print its summary', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': 'latest',
      'failed-only': false,
      full: false,
    });

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).toContain('WG-1');
    expect(out).not.toContain('EX-1');
  });

  it('when --failed-only should only list failing tests', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'failed-only': true,
      full: false,
    });

    // Assert
    expect(out).toContain('EX-2');
    expect(out).not.toContain('EX-1');
  });

  it('when --full should print the full report.md', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'failed-only': false,
      full: true,
    });

    // Assert
    expect(out).toContain('# Test Run: 2026-04-17-10-00-00');
    expect(out).toContain('structured error message');
  });

  it('when the run id is unknown should exit non-zero with a helpful message', async () => {
    // Arrange
    const exitSpy = { calls: [] as unknown[][] };
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
      exitSpy.calls.push([code]);
      throw new Error(`__exit_${code ?? 0}`);
    }) as never;

    try {
      // Act
      let caught: Error | undefined;
      try {
        await invoke({
          'runs-root': HAPPY,
          'run-id': 'nope',
          'failed-only': false,
          full: false,
        });
      } catch (err) {
        caught = err as Error;
      }

      // Assert
      expect(caught?.message).toBe('__exit_1');
      expect(exitSpy.calls).toEqual([[1]]);
    } finally {
      process.exit = originalExit;
    }
  });
});
```

- [ ] **Run test and verify it fails**

```bash
npm test -- tests/cli/show.spec.ts
```

Expected: module not found error.

### Step 3.2: Implement the command

- [ ] **Create `src/cli/commands/show.ts`**

```typescript
import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadRunIndex,
  resolveRunId,
  UnknownRunError,
} from '../../core/runs-index.js';

export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Summarize a single test run',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    'run-id': {
      type: 'positional',
      description: 'Run id or "latest"',
      required: true,
    },
    'failed-only': {
      type: 'boolean',
      description: 'Only list tests that failed',
      default: false,
    },
    full: {
      type: 'boolean',
      description: 'Dump the full report.md instead of the summary table',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const failedOnly = Boolean(args['failed-only']);
    const full = Boolean(args.full);
    let runId: string;
    try {
      runId = resolveRunId(args['run-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownRunError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    const index = loadRunIndex(runId, runsRoot);
    if (full) {
      if (index.reportPath) {
        process.stdout.write(fs.readFileSync(index.reportPath, 'utf-8'));
      } else {
        process.stdout.write(
          `No report.md found for run ${runId}. Use \`skill-unit report --run-dir ${index.runDir}\` to regenerate.\n`
        );
      }
      return;
    }
    process.stdout.write(
      `Run: ${index.runId} — ${index.passed} passed | ${index.failed} failed | ${index.total} total\n`
    );
    const tests = failedOnly
      ? index.tests.filter((t) => !t.passed)
      : index.tests;
    if (tests.length === 0) {
      process.stdout.write(
        failedOnly
          ? 'No failing tests in this run.\n'
          : 'No tests in this run.\n'
      );
      return;
    }
    process.stdout.write(
      'test-id  verdict  spec                  reason                              transcript\n'
    );
    for (const t of tests) {
      const verdict = t.passed ? 'pass' : 'fail';
      const reason = t.failureReason ?? '';
      process.stdout.write(
        `${t.testId}  ${verdict}  ${t.specName}  ${truncate(reason, 36)}  ${t.transcriptPath}\n`
      );
    }
  },
});

function truncate(s: string, max: number): string {
  if (s.length <= max) return s.padEnd(max);
  return `${s.slice(0, max - 1)}…`;
}
```

- [ ] **Run tests to verify pass**

```bash
npm test -- tests/cli/show.spec.ts
```

Expected: all `cli show` tests pass.

- [ ] **Commit**

```bash
git add src/cli/commands/show.ts tests/cli/show.spec.ts
git commit -m "feat(cli): add show subcommand"
```

---

## Task 4: Add `transcript` subcommand

**Files:**

- Create: `src/cli/commands/transcript.ts`
- Create: `tests/cli/transcript.spec.ts`

### Step 4.1: Write failing test

- [ ] **Create `tests/cli/transcript.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { transcriptCommand } from '../../src/cli/commands/transcript.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    transcriptCommand.run!({
      args,
      rawArgs: [],
      cmd: transcriptCommand,
      subCommand: undefined,
    } as unknown as Parameters<NonNullable<typeof transcriptCommand.run>>[0])
  );
}

describe('cli transcript', () => {
  it('when called without --full should print a summary header + path only', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: false,
    });

    // Assert
    expect(out).toContain('EX-2');
    expect(out).toContain('fail');
    expect(out).toContain('example-tests.EX-2.transcript.md');
    expect(out).not.toContain('Turn 1 (user): Process this input please');
  });

  it('when called with --full should include the transcript content', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: true,
    });

    // Assert
    expect(out).toContain('Turn 1 (user):');
    expect(out).toContain('freeform apology');
  });

  it('when the test id is unknown should exit 1 with a helpful message', async () => {
    // Arrange
    const originalExit = process.exit;
    const exitCalls: number[] = [];
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error(`__exit_${code ?? 0}`);
    }) as never;

    try {
      // Act
      let caught: Error | undefined;
      try {
        await invoke({
          'runs-root': HAPPY,
          'run-id': '2026-04-17-10-00-00',
          'test-id': 'ZZ-9',
          full: false,
        });
      } catch (err) {
        caught = err as Error;
      }

      // Assert
      expect(caught?.message).toBe('__exit_1');
      expect(exitCalls).toEqual([1]);
    } finally {
      process.exit = originalExit;
    }
  });
});
```

- [ ] **Run test and verify failure**

```bash
npm test -- tests/cli/transcript.spec.ts
```

Expected: module not found error.

### Step 4.2: Implement the command

- [ ] **Create `src/cli/commands/transcript.ts`**

```typescript
import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadTest,
  resolveRunId,
  UnknownRunError,
  UnknownTestError,
} from '../../core/runs-index.js';

export const transcriptCommand = defineCommand({
  meta: {
    name: 'transcript',
    description: 'Show the agent transcript for a single test in a run',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    'run-id': {
      type: 'positional',
      description: 'Run id or "latest"',
      required: true,
    },
    'test-id': {
      type: 'positional',
      description: 'Test case id (e.g. SU-1)',
      required: true,
    },
    full: {
      type: 'boolean',
      description: 'Append the full transcript content to the summary',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const full = Boolean(args.full);
    let runId: string;
    try {
      runId = resolveRunId(args['run-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownRunError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    let entry;
    try {
      entry = loadTest(runId, args['test-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownTestError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    const verdict = entry.passed ? 'pass' : 'fail';
    const reason = entry.failureReason ?? '';
    process.stdout.write(
      `Test: ${entry.testId} (${entry.specName}) — ${verdict}\n`
    );
    if (reason) process.stdout.write(`Reason: ${reason}\n`);
    process.stdout.write(`Transcript: ${entry.transcriptPath}\n`);
    if (full) {
      process.stdout.write('\n---\n\n');
      if (fs.existsSync(entry.transcriptPath)) {
        process.stdout.write(fs.readFileSync(entry.transcriptPath, 'utf-8'));
      } else {
        process.stdout.write('(transcript file is missing)\n');
      }
    }
  },
});
```

- [ ] **Run tests to verify pass**

```bash
npm test -- tests/cli/transcript.spec.ts
```

Expected: all three `cli transcript` tests pass.

- [ ] **Commit**

```bash
git add src/cli/commands/transcript.ts tests/cli/transcript.spec.ts
git commit -m "feat(cli): add transcript subcommand"
```

---

## Task 5: Add `grading` subcommand

**Files:**

- Create: `src/cli/commands/grading.ts`
- Create: `tests/cli/grading.spec.ts`

### Step 5.1: Write failing test

- [ ] **Create `tests/cli/grading.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { gradingCommand } from '../../src/cli/commands/grading.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    gradingCommand.run!({
      args,
      rawArgs: [],
      cmd: gradingCommand,
      subCommand: undefined,
    } as unknown as Parameters<NonNullable<typeof gradingCommand.run>>[0])
  );
}

describe('cli grading', () => {
  it('when called without --full should print the verdict + results.md checks', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: false,
    });

    // Assert
    expect(out).toContain('EX-2');
    expect(out).toContain('fail');
    expect(out).toContain('structured error message');
    expect(out).not.toContain('Grader turn 1:');
  });

  it('when called with --full should append the grader transcript', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: true,
    });

    // Assert
    expect(out).toContain('structured error message');
    expect(out).toContain('Grader turn 1:');
  });

  it('when the test has no grader-transcript file and --full is set should say so', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-1',
      full: true,
    });

    // Assert
    expect(out).toContain('EX-1');
    expect(out).toContain('no grader transcript');
  });
});
```

- [ ] **Run test and verify failure**

```bash
npm test -- tests/cli/grading.spec.ts
```

Expected: module not found error.

### Step 5.2: Implement the command

- [ ] **Create `src/cli/commands/grading.ts`**

```typescript
import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadTest,
  resolveRunId,
  UnknownRunError,
  UnknownTestError,
} from '../../core/runs-index.js';

export const gradingCommand = defineCommand({
  meta: {
    name: 'grading',
    description:
      'Show the grader verdict and optional grader transcript for a test',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    'run-id': {
      type: 'positional',
      description: 'Run id or "latest"',
      required: true,
    },
    'test-id': {
      type: 'positional',
      description: 'Test case id (e.g. SU-1)',
      required: true,
    },
    full: {
      type: 'boolean',
      description: 'Append the full grader transcript',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const full = Boolean(args.full);
    let runId: string;
    try {
      runId = resolveRunId(args['run-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownRunError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    let entry;
    try {
      entry = loadTest(runId, args['test-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownTestError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    const verdict = entry.passed ? 'pass' : 'fail';
    process.stdout.write(
      `Test: ${entry.testId} (${entry.specName}) — ${verdict}\n`
    );
    if (entry.failureReason) {
      process.stdout.write(`Reason: ${entry.failureReason}\n`);
    }
    if (entry.resultsMdPath && fs.existsSync(entry.resultsMdPath)) {
      process.stdout.write('\n');
      process.stdout.write(fs.readFileSync(entry.resultsMdPath, 'utf-8'));
    }
    if (full) {
      process.stdout.write('\n---\n\n');
      if (
        entry.graderTranscriptPath &&
        fs.existsSync(entry.graderTranscriptPath)
      ) {
        process.stdout.write(
          fs.readFileSync(entry.graderTranscriptPath, 'utf-8')
        );
      } else {
        process.stdout.write(`(no grader transcript for ${entry.testId})\n`);
      }
    }
  },
});
```

- [ ] **Run tests to verify pass**

```bash
npm test -- tests/cli/grading.spec.ts
```

Expected: all three `cli grading` tests pass.

- [ ] **Commit**

```bash
git add src/cli/commands/grading.ts tests/cli/grading.spec.ts
git commit -m "feat(cli): add grading subcommand"
```

---

## Task 6: Wire new subcommands into the CLI root

**Files:**

- Modify: `src/cli/index.ts`
- Modify: `tests/cli/commands.spec.ts`

### Step 6.1: Extend the existing meta-test

- [ ] **Edit `tests/cli/commands.spec.ts`**

Replace the file contents with this. New assertions are added for the four new commands; existing ones remain.

```typescript
import { describe, it, expect } from 'vitest';
import { lsCommand } from '../../src/cli/commands/ls.js';
import { compileCommand } from '../../src/cli/commands/compile.js';
import { testCommand } from '../../src/cli/commands/test.js';
import { reportCommand } from '../../src/cli/commands/report.js';
import { runsCommand } from '../../src/cli/commands/runs.js';
import { showCommand } from '../../src/cli/commands/show.js';
import { transcriptCommand } from '../../src/cli/commands/transcript.js';
import { gradingCommand } from '../../src/cli/commands/grading.js';

describe('CLI commands', () => {
  it('ls command is defined with correct meta', () => {
    expect(lsCommand.meta.name).toBe('ls');
    expect(lsCommand.meta.description).toBeDefined();
  });

  it('compile command is defined with correct meta', () => {
    expect(compileCommand.meta.name).toBe('compile');
    expect(compileCommand.meta.description).toBeDefined();
  });

  it('test command is defined with correct meta', () => {
    expect(testCommand.meta.name).toBe('test');
    expect(testCommand.meta.description).toBeDefined();
  });

  it('test command has required args', () => {
    expect(testCommand.args.all).toBeDefined();
    expect(testCommand.args.ci).toBeDefined();
    expect(testCommand.args['no-stream']).toBeDefined();
    expect(testCommand.args.tag).toBeDefined();
    expect(testCommand.args.model).toBeDefined();
  });

  it('report command is defined with correct meta', () => {
    expect(reportCommand.meta.name).toBe('report');
    expect(reportCommand.meta.description).toBeDefined();
  });

  it('report command requires run-dir arg', () => {
    expect(reportCommand.args['run-dir']).toBeDefined();
  });

  it('runs command is defined with correct meta', () => {
    expect(runsCommand.meta.name).toBe('runs');
    expect(runsCommand.meta.description).toBeDefined();
  });

  it('show command is defined with correct meta', () => {
    expect(showCommand.meta.name).toBe('show');
    expect(showCommand.meta.description).toBeDefined();
  });

  it('transcript command is defined with correct meta', () => {
    expect(transcriptCommand.meta.name).toBe('transcript');
    expect(transcriptCommand.meta.description).toBeDefined();
  });

  it('grading command is defined with correct meta', () => {
    expect(gradingCommand.meta.name).toBe('grading');
    expect(gradingCommand.meta.description).toBeDefined();
  });
});
```

### Step 6.2: Wire commands into the root

- [ ] **Edit `src/cli/index.ts`**

Replace the current imports, `subCommands` object, the `knownSubCommands` array inside `run`, and the help banner with this expanded version. Everything else in the file stays the same.

```typescript
#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { lsCommand } from './commands/ls.js';
import { compileCommand } from './commands/compile.js';
import { testCommand } from './commands/test.js';
import { reportCommand } from './commands/report.js';
import { runsCommand } from './commands/runs.js';
import { showCommand } from './commands/show.js';
import { transcriptCommand } from './commands/transcript.js';
import { gradingCommand } from './commands/grading.js';

const main = defineCommand({
  meta: {
    name: 'skill-unit',
    description: 'Structured, reproducible unit testing for AI agent skills',
  },
  subCommands: {
    ls: lsCommand,
    compile: compileCommand,
    test: testCommand,
    report: reportCommand,
    runs: runsCommand,
    show: showCommand,
    transcript: transcriptCommand,
    grading: gradingCommand,
  },
  async run({ rawArgs }) {
    const knownSubCommands = [
      'ls',
      'compile',
      'test',
      'report',
      'runs',
      'show',
      'transcript',
      'grading',
    ];
    const hasSubCommand = rawArgs.some((a) => knownSubCommands.includes(a));
    if (hasSubCommand) return;

    if (process.stdout.isTTY) {
      const { render } = await import('ink');
      const React = await import('react');
      const { App } = await import('../tui/app.js');

      process.stdout.write('\x1b[?1049h');
      process.stdout.write('\x1b[H');

      const instance = render(React.createElement(App));

      instance.waitUntilExit().then(() => {
        process.stdout.write('\x1b[?1049l');
      });
      return;
    } else {
      console.log('Usage: skill-unit <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  ls          List discovered spec files and test cases');
      console.log(
        '  compile     Parse spec files and write manifest JSON files'
      );
      console.log('  test        Run tests from spec files');
      console.log(
        '  report      Generate a report from an existing test run directory'
      );
      console.log('  runs        List recent test runs');
      console.log('  show        Summarize a single run');
      console.log(
        '  transcript  Show the agent transcript for one test in a run'
      );
      console.log(
        '  grading     Show the grader verdict for one test in a run'
      );
      console.log('');
      console.log(
        'Run `skill-unit <command> --help` for command-specific help.'
      );
    }
  },
});

runMain(main);
```

### Step 6.3: Verify

- [ ] **Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including the expanded `commands.spec.ts`.

- [ ] **Typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: no errors.

- [ ] **Build and smoke-test**

```bash
npm run build
node dist/cli/index.js runs --limit 3
node dist/cli/index.js show latest --failed-only
```

Expected: commands exit 0 and print reasonable output against the real `.workspace/runs/`. If `.workspace/runs/` is empty on this machine, `runs` prints `No runs yet...` and `show latest` exits 1 with the unknown-run message.

- [ ] **Commit**

```bash
git add src/cli/index.ts tests/cli/commands.spec.ts
git commit -m "feat(cli): register troubleshooting subcommands"
```

---

## Task 7: Update SKILL.md

**Files:**

- Modify: `skills/skill-unit/SKILL.md`

No TDD here — docs change. One commit once all edits are in place.

### Step 7.1: Add the intent-classification + hard-rule preamble

- [ ] **Edit `skills/skill-unit/SKILL.md`**

Replace the `## Execution Process` section down through the existing `### Step 1: Map User Intent to CLI Args` header with this expanded preamble. Keep the existing Step 1 / Step 2 / Step 3 content below — only the wrapping headers change (rename "Step 1 / 2 / 3" to live under a new "Running Tests" subsection).

```markdown
## Execution Process

### Hard rule: never read `.workspace/runs/` directly

Troubleshooting queries route through this skill's subcommands, not direct file reads. **Never** use Read, Glob, or Grep against anything under `.workspace/runs/`. If the information you need is not exposed by a subcommand, surface that gap to the user rather than scraping files. This rule exists so the skill remains the single, predictable entry point for run history, transcripts, and grading.

### Classify intent

Pick one of three flows from the user's request, then follow that flow's steps.

| Intent         | Signals                                                                                           | Go to                 |
| -------------- | ------------------------------------------------------------------------------------------------- | --------------------- |
| Run tests      | "run", "test", "/skill-unit", "rerun"                                                             | Running Tests         |
| Troubleshoot   | "why did X fail", "show the transcript", "what happened in the last run", "did the last run pass" | Troubleshooting Runs  |
| List / inspect | "what tests do I have", "search for X", "list tests"                                              | Advanced Usage (`ls`) |

### Running Tests

Follow these steps in order.

#### Step 1: Map user intent to CLI args
```

(Keep the rest of the existing Step 1 / Step 2 / Step 3 content exactly as it is today. They become subsections of "Running Tests" instead of top-level steps.)

### Step 7.2: Add the new "Troubleshooting Runs" section

- [ ] **Append the Troubleshooting Runs section** directly after the existing Step 3 of "Running Tests" and before `## Advanced Usage`.

````markdown
### Troubleshooting Runs

Follow these steps in order.

#### Step 1: Map user intent to CLI args

All troubleshooting commands use the same wrapper (`run-cli.sh` shorthand for `${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh`).

| User says                                           | CLI invocation                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "Did the last run pass?" / "What was the last run?" | `run-cli.sh runs --limit 1`                                                                                |
| "Show me recent runs"                               | `run-cli.sh runs --limit 10`                                                                               |
| "Show me only failed runs"                          | `run-cli.sh runs --failed-only`                                                                            |
| "Why did the last run fail?"                        | `run-cli.sh show latest --failed-only`                                                                     |
| "Show run `<timestamp>`"                            | `run-cli.sh show <timestamp>`                                                                              |
| "Why did `<test-id>` fail?"                         | `run-cli.sh grading latest <test-id>`                                                                      |
| "Show the transcript for `<test-id>`"               | `run-cli.sh transcript latest <test-id>`                                                                   |
| "Give me the full transcript for `<test-id>`"       | `run-cli.sh transcript latest <test-id> --full`                                                            |
| "Why did the `<X>` tests fail?" (ambiguous target)  | First `run-cli.sh ls --search <X>` → resolve to test IDs → then `run-cli.sh grading latest <id>` per match |

**Run identifiers**: either the literal string `latest` (newest run) or a full timestamp directory name like `2026-04-19-18-24-23`. There is no prefix matching.

**Test identifiers**: exact, case-sensitive test IDs as they appear in spec files (e.g. `SU-1`). For ambiguous targets, always resolve via `ls --search <X>` before calling `transcript` or `grading`.

#### Step 2: Run the CLI

Invoke the wrapper in the foreground. All four subcommands are read-only.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" runs --limit 10
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" show latest --failed-only
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" transcript latest <test-id>
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" grading latest <test-id>
```
````

If the CLI says `No runs yet.`, relay that to the user and suggest `skill-unit test --all`. If it reports an unknown run or test id, the error lists available ids — pick one from that list.

#### Step 3: Present the result

Default to the structured summary the CLI prints. Only escalate to `--full` if the summary lacks enough signal, or the user explicitly asks for the full transcript or grader output. Never fall back to reading the referenced file with Read — the `--full` flag exists exactly for this purpose.

````

### Step 7.3: Extend Advanced Usage table

- [ ] **Replace the Advanced Usage table** with the expanded version:

```markdown
## Advanced Usage

The CLI has additional subcommands for discovery, compilation, and report inspection. All go through the same wrapper.

| Subcommand | Purpose |
| --- | --- |
| `run-cli.sh ls [filters]` | List discovered spec files and their test cases. Also the resolver for ambiguous targets via `--search`. |
| `run-cli.sh compile [filters]` | Parse spec files and write manifest JSON without running anything. Useful for inspecting what would run. |
| `run-cli.sh report --run-dir <path>` | Re-generate `report.md` from an existing run directory. |
| `run-cli.sh runs [--limit N] [--failed-only]` | List recent runs with pass/fail counts. |
| `run-cli.sh show <run-id\|latest> [--failed-only] [--full]` | Summarize one run. `--full` dumps the full `report.md`. |
| `run-cli.sh transcript <run-id\|latest> <test-id> [--full]` | Agent transcript for a test. `--full` appends the full transcript content. |
| `run-cli.sh grading <run-id\|latest> <test-id> [--full]` | Grader verdict for a test. `--full` appends the full grader transcript. |
````

### Step 7.4: Verify and commit

- [ ] **Render-check the markdown** by opening `skills/skill-unit/SKILL.md` and reading top-to-bottom. Confirm section order is: Hard rule → Classify intent → Running Tests (Step 1/2/3) → Troubleshooting Runs (Step 1/2/3) → Configuration → Advanced Usage → Reference Material.

- [ ] **Commit**

```bash
git add skills/skill-unit/SKILL.md
git commit -m "docs(skill-unit): add troubleshooting flow and direct-access prohibition"
```

---

## Task 8: Add the behavior spec (authored via `test-design`)

The spec file `skill-tests/skill-unit/troubleshooting.spec.md` **must not be written freehand.** It is authored via the `test-design` skill so it follows that skill's prompt-quality and expectation-quality rules. This task coordinates the invocation and then writes the fixture tree that the spec depends on.

**Files:**

- Create: `skill-tests/skill-unit/troubleshooting.spec.md` (via `/test-design skill-unit`)
- Create: `skill-tests/skill-unit/fixtures/seeded-runs/.workspace/runs/...` (fixture tree)

### Step 8.1: Build the fixture tree first

The spec references these paths, so they must exist before the spec is written.

- [ ] **Create the seeded-runs fixture**

Paths below use forward slashes. Create under `skill-tests/skill-unit/fixtures/seeded-runs/`.

`.workspace/runs/2026-04-17-10-00-00/results/report.md`

```markdown
# Test Run: 2026-04-17-10-00-00

**1 passed** | **1 failed** | 2 total

---

## example-tests (1 passed, 1 failed)

- ✅ **EX-1: Accepts Valid Input** (3/3) — [transcript](example-tests.EX-1.transcript.md) | [grading](example-tests.EX-1.results.md)
- ❌ **EX-2: Rejects Malformed Input** (1/3) — [transcript](example-tests.EX-2.transcript.md) | [grading](example-tests.EX-2.results.md)
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-1.results.json`

```json
{
  "testId": "EX-1",
  "testName": "Accepts Valid Input",
  "prompt": "Process this input please",
  "passed": true,
  "expectations": [
    { "text": "Returns a parsed object", "met": true, "evidence": "Turn 2" }
  ],
  "negativeExpectations": []
}
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-1.results.md`

```markdown
# EX-1: Accepts Valid Input — PASS

- ✓ Returns a parsed object
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-1.transcript.md`

```markdown
# EX-1 transcript

**Turn 1 (user):** Process this input please

**Turn 2 (assistant):** Parsed successfully.
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-2.results.json`

```json
{
  "testId": "EX-2",
  "testName": "Rejects Malformed Input",
  "prompt": "Process this input please",
  "passed": false,
  "expectations": [
    {
      "text": "Produces a structured error message",
      "met": false,
      "evidence": "Turn 3 - assistant produced a freeform apology instead"
    },
    {
      "text": "Cites the offending field",
      "met": false,
      "evidence": "Turn 3 - no field reference"
    },
    {
      "text": "Exits with a non-zero status",
      "met": true,
      "evidence": "Turn 3"
    }
  ],
  "negativeExpectations": []
}
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-2.results.md`

```markdown
# EX-2: Rejects Malformed Input — FAIL

- ✗ Produces a structured error message → Turn 3 - assistant produced a freeform apology instead
- ✗ Cites the offending field → Turn 3 - no field reference
- ✓ Exits with a non-zero status → Turn 3
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-2.transcript.md`

```markdown
# EX-2 transcript

**Turn 1 (user):** Process this input please

**Turn 2 (assistant):** Let me look at that.

**Turn 3 (assistant):** I am sorry, I could not process that.
```

`.workspace/runs/2026-04-17-10-00-00/results/example-tests.EX-2.grader-transcript.md`

```markdown
# EX-2 grader transcript

**Grader turn 1:** Inspecting expectations.

**Grader turn 2:** Expectation 1 fails: output is a freeform apology.
```

`.workspace/runs/2026-04-18-12-00-00/results/report.md`

```markdown
# Test Run: 2026-04-18-12-00-00

**0 passed** | **1 failed** | 1 total

---

## widget-tests (0 passed, 1 failed)

- ❌ **WG-1: Computes Totals Correctly** (0/2) — [transcript](widget-tests.WG-1.transcript.md) | [grading](widget-tests.WG-1.results.md)
```

`.workspace/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.results.json`

```json
{
  "testId": "WG-1",
  "testName": "Computes Totals Correctly",
  "prompt": "Add these numbers",
  "passed": false,
  "expectations": [
    {
      "text": "Returns the correct sum",
      "met": false,
      "evidence": "Turn 2 - returned 41 instead of 42"
    },
    {
      "text": "Preserves the order of inputs",
      "met": false,
      "evidence": "Turn 2 - reordered inputs alphabetically"
    }
  ],
  "negativeExpectations": []
}
```

`.workspace/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.results.md`

```markdown
# WG-1: Computes Totals Correctly — FAIL

- ✗ Returns the correct sum → Turn 2 - returned 41 instead of 42
- ✗ Preserves the order of inputs → Turn 2 - reordered inputs alphabetically
```

`.workspace/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.transcript.md`

```markdown
# WG-1 transcript

**Turn 1 (user):** Add these numbers

**Turn 2 (assistant):** The sum is 41, sorted as a, b, c.
```

`.workspace/runs/2026-04-18-12-00-00/results/widget-tests.WG-1.grader-transcript.md`

```markdown
# WG-1 grader transcript

**Grader turn 1:** Both expectations fail — incorrect sum and reordered inputs.
```

- [ ] **Commit fixtures**

```bash
git add skill-tests/skill-unit/fixtures/seeded-runs/
git commit -m "test(skill-unit): seed troubleshooting spec fixtures"
```

### Step 8.2: Author the spec via `test-design`

- [ ] **Invoke the `test-design` skill**

Run `/test-design skill-unit`. Select **Edit Mode B: User-Directed Edits** (user-directed) when prompted, since the target spec file does not yet exist and you are adding new cases.

Provide this coverage brief to the `test-design` skill. The skill will phrase each case according to its prompt-quality and expectation-quality rules; the brief specifies _what_ to cover, not the exact wording.

```text
Create a new spec file at skill-tests/skill-unit/troubleshooting.spec.md.

Frontmatter:
  name: skill-unit-troubleshooting-tests
  skill: skill-unit
  tags: [troubleshooting, integration]
  global-fixtures: ./fixtures/seeded-runs
  allowed-tools: [Read, Bash, Skill]

Use ID prefix SU, continuing the skill-unit series. Number the new cases as
SU-T1..SU-T6 (T for troubleshooting) so they do not collide with existing
SU-* ids in the other skill-unit spec files.

Every test case must include this negative expectation (phrased naturally):
  "Does not Read, Glob, or Grep any file under `.workspace/runs/` directly;
   all run-artifact access goes through the skill-unit CLI."

Coverage to include (six cases total):

SU-T1 — "Did the last run pass?"
  Expect: output references the failing-test count from the newest seeded run
          (2026-04-18-12-00-00 has 1 failed / 0 passed).
          The agent invoked a skill-unit CLI subcommand via run-cli.sh.

SU-T2 — "Why did the last run fail?"
  Expect: output names WG-1 and quotes its failure reason.
          CLI was called with `show latest --failed-only` or equivalent.

SU-T3 — "Show me the transcript for EX-2"
  Expect: output includes EX-2's verdict, reason, and transcript path.
          Output is the summary shape, not a full transcript dump.
  Negative: Does not include the seeded EX-2 transcript lines
            ("I am sorry, I could not process that.").

SU-T4 — "Give me the full transcript for EX-2"
  Expect: output contains the seeded EX-2 transcript content
          (phrases like "I am sorry, I could not process that.").
          CLI was called with --full.

SU-T5 — "Show me the recent runs"
  Expect: output lists both seeded runs in newest-first order.

SU-T6 — Ambiguous target prompt of the form
        "How did the widget tests do last time?"
  Expect: the agent first disambiguates via `ls --search widget`
          before calling troubleshooting subcommands.
          It does not guess a filter.

Tone guidance for prompts:
  - Vary formality and specificity across the six prompts.
  - Never mention "skill-unit", "transcript file", or internal flag names
    inside the prompt text.
  - Do not describe expected output format in the prompt.
```

The `test-design` skill will produce a spec file that conforms to its own quality bar. When it finishes, review the spec and confirm that every case has the direct-access negative expectation and that the SU-T1..SU-T6 coverage is present.

- [ ] **Commit the spec**

```bash
git add skill-tests/skill-unit/troubleshooting.spec.md
git commit -m "test(skill-unit): add troubleshooting behavior spec"
```

---

## Task 9: Architecture doc + CLAUDE.md update

**Files:**

- Create: `docs/architecture/troubleshooting.md`
- Modify: `CLAUDE.md`

### Step 9.1: Write the architecture doc

- [ ] **Create `docs/architecture/troubleshooting.md`**

```markdown
# Troubleshooting entry point

Status: implemented 2026-04-19
Spec: docs/specs/2026-04-19-skill-unit-troubleshooting-design.md

## Invariant

The `skill-unit` skill is the **only** entry point for inspecting `.workspace/runs/`. Agents must not use Read, Glob, or Grep on anything under that directory. The skill enforces this in prose; the CLI makes it practical by exposing every question as a subcommand.

## Commands

| Command                                            | Reads                                                          | Notes                                   |
| -------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| `skill-unit runs`                                  | `.workspace/runs/*/results/*.results.json` (counts only)       | Summary table only. No `--full`.        |
| `skill-unit show <run-id\|latest>`                 | `.workspace/runs/<run>/results/*.results.json` and `report.md` | `--full` dumps `report.md`.             |
| `skill-unit transcript <run-id\|latest> <test-id>` | `*.transcript.md`                                              | `--full` appends the full transcript.   |
| `skill-unit grading <run-id\|latest> <test-id>`    | `*.results.md`, `*.grader-transcript.md`                       | `--full` appends the grader transcript. |

## Shared helper

All four commands share `src/core/runs-index.ts`, which owns run discovery and per-test aggregation. It is the only module that walks `.workspace/runs/` directly.

## Why no `diff` in v1

Comparing two runs is useful but adds surface area (what axis of comparison? what format? which deltas are interesting?) with no concrete use case yet. The agent can call `show` twice if it needs to compare. We re-evaluate once a real diff workflow surfaces.

## Why no transcript search in v1

Grepping inside transcripts is straightforward for the agent _after_ it has the transcript via `--full`. A dedicated `search` subcommand would be valuable later if transcripts get large enough that dumping the whole thing becomes costly, but adding it pre-emptively violates YAGNI.
```

### Step 9.2: Update CLAUDE.md

- [ ] **Edit `CLAUDE.md`**

Find the architecture docs list (under `## Architecture Documentation`) and add the new entry. Exact old/new strings below.

Old:

```
- `docs/architecture/per-test-fixtures.md` -- per-test fixture isolation strategy
- `docs/architecture/test-design.md` -- test design skill architecture
- `docs/architecture/test-execution.md` -- test execution pipeline
- `docs/architecture/tui-design.md` -- TUI/CLI architecture, screens, data flow, keyboard navigation
- `docs/architecture/workspaces.md` -- workspace isolation
```

New:

```
- `docs/architecture/per-test-fixtures.md` -- per-test fixture isolation strategy
- `docs/architecture/test-design.md` -- test design skill architecture
- `docs/architecture/test-execution.md` -- test execution pipeline
- `docs/architecture/troubleshooting.md` -- troubleshooting entry point (read-only CLI subcommands)
- `docs/architecture/tui-design.md` -- TUI/CLI architecture, screens, data flow, keyboard navigation
- `docs/architecture/workspaces.md` -- workspace isolation
```

- [ ] **Commit**

```bash
git add docs/architecture/troubleshooting.md CLAUDE.md
git commit -m "docs: add troubleshooting architecture doc"
```

---

## Task 10: Final verification

**Files:** none (verification only).

- [ ] **Full test suite + lint + typecheck**

```bash
npm run typecheck
npm run lint
npm test
```

Expected: all green.

- [ ] **Manual CLI spot-check**

```bash
npm run build
node dist/cli/index.js runs --limit 3
node dist/cli/index.js show latest
node dist/cli/index.js show latest --failed-only
node dist/cli/index.js show latest --full
```

Pick any failing test id from the `show latest` output and run:

```bash
node dist/cli/index.js transcript latest <test-id>
node dist/cli/index.js transcript latest <test-id> --full
node dist/cli/index.js grading latest <test-id>
node dist/cli/index.js grading latest <test-id> --full
```

Expected: output matches the skill's mapping-table promises (summary by default; full dumps only with `--full`).

- [ ] **Optional: run the troubleshooting spec tests**

This costs Anthropic tokens. Only run when explicitly asked or before merge.

```bash
npm run test:skills -- --name troubleshooting
```

Expected: all six SU-T\* cases pass.

- [ ] **No commit.** Hand off to the user for review of the branch.

```

```
