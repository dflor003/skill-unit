# TUI Polish Design Spec

## Overview

A set of enhancements to the skill-unit TUI that improve visual clarity, add scrolling support, unify the live and historical run views, stream grading output per-test, and consolidate the concurrency model. These changes make the Runner screen a dumb presentation component driven by its caller, enable browsing and re-running historical runs, and replace the batch grading phase with immediate per-test grading.

## Changes

### 1. Bold Active Tab (Bottom Bar)

The active tab in the bottom bar currently uses `color="blue"` with `bold`, which lacks contrast against the `gray` inactive tabs on many terminals.

**Change:** Switch the active tab color from `blue` to `white`, keeping `bold`. This produces bright white text that stands out clearly against gray inactive tabs.

**File:** `src/tui/components/bottom-bar.tsx`

### 2. Scrollable Session Panel

The session panel currently renders the full transcript in a `<Box overflow="hidden">` with no scroll capability. Long transcripts are cut off.

**State additions to `SessionPanel`:**

- `scrollOffset: number` -- lines from the bottom (0 = pinned to bottom)
- `following: boolean` -- starts `true`

**Auto-follow behavior:**

When `following` is true, `scrollOffset` stays at 0 and the view always shows the latest transcript lines. New transcript lines arriving while `following` is true keep the view pinned to the bottom.

**Manual scroll:**

Up/down arrow keys adjust `scrollOffset` and set `following = false`. This detaches from auto-follow so the user can read earlier output without the view jumping.

**Return to follow:**

`[f]` sets `following = true` and `scrollOffset = 0`, snapping back to the bottom.

**Rendering:**

Visible lines are computed from the transcript based on the panel's measured height and `scrollOffset`. Only the visible slice is rendered. When scrolled up (not following), a small indicator appears (e.g., `[f] follow`) so the user knows they are detached from live output.

**Key bindings (scoped to Runner screen):**

| Key | Action |
|---|---|
| Up | Scroll up, disable follow |
| Down | Scroll down, disable follow |
| f | Snap to bottom, re-enable follow |

**File:** `src/tui/components/session-panel.tsx`

### 3. Runner as Dumb View + Historical Run Detail

The Runner screen becomes a pure presentation component that receives all data as props. The data source (live hook vs. disk files) is the caller's concern.

#### Runner Props

```typescript
interface RunnerData {
  tests: Array<{
    id: string;
    name: string;
    specName: string;
    status: TestStatus;
    durationMs: number;
    transcript: string[];
    gradeTranscript: string[];
    activity: string;
  }>;
  activeTestId: string | null;
  elapsed: number;
  status: 'idle' | 'running' | 'complete';
}

interface RunnerProps {
  data: RunnerData;
  onSelectTest: (id: string) => void;
}
```

The `useTestRun` hook's `TestRunEntry` gains a `gradeTranscript: string[]` field. The hook maps its state to the `RunnerData` shape before passing to Runner.

#### Live Runs (from Dashboard)

`App` drives `useTestRun` as today. The hook provides live data mapped to `RunnerData`. No change in how runs are initiated from the Dashboard.

#### Historical Runs (from Run Manager)

When the user presses Enter on a run in the Run Manager:

1. `App` reads the run's artifact files from `.workspace/runs/<timestamp>/results/`:
   - `<spec>.<id>.transcript.md` for execution transcripts
   - `<spec>.<id>.results.md` for grading results
2. Hydrates the data into the `RunnerData` shape with `status: 'complete'`
3. Passes it to Runner, which renders identically to a completed live run
4. The screen switches to the Runner view

The Run Manager tracks which run is "open" via cursor state. The user navigates back with the normal global keys (D/R/S/O).

#### Re-run from Historical View

When viewing a completed run (live or historical), the progress sidebar doubles as a selection UI:

- `[space]` toggles individual test selection
- Failed tests are pre-selected by default
- `[Enter]` launches a new run with the selected tests (new timestamp, new run entry)

This reuses the same `startRun` + `executeRun` path as the Dashboard, just with a pre-filtered test list.

**Files:** `src/tui/screens/runner.tsx`, `src/tui/screens/runs.tsx`, `src/tui/app.tsx`, `src/tui/hooks/use-test-run.ts`

