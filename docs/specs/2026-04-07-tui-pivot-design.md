# TUI Pivot Design Spec

## Overview

Skill Unit pivots from a skill-driven workflow to a dual-use CLI/TUI tool. Human users get a full terminal UI for browsing tests, running them in parallel, and viewing results. AI agents get a headless CLI mode for programmatic test execution. The project is rewritten in TypeScript, published as the `skill-unit` npm package, and supported by CI/CD with pre-release and production release workflows.

## Technology Decisions

| Decision           | Choice                       | Rationale                                                                              |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------------------- |
| Language           | TypeScript (strict mode)     | Type safety, better tooling, required by constraints                                   |
| Runtime            | Node.js 18+                  | Universal; consumers already have it                                                   |
| Dev runner         | tsx                          | Run `.ts` directly during development, no build step                                   |
| Build              | tsc                          | Standard TypeScript compiler, outputs to `dist/`                                       |
| CLI framework      | Citty                        | TypeScript-first, commands-as-data design, excellent testability                       |
| TUI framework      | Ink (React for terminals)    | Component model maps to screens, flexbox layout, proven at scale (used by Claude Code) |
| Test framework     | Vitest + ink-testing-library | Fast, TypeScript-native, coverage built in, ink-testing-library for component tests    |
| Markdown rendering | marked + marked-terminal     | Most complete parser, terminal-formatted output                                        |
| Package name       | `skill-unit` (unscoped)      | Available on npm, clean `npx skill-unit` invocation                                    |

## Project Structure

