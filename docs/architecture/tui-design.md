# TUI Architecture

## Overview

Skill Unit operates in two modes: an interactive TUI for human users and a headless CLI for AI agents and CI pipelines. The TUI uses the alternate screen buffer for a full-screen experience and routes between five screens via keyboard navigation. The CLI bypasses the TUI entirely, executing commands directly and printing results to stdout/stderr.

## Mode Detection

The entry point (`src/cli/index.ts`) determines which mode to use:

```
skill-unit (no args, TTY detected)  ->  TUI mode (Ink app, alternate screen buffer)
skill-unit test --all               ->  CLI mode (run command directly)
skill-unit (no args, no TTY)        ->  CLI mode (print help)
```

The `--ci` flag forces CLI mode even when a TTY is present. This is the mode AI agents and CI pipelines should use.

## Technology Stack

- **Ink** -- React-based terminal UI framework. Components use JSX, flexbox layout via yoga-layout, and React hooks for state management.
- **@inkjs/ui** -- Official Ink UI component library. Used for `Select` (dropdown lists) and `TextInput` (inline text editing) in the Options screen.
- **Citty** -- TypeScript-first CLI framework. Commands are plain objects with a `run` function, making them easy to unit test.
- **marked + marked-terminal** -- Markdown parsing and terminal-formatted rendering for session transcripts.
- **yaml** -- Full YAML 1.2 parser and serializer for config file reading and writing.

## Three-Layer Architecture

```
src/cli/       Entry point, Citty commands, TTY detection
src/tui/       Ink screens, components, hooks (depends on core/)
src/core/      Business logic, no UI dependencies
```

**`src/core/`** is the business logic layer. It has zero UI or framework dependencies. Both the CLI commands and TUI screens consume it. Modules: config loader, spec discovery, compiler, runner, grader, reporter, stats, selection persistence, logger, transcript formatter.

**`src/cli/`** is the CLI layer. It defines Citty commands (`test`, `compile`, `ls`, `report`) and the main entry point with TTY detection. In headless mode, it drives the core modules directly and writes to stdout/stderr.

**`src/tui/`** is the TUI layer. It depends on `core/` and Ink. Each screen is a self-contained React component. The TUI never writes to stdout/stderr directly; all terminal output is managed by Ink's rendering pipeline.

## Silent Mode

When running under the TUI, the core modules must not write to stdout or stderr. Direct writes corrupt Ink's terminal rendering. This is enforced via a `silent` option:

- **`runTest(manifest, testCase, config, { silent: true })`** -- Suppresses the streaming markdown formatter, child process stderr piping, logger output, and raw JSON parse errors. All data flows through EventEmitter events instead.
- **`gradeTest(testCase, transcriptPath, config, specName, timestamp, { silent: true })`** -- Suppresses all logger output during grading. In TUI mode, grading uses per-test `gradeTest()` with an EventEmitter interface, allowing grading output to stream directly to the session panel as each test completes, rather than using batch `gradeSpecs()`.

In CLI mode, `silent` defaults to `false` and output streams to stderr as usual.

## Screen Architecture

### App Shell (`app.tsx`)

The root component manages:
- **Screen routing** -- `useState<Screen>` tracks the active screen. Keyboard shortcuts (D/R/S/O, Tab) switch screens.
- **Back navigation** -- `previousScreen` state tracks where the user came from when entering the Runner screen. Escape and Backspace return to `previousScreen` when the run is idle or complete.
- **Navigation lock** -- When `runState.status === 'running'` and the user is on the Runner screen, all global navigation keys (D/R/S/O, Tab, Q, Backspace) are disabled. Escape opens the cancel confirmation dialog instead.
- **Cancel dialog** -- A modal `ConfirmDialog` overlay that captures all input. Pressing Y confirms cancellation (calls `cancelRun()`), N or Escape dismisses it.
- **Full-screen layout** -- Uses `useStdout()` to get terminal rows and sets explicit `height={termHeight}` on the root Box. Listens for resize events.
- **Alternate screen buffer** -- The CLI entry point writes `\x1b[?1049h` before rendering and `\x1b[?1049l` on exit, giving a clean full-screen experience.
- **Data loading** -- On mount, loads config, discovers specs, loads the stats index. Passes data down to screens as props.
- **Runner view mode tracking** -- Tracks whether the Runner is in `primary` or `split` mode so the BottomBar can display contextual hints.

### Bottom Bar (`bottom-bar.tsx`)

Context-aware bar pinned to the bottom of every screen. Displays different content based on the current screen and run state:

| Context | Display |
|---|---|
| Top-level screens (Dashboard, Runs, Stats, Options) | `[D]ashboard [R]uns [S]tats [O]ptions  Tab: next [Q]uit` |
| Runner (running, primary view) | `Run in progress... [Esc] cancel  <- -> sessions  up/down scroll  [f] follow  [t] transcript  [v] split` |
| Runner (running, split view) | `Run in progress... [Esc] cancel  [1-9] focus  [m] maximize  [v] primary` |
| Runner (complete, primary view) | `[Space] select  [Enter] re-run  <- -> sessions  [Esc] back` |
| Runner (complete, split view) | `[1-9] focus  [m] maximize  [v] primary  [Esc] back` |

The active screen is highlighted in white bold on top-level screens. During active runs, the bar shows a yellow "Run in progress..." indicator.

### Screens

**Dashboard (`dashboard.tsx`)** -- Landing screen. Scrollable list of all test cases with an auto-focused search box. Supports `tag:` prefix filtering and substring matching. Space toggles selection, `a` selects all, Enter runs selected tests. Selections persist to `.skill-unit/selection.json`.

**Test Runner (`runner.tsx`)** -- Shown during test execution and historical run viewing. Session panel supports scrolling with Up/Down arrow keys to disable auto-follow mode, `[f]` to snap back to the bottom and re-enable auto-follow. A visual scrollbar (track + thumb) appears on the right edge when content overflows the panel. `[t]` toggles between execution and grading transcript views. Auto-switches to grading view when a test starts grading. When a run completes, the progress tree shows selection checkboxes; `[Space]` toggles selection for re-run, and `[Enter]` launches a new run with selected tests. Failed tests are pre-selected by default. Reports view mode changes to the app shell for bottom bar synchronization. Two view modes toggled with `[v]`:
- *Primary + Ticker* -- Progress tree sidebar on the left, ticker strip at top showing active session tabs, primary panel showing the selected session's full transcript rendered as markdown.
- *Split Panes* -- Grid layout of all active sessions. `[1-9]` focuses a pane, `[m]` maximizes/restores.

**Run Manager (`runs.tsx`)** -- Lists past runs from `.skill-unit/runs/`. Shows locale-formatted timestamps, test counts, pass/fail, duration, and cost. `[d]` deletes a run, `[c]` cleans up old runs (keeps last 10). `[Enter]` opens a historical run in the Runner view, loading transcripts and grading results from disk.

**Statistics (`stats.tsx`)** -- Aggregate metrics (total runs, pass rate, cost, tokens) and a per-test table sortable by name, run count, success rate, duration, cost, or last run date. `[s]` cycles the sort field.

**Options (`options.tsx`)** -- Interactive editor for `.skill-unit.yml` fields grouped by section (Runner, Output, Execution, Defaults). Cursor navigation with Up/Down. Press Enter to activate an inline editor for the focused field:
- *Enum fields* (tool, format, log-level): `Select` dropdown from `@inkjs/ui`
- *Boolean fields* (show-passing-details): Toggle on Enter
- *Number fields* (max-turns, concurrency): `TextInput` from `@inkjs/ui`
- *String fields* (model, timeout, setup, teardown): `TextInput` from `@inkjs/ui`

Escape cancels editing. Edits are held in local state until `[s]` saves. An "(unsaved changes)" indicator appears when the draft differs from the saved config.

## Data Flow: Test Execution

### CLI Mode

```
CLI test command
  -> compile specs into manifests
  -> for each test case (with concurrency semaphore):
       runTest() returns RunHandle (EventEmitter)
       subscribe to 'output', 'complete' events
       stream output to stderr (unless --no-stream)
  -> gradeSpecs() dispatches grader agents
  -> generateReport() writes report file
  -> recordRun() updates stats index
  -> print summary, exit with 0 or 1
```

### TUI Mode

```
Dashboard: user selects tests, presses Enter
  -> App records previousScreen='dashboard'
  -> App builds manifests, calls startRun() + executeRun()
  -> screen switches to Runner
  -> navigation locked (global keys disabled)

useTestRun hook:
  -> shared concurrency pool (config.runner.concurrency)
  -> for each test case (with concurrency control):
       runTest(manifest, tc, config, { silent: true })
       handle stored in activeHandles map
       'output' events -> buffered into transcript[] (flushed every 200ms)
       'tool-use' events -> update activity string
       'complete' events -> release slot, acquire slot for grading
  -> per-test grading (immediate, shares concurrency pool):
       gradeTest(tc, transcriptPath, config, specName, timestamp)
       handle stored in activeHandles map
       'output' events -> buffered into gradeTranscript[]
       'complete' events -> update status to passed/failed
  -> all tests graded:
       generateReport()
       recordRun()
       completeRun() stops timer
  -> navigation unlocked, bottom bar shows completion hints

Cancel flow:
  User presses Escape during active run
  -> Cancel confirmation dialog shown (modal overlay)
  -> Y: cancelRun() kills all active handles via handle.kill()
         transitions running/grading/pending tests to 'cancelled'
         stops timers, no report generated, no stats recorded
         run status becomes 'complete'
  -> N or Escape: dialog dismissed, run continues
```

