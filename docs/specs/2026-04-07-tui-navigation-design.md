# TUI Navigation and UX Polish Design Spec

## Overview

Five enhancements to the skill-unit TUI that improve navigation, protect active runs, support run cancellation, add visual scroll indicators, and make the Options screen editable. Together they make the Runner screen behave like a modal context: the user is "inside" a run with clear back-navigation, protected from accidental screen changes during execution, and equipped with a cancel escape hatch and scroll position awareness. The Options screen becomes a fully interactive config editor.

## Changes

### 1. Back Navigation (Escape / Backspace)

The Runner screen is the only screen accessed as a "child" of another screen (Dashboard or Runs). Currently, the only way to leave it is to press a global nav key (D/R/S/O), which requires the user to know where they came from.

**Mechanism:**

`App` tracks a `previousScreen` state (type `Screen`, defaults to `'dashboard'`). When navigating to the Runner screen, the app records the originating screen:

- Dashboard starts a run -> `previousScreen = 'dashboard'`
- Run Manager views a historical run -> `previousScreen = 'runs'`

**Key bindings (Runner screen, run NOT active):**

| Key | Action |
|---|---|
| Escape | Return to `previousScreen` |
| Backspace | Return to `previousScreen` |

**Bottom bar update:** When on the Runner screen with a completed or idle run, the status area shows `[Esc] back` so the user knows how to return.

**Scope:** Only the Runner screen supports back navigation. Dashboard, Runs, Stats, and Options are top-level peers; pressing Escape/Backspace on them does nothing.

### 2. Navigation Lock During Active Run

When `runState.status === 'running'` and the user is on the Runner screen, global navigation is disabled to prevent accidentally leaving an in-progress run.

**Disabled keys:**

- D, R, S, O (screen switching)
- Tab (screen cycling)
- Q (quit)
- Backspace (back navigation)

Escape is NOT disabled; it triggers the cancel confirmation dialog (see section 3).

**Visual feedback:**

The bottom bar switches to a run-mode display when locked. Instead of the normal `[D]ashboard [R]uns [S]tats [O]ptions` nav items, it shows the runner's contextual hints:

```
Run in progress...  [Esc] cancel  ← → sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split
```

The runner's own inline footer (currently at the bottom of `runner.tsx`) is removed to avoid duplication; all hints move into the bottom bar.

**Implementation:**

The `useInput` handler in `app.tsx` checks whether the current screen is `runner` and `runState.status === 'running'` before processing global nav keys. If locked, the keys are silently ignored.

The `BottomBar` component receives additional props: `runActive: boolean` (or the run status) to switch its display mode.

**Files:** `src/tui/app.tsx`, `src/tui/components/bottom-bar.tsx`, `src/tui/screens/runner.tsx`

### 3. Cancel Run with Confirmation Dialog

During an active run, Escape opens a confirmation dialog. This provides a safe way to abort without accidental cancellation.

#### Dialog Component

A new `ConfirmDialog` component rendered as an overlay in `app.tsx`. While visible, it captures all keyboard input, preventing the Runner and app shell from responding.

```
┌───────────────────────────┐
│    Cancel the run?        │
│    [Y]es / [N]o           │
└───────────────────────────┘
```

**Centered** in the terminal using Ink's flexbox (justify/align center), rendered on top of the existing content.

**Input handling:**

| Key | Action |
|---|---|
| y / Y | Confirm cancellation |
| n / N | Dismiss dialog |
| Escape | Dismiss dialog (same as No) |

All other keys are ignored while the dialog is visible.

**File:** New component `src/tui/components/confirm-dialog.tsx`

#### Cancellation Mechanics

A new `cancelRun` action is added to the `useTestRun` hook.

**Process termination:**

- `runTest()` and `gradeTest()` return handles (EventEmitters). The hook stores references to all active handles in a `Map<string, RunHandle | GradeHandle>`.
- `cancelRun()` calls a `kill()` method on each active handle, which sends SIGTERM to the underlying child process.
- Neither `RunHandle` nor `GradeHandle` currently expose a `kill()` method. Both interfaces must be extended with `kill(): void`. The implementations in `runner.ts` and `grader.ts` must store a reference to the spawned child process and terminate it when `kill()` is called.

**Status transitions on cancel:**

| Current status | Transitions to |
|---|---|
| `running` | `cancelled` |
| `grading` | `cancelled` |
| `pending` | `cancelled` |
| `passed` / `failed` / `timedout` / `error` | No change (already terminal) |

**New TestStatus value:** `cancelled` is added to the `TestStatus` union type.

**Progress tree icon:** `⊘` in gray for cancelled tests.

**Run completion after cancel:**

- Run status transitions to `'complete'`
- Timer stops
- No report is generated
- No stats are recorded
- The bottom bar returns to its completed-run display with `[Esc] back`

**Files:** `src/tui/hooks/use-test-run.ts`, `src/types/run.ts`, `src/tui/components/confirm-dialog.tsx`, `src/tui/app.tsx`, `src/tui/components/progress-tree.tsx`

### 4. Session Panel Scrollbar

A visual scrollbar on the right edge of the transcript content area in the session panel.

#### Scrollbar Component

A new `Scrollbar` component that renders a vertical column of block characters:

- `░` (light shade, U+2591) for the track
- `█` (full block, U+2588) for the thumb

**Props:**

```typescript
interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number; // lines from bottom
  height: number;       // available rows for the scrollbar
}
```

