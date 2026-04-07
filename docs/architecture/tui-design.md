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
- **Citty** -- TypeScript-first CLI framework. Commands are plain objects with a `run` function, making them easy to unit test.
- **marked + marked-terminal** -- Markdown parsing and terminal-formatted rendering for session transcripts.

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
- **`gradeSpecs(specs, config, timestamp, { silent: true })`** -- Suppresses all logger output during grading.

In CLI mode, `silent` defaults to `false` and output streams to stderr as usual.

## Screen Architecture

### App Shell (`app.tsx`)

The root component manages:
- **Screen routing** -- `useState<Screen>` tracks the active screen. Keyboard shortcuts (D/R/S/O, Tab) switch screens.
- **Full-screen layout** -- Uses `useStdout()` to get terminal rows and sets explicit `height={termHeight}` on the root Box. Listens for resize events.
- **Alternate screen buffer** -- The CLI entry point writes `\x1b[?1049h` before rendering and `\x1b[?1049l` on exit, giving a clean full-screen experience.
- **Data loading** -- On mount, loads config, discovers specs, loads the stats index. Passes data down to screens as props.

### Bottom Bar (`bottom-bar.tsx`)

Pinned to the bottom of every screen. Shows navigation hotkeys: `[D]ashboard [R]uns [S]tats [O]ptions Tab: next [Q]uit`. The active screen is highlighted in blue. Displays the version number on the right.

### Screens

**Dashboard (`dashboard.tsx`)** -- Landing screen. Scrollable list of all test cases with an auto-focused search box. Supports `tag:` prefix filtering and substring matching. Space toggles selection, `a` selects all, Enter runs selected tests. Selections persist to `.skill-unit/selection.json`.

**Test Runner (`runner.tsx`)** -- Shown during test execution. Two view modes toggled with `[v]`:
- *Primary + Ticker* -- Progress tree sidebar on the left, ticker strip at top showing active session tabs, primary panel showing the selected session's full transcript rendered as markdown.
- *Split Panes* -- Grid layout of all active sessions. `[1-9]` focuses a pane, `[m]` maximizes/restores.

**Run Manager (`runs.tsx`)** -- Lists past runs from `.skill-unit/runs/`. Shows locale-formatted timestamps, test counts, pass/fail, duration, and cost. `[d]` deletes a run, `[c]` cleans up old runs (keeps last 10).

**Statistics (`stats.tsx`)** -- Aggregate metrics (total runs, pass rate, cost, tokens) and a per-test table sortable by name, run count, success rate, duration, cost, or last run date. `[s]` cycles the sort field.

**Options (`options.tsx`)** -- Form-style view of `.skill-unit.yml` fields grouped by section (runner, output, execution, defaults). Cursor navigation with `[s]` to save.

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
  -> App builds manifests, calls startRun() + executeRun()
  -> screen switches to Runner

useTestRun hook:
  -> for each test case (with concurrency control):
       runTest(manifest, tc, config, { silent: true })
       'output' events -> buffered into transcript[] (flushed every 200ms)
       'tool-use' events -> update activity string
       'complete' events -> update status, manage concurrency
  -> all tests done:
       gradeSpecs(specs, config, timestamp, { silent: true })
       generateReport()
       recordRun()
       completeRun() stops timer
```

The `useTestRun` hook buffers transcript lines and flushes every 200ms to avoid excessive React re-renders.

## Component Hierarchy

```
App
  +- Dashboard
  |    +- SearchBox
  +- Runner
  |    +- ProgressTree
  |    +- Ticker
  |    +- SessionPanel
  |    |    +- Markdown
  |    +- SplitPanes (alternate view)
  +- RunManager
  +- Statistics
  +- Options
  +- BottomBar
```

## Persistent State

| File | Purpose |
|---|---|
| `.skill-unit/index.json` | Stats index (aggregate and per-test metrics, run history) |
| `.skill-unit/selection.json` | Dashboard test selections and view mode preference |
| `.skill-unit/runs/<timestamp>/` | Per-run artifacts (results, transcripts, reports) |
| `.workspace/` | Ephemeral test execution sandboxes (anti-bias isolation layer, unchanged) |

## Keyboard Navigation

| Key | Context | Action |
|---|---|---|
| D, R, S, O | Global | Switch to Dashboard, Runs, Stats, Options |
| Tab | Global | Cycle to next screen |
| Q | Global | Quit (exit alternate screen buffer) |
| Space | Dashboard | Toggle test selection |
| a | Dashboard | Select/deselect all |
| Enter | Dashboard | Run selected tests |
| Left/Right | Runner (Primary) | Switch active session in ticker |
| v | Runner | Toggle Primary+Ticker / Split Panes view |
| 1-9 | Runner (Split) | Focus pane by number |
| m | Runner (Split) | Maximize/restore focused pane |
| s | Stats | Cycle sort field |
| d | Run Manager | Delete selected run |
| c | Run Manager | Clean up old runs (keep last 10) |
| s | Options | Save config changes |