The `useTestRun` hook buffers transcript lines and flushes every 200ms to avoid excessive React re-renders. Execution and grading happen concurrently, with each task consuming one slot from the shared concurrency pool.

## Component Hierarchy

```
App
  +- ConfirmDialog (modal overlay, shown during cancel confirmation)
  +- Dashboard
  |    +- SearchBox
  +- Runner
  |    +- ProgressTree
  |    +- Ticker
  |    +- SessionPanel
  |    |    +- Markdown
  |    |    +- Scrollbar
  |    +- SplitPanes (alternate view)
  +- RunManager
  +- Statistics
  +- Options
  |    +- FieldEditor
  |         +- Select (@inkjs/ui)
  |         +- TextInput (@inkjs/ui)
  +- BottomBar
```

## Persistent State

| File | Purpose |
|---|---|
| `.skill-unit/index.json` | Stats index (aggregate and per-test metrics, run history) |
| `.skill-unit/selection.json` | Dashboard test selections and view mode preference |
| `.skill-unit/runs/<timestamp>/` | Per-run artifacts (results, transcripts, reports) |
| `.workspace/` | Ephemeral test execution sandboxes (anti-bias isolation layer, unchanged) |

## Concurrency Configuration

The concurrency model has been unified into a single pool configured via `config.runner.concurrency` (default 5). This pool is shared between execution and grading tasks; each task consumes one slot. When a test finishes execution, it releases its slot (freeing it for another test to start). When its grader kicks off, it immediately acquires a new slot from the same pool. The legacy config keys `runner-concurrency` and `grader-concurrency` have been consolidated into the unified `concurrency` value.

## TestStatus

```typescript
type TestStatus = 'pending' | 'running' | 'grading' | 'passed' | 'failed' | 'timedout' | 'error' | 'cancelled';
```

| Status | Icon | Color | Description |
|---|---|---|---|
| pending | `○` | gray | Queued, not yet started |
| running | `⏳` | blue | Test execution in progress |
| grading | `⚙` | yellow | Grader evaluating results |
| passed | `✓` | green | All expectations met |
| failed | `✗` | red | One or more expectations failed |
| timedout | `⏰` | red | Execution exceeded timeout |
| error | `✗` | red | Process error (non-zero exit, spawn failure) |
| cancelled | `⊘` | gray | User cancelled the run before completion |

## Keyboard Navigation

| Key | Context | Action |
|---|---|---|
| D, R, S, O | Global (not during active run) | Switch to Dashboard, Runs, Stats, Options |
| Tab | Global (not during active run) | Cycle to next screen |
| Q | Global (not during active run) | Quit (exit alternate screen buffer) |
| Escape | Runner (active run) | Open cancel confirmation dialog |
| Escape | Runner (idle/complete) | Return to previous screen |
| Backspace | Runner (idle/complete) | Return to previous screen |
| Y | Cancel dialog | Confirm cancellation |
| N | Cancel dialog | Dismiss dialog |
| Space | Dashboard | Toggle test selection |
| a | Dashboard | Select/deselect all |
| Enter | Dashboard | Run selected tests |
| Left/Right | Runner (Primary) | Switch active session in ticker |
| Up/Down | Runner (Primary) | Scroll transcript, disable auto-follow |
| f | Runner (Primary) | Snap to bottom, re-enable auto-follow |
| t | Runner (Primary) | Toggle execution/grading transcript |
| v | Runner | Toggle Primary+Ticker / Split Panes view |
| 1-9 | Runner (Split) | Focus pane by number |
| m | Runner (Split) | Maximize/restore focused pane |
| Space | Runner (complete) | Toggle test selection for re-run |
| Enter | Runner (complete) | Re-run selected tests |
| s | Stats | Cycle sort field |
| d | Run Manager | Delete selected run |
| c | Run Manager | Clean up old runs (keep last 10) |
| Enter | Run Manager | View historical run details |
| Enter | Options | Edit focused field |
| Escape | Options (editing) | Cancel edit |
| s | Options | Save config changes |