```
skill-unit/
├── src/
│   ├── cli/                    # CLI entry point & command definitions
│   │   ├── index.ts            # Main entry, TTY detection, Citty app setup
│   │   └── commands/
│   │       ├── test.ts         # test command (compile + run + grade + report)
│   │       ├── compile.ts      # compile-only command
│   │       ├── ls.ts           # list specs/tests command
│   │       └── report.ts       # generate report from existing run
│   │
│   ├── tui/                    # Ink TUI application
│   │   ├── app.tsx             # Root Ink component, screen router, bottom bar
│   │   ├── screens/
│   │   │   ├── dashboard.tsx   # Test list + search + selection
│   │   │   ├── runner.tsx      # Test execution view
│   │   │   ├── runs.tsx        # Run manager (past runs)
│   │   │   ├── stats.tsx       # Aggregate statistics
│   │   │   └── options.tsx     # .skill-unit.yml editor
│   │   ├── components/         # Shared TUI components
│   │   │   ├── bottom-bar.tsx  # Navigation bar with hotkeys
│   │   │   ├── progress-tree.tsx  # Hierarchical test progress
│   │   │   ├── session-panel.tsx  # Transcript stream viewer
│   │   │   ├── ticker.tsx      # Compact session status strip
│   │   │   ├── search-box.tsx  # Filterable search input
│   │   │   └── markdown.tsx    # marked-terminal wrapper component
│   │   └── hooks/              # React hooks for TUI state
│   │       ├── use-test-run.ts # Run lifecycle management
│   │       └── use-keyboard.ts # Keyboard navigation
│   │
│   ├── core/                   # Business logic (no UI dependencies)
│   │   ├── compiler.ts         # Spec parsing, config loading, manifest building
│   │   ├── runner.ts           # Process spawning, workspace management
│   │   ├── grader.ts           # Grader agent dispatch
│   │   ├── reporter.ts         # Report generation
│   │   ├── stats.ts            # Stats collection, index management
│   │   └── discovery.ts        # Spec file discovery & filtering
│   │
│   ├── config/                 # Configuration
│   │   ├── schema.ts           # TypeScript types for .skill-unit.yml
│   │   └── loader.ts           # Config file loading & defaults
│   │
│   └── types/                  # Shared type definitions
│       ├── spec.ts             # Spec, TestCase, Manifest types
│       ├── run.ts              # RunResult, TestResult, Stats types
│       └── config.ts           # Config types
│
├── tests/                      # Vitest unit & component tests
│   ├── core/                   # Core logic tests
│   ├── cli/                    # Command tests
│   └── tui/                    # Ink component tests
│
├── skill-tests/                # Skill-unit spec files (unchanged)
├── skills/                     # Plugin skills (companion role, not in npm package)
├── agents/                     # Grader agent (unchanged)
├── dist/                       # tsc output (gitignored)
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

### Architectural Boundaries

- **`src/core/`** has zero UI or CLI dependencies. Exports pure functions and classes consumed by both CLI commands and TUI screens. This is where proven logic from the current JS codebase is ported.
- **`src/cli/`** is the entry point. Detects TTY and either launches the Ink app (interactive) or executes commands directly (non-interactive/CI mode).
- **`src/tui/`** depends on `core/` and Ink. Each screen is a self-contained component that calls into core functions.
- **`src/types/`** is shared across all layers. No circular dependencies.

## CLI Mode

### Entry Point Flow

```
skill-unit (no args, TTY detected)  →  Launch Ink app  →  Dashboard screen
skill-unit test --all               →  CLI mode        →  Run tests, print results
skill-unit (no args, no TTY)        →  CLI mode        →  Print help text and exit
```

### Commands

| Command   | Description                          | Key Flags                                                                                                                         |
| --------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `test`    | Compile + run + grade + report       | `--all`, `--name`, `--tag`, `--test`, `--file`, `--model`, `--timeout`, `--max-turns`, `--keep-workspaces`, `--ci`, `--no-stream` |
| `compile` | Parse specs and build manifests only | `--all`, `--name`, `--tag`, `--test`, `--file`                                                                                    |
| `ls`      | List discovered specs and test cases | `--tag`, `--file`                                                                                                                 |
| `report`  | Generate report from a completed run | `--run-dir`                                                                                                                       |

### Override Flags

- `--ci` -- Forces CLI mode even in a TTY. Plain text output, no ANSI colors, no spinners. Exit code reflects pass/fail. Suitable for AI agents and CI pipelines.
- `--no-stream` -- Suppresses live transcript streaming during test runs. The final report summary still prints. Designed for AI agent invocations to avoid context flooding.

### Exit Codes

- `0` -- All tests passed
- `1` -- One or more tests failed
- `2` -- Execution error (config not found, invalid spec, etc.)

## TUI Screens

### Navigation

Hybrid bottom bar with hotkeys. A thin status line at the bottom of every screen shows the current screen name and available hotkeys:

```
[D]ashboard  [R]uns  [S]tats  [O]ptions                    skill-unit v0.2.0
```

Pressing the corresponding key switches to that screen. The Test Runner screen appears automatically when a run starts and is not listed in the bar (you navigate away from it when done reviewing).

### Dashboard

The landing screen. Where users spend most of their time.

- **Search box** at the top, auto-focused on launch. Typing immediately filters the list.
- **Test list** fills remaining space. Each row: checkbox, test ID, test name, tags, last result (pass/fail/never run), last run time.
- **Search syntax:**
  - Partial match on test case names (substring matching)
  - `tag:e2e` filters by tag
  - Multiple filters combine: `tag:e2e timeout` finds tests tagged `e2e` with "timeout" in the name
- **Key bindings:** `[Space]` toggle select, `[a]` select all, `[Enter]` run selected
- **Selection persistence:** Selected tests stored in `.skill-unit/selection.json` (gitignored). Survives across runs and TUI sessions.

### Test Runner

The crown jewel. Shown when a test run is kicked off.

**Phase 1: Primary + Ticker layout**

- **Progress tree sidebar** (left): Hierarchical view of all tests in the run. Icons distinguish status:
  - Pending (hollow circle)
  - Running (spinner)
  - Grading (gear icon)
  - Passed (green check)
  - Failed (red X)
  - Timed out (clock icon)
  - Sidebar also shows elapsed time, token count, and a progress bar.
- **Ticker strip** (top of main area): One tab per active session showing test name and current activity. Highlights the selected session.
- **Primary panel** (main area): Full transcript of the selected session. Rendered with marked-terminal. Shows either the test conversation (while running) or the grader's evaluation (while grading).
- **Key bindings:** `[Left/Right]` switch session in ticker, `[Up/Down]` scroll transcript

**Phase 2: Split Panes (added after Phase 1)**

- `[v]` toggles between Primary+Ticker and Split Panes view
- Split Panes shows a dynamic grid of all active sessions (e.g., 2x2 for 4 sessions)
- Each pane shows a truncated transcript stream
- `[1-9]` focuses a pane, `[m]` maximizes/restores the focused pane
- User's preferred view mode persists in `.skill-unit/selection.json`

**Post-run behavior:** Screen stays on the Test Runner for review. Summary appears in the progress sidebar with a link to the full report file. User can browse any session's transcript before navigating away.

### Run Manager

Browse and manage past runs.

- Scrollable list of past runs from `.skill-unit/runs/`
- Each row: timestamp, test count, pass/fail counts, duration, total cost
- Selecting a run expands to show individual test results with links to transcripts
- **Key bindings:** `[d]` delete a run, `[c]` cleanup (keep last 10), `[Enter]` view details
- **Empty state:** Centered message: "No runs yet. Go to Dashboard and run some tests."

### Statistics

Aggregate and per-test metrics.

- **Aggregate section** (top): Total runs, overall pass rate, total cost, average duration
- **Per-test table** (below): Test name, run count, success rate, avg duration, avg cost, last run date
- Sortable by any column: `[s]` cycles sort field
- Data sourced from `.skill-unit/index.json`

### Options

TUI editor for `.skill-unit.yml`.

- Form-style view of all config fields
- Each field shows current value with inline editing
- `[Enter]` edit a field, `[Esc]` cancel, `[s]` save to disk
- Fields grouped by section: runner, output, execution, defaults

### Report View

The TUI does not render the full markdown report inline. Instead:

- The Test Runner's post-run view shows a summary table (test name, status, duration, cost)
- A clickable file path link to the full `.md` report is displayed for users who want the detailed version
- The full report is still generated as a file (same format as today)

This avoids the complexity of rendering `<details>` blocks in the terminal and leverages the fact that the TUI already provides the full context through the progress tree and session panels.

## Core Engine

### Module Responsibilities

**`discovery.ts`** -- Finds and filters spec files.

- `discoverSpecs(config)` returns all discovered spec file paths
- `filterSpecs(specs, { name?, tag?, test?, file? })` applies filters
- Used by Dashboard (list all), CLI `ls` command, and pre-run filtering

**`compiler.ts`** -- Parses specs into typed manifests. Ported from current `compiler.js`.

- `parseSpec(filePath)` returns a typed `Spec` object
- `buildManifest(spec, config)` produces a `Manifest` with resolved paths and tool permissions
- YAML/markdown parser logic carries over (proven, dependency-free)

**`runner.ts`** -- Executes tests in isolated CLI processes. Ported from current `runner.js`.

- `runTest(manifest, testCase, config)` spawns an isolated process, returns a `RunHandle`
- `RunHandle` exposes an event emitter: `on('output', ...)`, `on('complete', ...)`, `on('error', ...)`
- TUI subscribes to events for live transcript streaming; CLI writes to stdout
- Concurrency managed by semaphore based on `runner-concurrency` config

**`grader.ts`** -- Dispatches grader agents. Ported from current `grader.js`.

- `gradeTest(testCase, transcriptPath, config)` returns a `GradeResult`
- Exposes events for TUI to stream grader progress

**`reporter.ts`** -- Generates reports.

- `generateReport(runResult)` writes the full markdown report file
- `generateSummary(runResult)` returns a compact summary for terminal display

**`stats.ts`** -- Statistics collection and index management.

- `recordRun(runResult)` saves run data and updates the index
- `loadIndex()` reads `.skill-unit/index.json`
- `rebuildIndex()` reconstructs the index from all run files (recovery path)
- `cleanupRuns(keepCount)` removes old runs and updates the index

## Data Storage

### Directory Responsibilities

| Directory                    | Purpose                                                        | Lifecycle                                       |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `.workspace/`                | Ephemeral test execution sandboxes (anti-bias isolation layer) | Created per test, cleaned up after run          |
| `.skill-unit/runs/`          | Completed run artifacts (results, transcripts, reports)        | Persistent, managed by Run Manager cleanup      |
| `.skill-unit/index.json`     | Stats index (aggregate and per-test metrics)                   | Persistent, updated after each run, rebuildable |
| `.skill-unit/selection.json` | Dashboard selection state and view preferences                 | Persistent, user preference                     |

**Critical:** `.workspace/` is the anti-bias isolation layer. It remains exactly as-is. UUID-named per-test workspaces, scoped tool permissions, ephemeral lifecycle. The TUI pivot does not touch this boundary.

**Gitignore additions:** `.skill-unit/` and `dist/` must be added to `.gitignore`. The `.skill-unit/` directory contains user-local run data, stats, and selection state. The `dist/` directory contains compiled output.

### Stats Index Format

`.skill-unit/index.json`:

```json
{
  "version": 1,
  "lastUpdated": "2026-04-07T10:00:00Z",
  "aggregate": {
    "totalRuns": 15,
    "totalTests": 120,
    "passRate": 0.85,
    "totalCost": 2.34,
    "totalTokens": 145200
  },
  "tests": {
    "runner/TEST-1": {
      "name": "basic-usage",
      "runCount": 12,
      "passCount": 10,
      "avgDuration": 34.2,
      "avgCost": 0.019,
      "avgTokens": 1200,
      "lastRun": "2026-04-07T10:00:00Z",
      "lastResult": "pass"
    }
  },
  "runs": [
    {
      "id": "2026-04-07-10-00-00",
      "timestamp": "2026-04-07T10:00:00Z",
      "testCount": 8,
      "passed": 7,
      "failed": 1,
      "duration": 124.5,
      "cost": 0.156,
      "tokens": 9600
    }
  ]
}
```

### Run Artifact Structure

```
.skill-unit/runs/<timestamp>/
├── manifest.json          # What was compiled for this run
├── results/
│   ├── TEST-1.result.json # Structured result per test
│   └── TEST-2.result.json
├── transcripts/
│   ├── TEST-1.transcript.md
│   └── TEST-2.transcript.md
└── report.md              # Full markdown report
```

## Package Publishing

### npm Package Configuration

```json
{
  "name": "skill-unit",
  "version": "0.1.0",
  "bin": { "skill-unit": "./dist/cli/index.js" },
  "files": ["dist/"],
  "engines": { "node": ">=18" },
  "type": "module"
}
```

- `dist/` is the only published directory (compiled JS from `tsc`)
- `skills/`, `agents/`, `tests/`, `skill-tests/`, `docs/` are excluded from the package
- Skills and agents remain in the repo as the plugin companion; users install those separately

### Claiming the Package Name

Early in implementation: update `README.md` with a description of the project and a "Coming Soon" message, then publish a minimal `skill-unit@0.0.1` placeholder to npm to reserve the name.

## CI/CD Pipeline

### On Every Push (all branches)

1. Install dependencies
2. `tsc --noEmit` -- type check
3. `vitest run --coverage` -- unit + component tests
4. ESLint -- lint check

### On Push to `main` (additional steps)

5. `tsc` -- build
6. `npm publish --tag next` -- pre-release publish
   - Version: `0.x.0-next.<short-sha>` or timestamp-based
   - Install via: `npm install skill-unit@next`

### On GitHub Release (manual trigger)

7. `tsc` -- build
8. `npm publish --tag latest` -- production release
   - Version from the release/tag (e.g., `v0.1.0`)
   - You control when this happens by creating a release in the GitHub UI

### Skill Tests

Skill tests (`npm run test:skills`) are not in the automated CI pipeline. They require a CLI harness and cost real tokens. Run on-demand locally or via a separate manually-triggered workflow.

## TypeScript & Dev Tooling Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "jsx": "react-jsx",
    "jsxImportSource": "ink"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### vitest.config.ts

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/types/**'],
    },
  },
});
```