### 4. Execution/Grading Transcript Toggle

Each test has two transcripts displayed in the session panel: the execution transcript (agent working) and the grading transcript (grader evaluating).

**Toggle:** `[t]` switches between execution and grading views.

**Panel header indicator:** Shows the active view, e.g.:

```
TestName [Passed] 37s
[Execution] | Grading          <- execution view active
Execution | [Grading]          <- grading view active
```

**Auto-switch behavior during live runs:**

- While a test is `running`, the panel shows the execution transcript
- When a test transitions to `grading`, the panel auto-switches to the grading view and streams the grader's live output
- Auto-switch only fires if the user has not manually toggled for that test
- Manual toggle via `[t]` sticks; it overrides auto-switch for that test

**Historical view:** Both transcripts are fully loaded from disk. `[t]` toggles freely between them.

**Key bindings (scoped to Runner screen):**

| Key | Action |
|---|---|
| t | Toggle between execution and grading transcript |

**Files:** `src/tui/components/session-panel.tsx`, `src/tui/hooks/use-test-run.ts`

### 5. Per-test Immediate Grading

Currently, grading is a batch operation (`gradeSpecs`) that runs after all tests complete. This changes to per-test immediate grading: each test's grader kicks off as soon as its execution finishes.

**Flow per test:**

1. Test execution completes (runner emits `complete` event)
2. If `exitCode === 0`, the test transitions to `grading` status
3. `gradeTest()` is called immediately, returning a `GradeHandle` (EventEmitter)
4. The hook subscribes to `output` events, buffering into `gradeTranscript[]` (same pattern as execution transcript buffering)
5. On grader `complete`, the test transitions to `passed` or `failed`

**Concurrency:** Grading tasks share the same concurrency pool as execution tasks (see section 6). If all slots are occupied, grading queues until a slot frees up.

**Run completion:** The run is complete when all tests have finished grading (or errored). There is no longer a separate "grading phase" -- execution and grading happen concurrently.

**Impact on `useTestRun` hook:**

- The `onAllTestsDone` function is removed
- Each test's `complete` handler kicks off grading directly
- A new completion check runs after each grading finish: if all tests are in a terminal state (`passed`, `failed`, `timedout`, `error`), the run is complete
- The `gradeSpecs` import is replaced with `gradeTest`

**Files:** `src/tui/hooks/use-test-run.ts`, `src/core/grader.ts` (no changes needed; `gradeTest` already exists)

### 6. Unified Concurrency Pool

The current config has two separate concurrency values:

- `runner.runner-concurrency` (default 5) -- execution slots
- `execution.grader-concurrency` (default 5) -- grading slots

These are consolidated into a single value:

- `runner.concurrency` (default 5) -- total concurrent tasks (execution + grading combined)

A running test and a grading test each consume one slot. When a test finishes execution, it releases its slot (freeing it for another test to start). When its grader kicks off, it takes a new slot from the same pool.

**Config migration:**

- `runner-concurrency` is renamed to `concurrency` in the `runner` config section
- `grader-concurrency` is removed from the `execution` config section
- The config loader and type definitions are updated
- The config loader falls back to `runner-concurrency` if `concurrency` is not set, so existing `.skill-unit.yml` files continue to work without changes

**Files:** `src/types/config.ts`, `src/config/loader.ts`, `src/tui/hooks/use-test-run.ts`, `src/cli/commands/test.ts`

## Keyboard Reference (Runner Screen, Updated)

| Key | Context | Action |
|---|---|---|
| Left/Right | Primary view | Switch active session in ticker |
| Up/Down | Primary view | Scroll transcript, disable follow |
| f | Primary view | Snap to bottom, re-enable follow |
| t | Primary view | Toggle execution/grading transcript |
| v | Any | Toggle Primary+Ticker / Split Panes view |
| Space | Completed run | Toggle test selection for re-run |
| Enter | Completed run | Re-run selected tests |
| 1-9 | Split view | Focus pane by number |
| m | Split view | Maximize/restore focused pane |

## Architecture Doc Updates

The following architecture documents should be updated after implementation:

- `docs/architecture/tui-design.md` -- update screen descriptions, keyboard reference, data flow sections to reflect scrolling, transcript toggle, historical run viewing, per-test grading, and unified concurrency