**Thumb sizing:**

- Thumb height = `max(1, round(height * visibleLines / totalLines))`
- Minimum of 1 character so the thumb is always visible

**Thumb positioning:**

- When `scrollOffset === 0` (following / at bottom): thumb at bottom of track
- As `scrollOffset` increases (scrolling up): thumb moves toward top
- Position = `round((1 - scrollOffset / maxOffset) * (height - thumbHeight))`

**Visibility rule:** The scrollbar only renders when `totalLines > visibleLines`. During the early moments of a run when content fits the panel, no scrollbar appears.

#### Integration with SessionPanel

The session panel's content area becomes a flex row:

```
┌─ Session Panel ──────────────────────────┐
│ TestName [Running] 12s                   │
│ [Execution] | Grading  [t] toggle        │
│ ┌─ content ──────────────────────┐ ┌─┐  │
│ │ markdown transcript lines...   │ │░│  │
│ │ more content here              │ │░│  │
│ │ even more lines                │ │█│  │
│ │ latest output                  │ │█│  │
│ └────────────────────────────────┘ │░│  │
│                                    └─┘  │
│ [f] follow                              │
└──────────────────────────────────────────┘
```

The scrollbar column is 1 character wide with a small left margin for visual separation.

**File:** New component `src/tui/components/scrollbar.tsx`, modified `src/tui/components/session-panel.tsx`

### 5. Editable Options Screen

The Options screen is currently read-only. It displays config values but provides no way to edit them. This change makes every field interactively editable using `@inkjs/ui` components (already installed).

**Field types and editors:**

| Type | Fields | Editor | Controls |
|---|---|---|---|
| Enum | tool, format, log-level | `Select` from `@inkjs/ui` | Up/Down to browse, Enter to confirm |
| Boolean | show-passing-details | Toggle inline | Space or Enter flips the value |
| Number | max-turns, concurrency | `TextInput` from `@inkjs/ui` | Type digits, Enter to confirm |
| String | model, timeout, setup, teardown | `TextInput` from `@inkjs/ui` | Type value, Enter to confirm |

**Enum valid values:**

- `tool`: keys of `TOOL_PROFILES` from `src/core/runner.ts` (currently `['claude']`; future additions are automatic)
- `format`: `['interactive', 'json']`
- `log-level`: `['debug', 'verbose', 'info', 'success', 'warn', 'error']`

**Interaction flow:**

1. Navigate fields with Up/Down (as today)
2. Press Enter on a field to activate its inline editor
3. The static value text is replaced by the appropriate editor component
4. Enter confirms the edit; Escape cancels and reverts to the previous value
5. Edits are held in local component state until the user presses `[s]` to save
6. Save writes the updated config to `.skill-unit.yml` via `onSave` and shows a confirmation flash

**Unsaved changes indicator:** If any field has been modified but not yet saved, a `(unsaved changes)` hint appears next to the footer help text.

**Updated footer:** `[Enter] edit  [Esc] cancel  [s] save  [up/down] navigate`

**File:** `src/tui/screens/options.tsx`

## Bottom Bar States (Summary)

| Context | Bottom bar content |
|---|---|
| Dashboard / Runs / Stats / Options | `[D]ashboard [R]uns [S]tats [O]ptions  Tab: next [Q]uit` |
| Runner (idle/complete) | `[D]ashboard [R]uns [S]tats [O]ptions  [Esc] back  Tab: next [Q]uit` |
| Runner (running, primary view) | `Run in progress...  [Esc] cancel  ← → sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split` |
| Runner (running, split view) | `Run in progress...  [Esc] cancel  [1-9] focus  [m] maximize  [v] primary` |
| Runner (complete, primary view) | `[Space] select  [Enter] re-run  ← → sessions  [Esc] back` |

## New Files

| File | Purpose |
|---|---|
| `src/tui/components/confirm-dialog.tsx` | Modal yes/no confirmation dialog |
| `src/tui/components/scrollbar.tsx` | Visual scrollbar track + thumb |

## Modified Files

| File | Changes |
|---|---|
| `src/tui/app.tsx` | `previousScreen` state, nav lock during run, dialog state, Escape/Backspace handling, pass new props to BottomBar and Runner |
| `src/tui/components/bottom-bar.tsx` | Accept run status + screen context props, render contextual hint modes |
| `src/tui/screens/runner.tsx` | Remove inline footer (hints move to bottom bar), wire cancel dialog trigger |
| `src/tui/components/session-panel.tsx` | Add Scrollbar to content area layout |
| `src/tui/components/progress-tree.tsx` | Add `cancelled` status icon (`⊘` gray) |
| `src/tui/hooks/use-test-run.ts` | Add `cancelRun` action, store active handles, implement process termination |
| `src/types/run.ts` | Add `'cancelled'` to `TestStatus` union |
| `src/tui/screens/options.tsx` | Full rewrite: inline editors per field type using `@inkjs/ui` components, edit mode state, unsaved changes tracking, config serialization on save |

## Architecture Doc Updates

After implementation, update `docs/architecture/tui-design.md`:

- Add back navigation and `previousScreen` to the App Shell section
- Add navigation lock behavior to the Screen Architecture section
- Add cancel run flow to the Data Flow section
- Update the Keyboard Navigation table with Escape, Backspace, and cancel dialog keys
- Add `cancelled` to the TestStatus documentation
- Document the scrollbar component in the Component Hierarchy
- Update the Options screen description to reflect editable fields and inline editors