### Dev Scripts

```json
{
  "dev": "tsx src/cli/index.ts",
  "build": "tsc",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:skills": "node dist/cli/index.js test --all",
  "lint": "eslint src/",
  "typecheck": "tsc --noEmit",
  "su": "tsx src/cli/index.ts"
}
```

### Dependencies

| Package               | Type       | Purpose                                  |
| --------------------- | ---------- | ---------------------------------------- |
| `ink`                 | Production | TUI framework                            |
| `react`               | Production | Required by Ink                          |
| `citty`               | Production | CLI argument parsing                     |
| `marked`              | Production | Markdown parser                          |
| `marked-terminal`     | Production | Terminal markdown renderer               |
| `typescript`          | Dev        | Compiler                                 |
| `tsx`                 | Dev        | Run TS directly during development       |
| `vitest`              | Dev        | Test runner                              |
| `@vitest/coverage-v8` | Dev        | Coverage provider                        |
| `@inkjs/ui`           | Production | Ink UI components (spinners, text input) |
| `ink-testing-library` | Dev        | Component testing                        |
| `eslint`              | Dev        | Linting                                  |

## Plugin Companion Role

The `skills/` and `agents/` directories remain in the repo but are not part of the npm package. Their role shifts:

- **`skill-unit` skill** becomes a companion that teaches AI agents how to use the `skill-unit` CLI effectively. It provides context on the framework, the spec format, and best practices for agent-driven test execution.
- **`test-design` skill** continues to assist with test case design. This is the part that requires AI judgment and cannot be handled by CLI tooling alone.
- **`grader` agent** remains unchanged. It is dispatched by the core engine's `grader.ts` module during test execution.
