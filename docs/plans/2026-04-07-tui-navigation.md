# TUI Navigation & UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add back-navigation, navigation locking during runs, run cancellation with a confirmation dialog, a visual scrollbar, and editable options to the skill-unit TUI.

**Architecture:** The Runner screen becomes a modal context: global nav is locked while a run is active, Escape opens a cancel dialog, and Escape/Backspace navigate back when idle or complete. The bottom bar becomes context-aware, switching its hints based on run state. A new Scrollbar component renders alongside transcript content. The Options screen gains inline editors using `@inkjs/ui` components.

**Tech Stack:** React (Ink), TypeScript, `@inkjs/ui` (Select, TextInput), Vitest, ink-testing-library

**Spec:** `docs/specs/2026-04-07-tui-navigation-design.md`

---

### Task 1: Add `cancelled` to TestStatus

**Files:**
- Modify: `src/types/run.ts:1`
- Modify: `src/tui/components/progress-tree.tsx:19-36`
- Test: `tests/tui/runner.spec.tsx`

- [ ] **Step 1: Update TestStatus type**

In `src/types/run.ts`, add `'cancelled'` to the union:

```typescript
export type TestStatus = 'pending' | 'running' | 'grading' | 'passed' | 'failed' | 'timedout' | 'error' | 'cancelled';
```

- [ ] **Step 2: Add cancelled icon to ProgressTree**

In `src/tui/components/progress-tree.tsx`, add a case to `statusIcon`:

```typescript
case 'cancelled':
  return { symbol: '⊘', color: 'gray' };
```

- [ ] **Step 3: Include cancelled in the completed count**

In `src/tui/components/progress-tree.tsx`, update the `completed` filter (line 52) to also count cancelled:

```typescript
const completed = tests.filter(
  t => t.status === 'passed' || t.status === 'failed' || t.status === 'timedout' || t.status === 'error' || t.status === 'cancelled',
).length;
```

- [ ] **Step 4: Write test for cancelled status icon**

Add to `tests/tui/runner.spec.tsx` inside the `ProgressTree` describe:

```tsx
it('when a test is cancelled should show the cancelled icon', () => {
  // Arrange
  const tests = [
    { id: 'TEST-1', name: 'cancelled-test', status: 'cancelled' as const, durationMs: 0 },
  ];

  // Act
  const { lastFrame } = render(<ProgressTree tests={tests} elapsed={0} />);

  // Assert
  expect(lastFrame()!).toContain('⊘');
  expect(lastFrame()!).toContain('cancelled-test');
});
```

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/tui/runner.spec.tsx`
Expected: All tests pass

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: No errors. This validates that every switch statement and comparison on `TestStatus` handles the new value (the compiler will flag any exhaustiveness gaps).

- [ ] **Step 7: Commit**

```bash
git add src/types/run.ts src/tui/components/progress-tree.tsx tests/tui/runner.spec.tsx
git commit -m "feat: add 'cancelled' to TestStatus with progress tree icon"
```

---

### Task 2: Add `kill()` to RunHandle and GradeHandle

**Files:**
- Modify: `src/core/runner.ts:191-197,449-466`
- Modify: `src/core/grader.ts:37-40,135-190`

The `RunHandle` and `GradeHandle` interfaces currently have no way to terminate the underlying child process. Both need a `kill()` method.

- [ ] **Step 1: Extend RunHandle interface**

In `src/core/runner.ts`, add `kill()` to the interface:

```typescript
export interface RunHandle extends EventEmitter {
  on(event: 'output', listener: (chunk: string) => void): this;
  on(event: 'tool-use', listener: (name: string, input: unknown) => void): this;
  on(event: 'progress', listener: (progress: RunProgress) => void): this;
  on(event: 'complete', listener: (result: { exitCode: number; timedOut: boolean; durationMs: number; costUsd: number; inputTokens: number; outputTokens: number }) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(): void;
}
```

- [ ] **Step 2: Store proc reference and implement kill() in runTest**

In `src/core/runner.ts`, modify the `runTest` function to attach a `kill` method to the handle. The child process is spawned inside `_runTestAsync`, so we use a callback to capture the reference:

```typescript
export function runTest(
  manifest: Manifest,
  testCase: ManifestTestCase,
  config: SkillUnitConfig,
  options?: RunTestOptions,
): RunHandle {
  const handle = new EventEmitter() as RunHandle;
  const silent = options?.silent ?? false;
  let proc: import('node:child_process').ChildProcess | null = null;

  handle.kill = () => {
    if (proc) {
      proc.kill('SIGTERM');
    }
  };

  setImmediate(() => {
    _runTestAsync(manifest, testCase, config, handle, silent, (p) => { proc = p; }).catch((err: Error) => {
      handle.emit('error', err);
    });
  });

  return handle;
}
```

Update `_runTestAsync` signature to accept a `setProcRef` callback:

```typescript
async function _runTestAsync(
  manifest: Manifest,
  testCase: ManifestTestCase,
  config: SkillUnitConfig,
  handle: RunHandle,
  silent: boolean,
  setProcRef?: (proc: import('node:child_process').ChildProcess) => void,
): Promise<void> {
```

After the `spawn()` call (line 252), add:

```typescript
if (setProcRef) setProcRef(proc);
```

- [ ] **Step 3: Extend GradeHandle interface**

In `src/core/grader.ts`, add `kill()` to the interface:

```typescript
export interface GradeHandle extends EventEmitter {
  on(event: 'output', listener: (chunk: string) => void): this;
  on(event: 'complete', listener: (result: GradeResult) => void): this;
  kill(): void;
}
```

- [ ] **Step 4: Implement kill() in gradeTest**

In `src/core/grader.ts`, modify `spawnGrader` to accept an optional callback:

```typescript
function spawnGrader(
  tool: string,
  cliArgs: string[],
  prompt: string,
  setProcRef?: (proc: import('node:child_process').ChildProcess) => void,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(tool, cliArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (setProcRef) setProcRef(proc);
    // ... rest unchanged
```

In `gradeTest`, add `kill()` to the handle:

```typescript
export function gradeTest(...): GradeHandle {
  const handle = new EventEmitter() as GradeHandle;
  let proc: import('node:child_process').ChildProcess | null = null;

  handle.kill = () => {
    if (proc) {
      proc.kill('SIGTERM');
    }
  };

  setImmediate(async () => {
    // ... existing code, but pass setProcRef to spawnGrader:
    const { exitCode, stdout, stderr } = await spawnGrader(tool, cliArgs, prompt, (p) => { proc = p; });
    // ... rest unchanged
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Run tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/core/runner.ts src/core/grader.ts
git commit -m "feat: add kill() method to RunHandle and GradeHandle"
```

---

### Task 3: Add `cancelRun` to useTestRun hook

**Files:**
- Modify: `src/tui/hooks/use-test-run.ts`

- [ ] **Step 1: Import handle types**

At the top of `src/tui/hooks/use-test-run.ts`, add imports:

```typescript
import type { RunHandle } from '../../core/runner.js';
import type { GradeHandle } from '../../core/grader.js';
```

- [ ] **Step 2: Add handle tracking ref**

Inside `useTestRun`, add a ref to store active handles:

```typescript
const activeHandles = useRef<Map<string, RunHandle | GradeHandle>>(new Map());
```

- [ ] **Step 3: Store handles when created**

In the `executeRun` callback, after `runTest()` returns a handle, store it:

```typescript
const handle = runTest(task.manifest, task.testCase, config, { silent: true });
activeHandles.current.set(task.testCase.id, handle);
```

Similarly, in `startGrading`, after `gradeTest()` returns:

```typescript
const gradeHandle = gradeTest(fullTestCase, transcriptPath, config, specName, timestamp);
activeHandles.current.set(task.testCase.id, gradeHandle);
```

In each `complete` handler (both execution and grading), remove the handle:

```typescript
activeHandles.current.delete(task.testCase.id);
```

- [ ] **Step 4: Implement cancelRun**

Add the `cancelRun` callback:

```typescript
const cancelRun = useCallback(() => {
  // Kill all active processes
  for (const handle of activeHandles.current.values()) {
    handle.kill();
  }
  activeHandles.current.clear();

  // Transition all non-terminal tests to cancelled
  setState(prev => ({
    ...prev,
    status: 'complete',
    tests: prev.tests.map(t => {
      if (t.status === 'pending' || t.status === 'running' || t.status === 'grading') {
        return { ...t, status: 'cancelled' as const, activity: '' };
      }
      return t;
    }),
  }));

  // Stop timers
  if (timerRef.current !== null) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }
  if (flushTimerRef.current !== null) {
    clearInterval(flushTimerRef.current);
    flushTimerRef.current = null;
  }

  // Flush any remaining transcript data
  flushTranscripts();
}, [flushTranscripts]);
```

- [ ] **Step 5: Export cancelRun in actions**

Update the `TestRunActions` interface:

```typescript
export interface TestRunActions {
  startRun: (tests: Array<{ id: string; name: string; specName: string }>) => void;
  executeRun: (manifests: Manifest[], specs: Spec[], config: SkillUnitConfig, timestamp: string) => void;
  selectTest: (id: string) => void;
  updateTest: (id: string, patch: Partial<TestRunEntry>) => void;
  completeRun: () => void;
  cancelRun: () => void;
}
```

Update the actions object at the bottom of the hook:

```typescript
const actions: TestRunActions = { startRun, executeRun, selectTest, updateTest, completeRun, cancelRun };
```

- [ ] **Step 6: Clear handles on startRun**

In `startRun`, add at the beginning:

```typescript
activeHandles.current.clear();
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/tui/hooks/use-test-run.ts
git commit -m "feat: add cancelRun action to useTestRun hook"
```

---

### Task 4: Create ConfirmDialog component

**Files:**
- Create: `src/tui/components/confirm-dialog.tsx`
- Test: `tests/tui/confirm-dialog.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/tui/confirm-dialog.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ConfirmDialog } from '../../src/tui/components/confirm-dialog.js';

describe('ConfirmDialog', () => {
  it('should render the message and yes/no options', () => {
    // Act
    const { lastFrame } = render(
      <ConfirmDialog message="Cancel the run?" onConfirm={() => {}} onDismiss={() => {}} />,
    );

    // Assert
    const output = lastFrame()!;
    expect(output).toContain('Cancel the run?');
    expect(output).toContain('[Y]es');
    expect(output).toContain('[N]o');
  });

  describe('when Y is pressed', () => {
    it('should call onConfirm', () => {
      // Arrange
      const onConfirm = vi.fn();
      const { stdin } = render(
        <ConfirmDialog message="Cancel?" onConfirm={onConfirm} onDismiss={() => {}} />,
      );

      // Act
      stdin.write('y');

      // Assert
      expect(onConfirm).toHaveBeenCalledOnce();
    });
  });

  describe('when N is pressed', () => {
    it('should call onDismiss', () => {
      // Arrange
      const onDismiss = vi.fn();
      const { stdin } = render(
        <ConfirmDialog message="Cancel?" onConfirm={() => {}} onDismiss={onDismiss} />,
      );

      // Act
      stdin.write('n');

      // Assert
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });

  describe('when Escape is pressed', () => {
    it('should call onDismiss', () => {
      // Arrange
      const onDismiss = vi.fn();
      const { stdin } = render(
        <ConfirmDialog message="Cancel?" onConfirm={() => {}} onDismiss={onDismiss} />,
      );

      // Act
      stdin.write('\x1B');

      // Assert
      expect(onDismiss).toHaveBeenCalledOnce();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tui/confirm-dialog.spec.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement ConfirmDialog**

Create `src/tui/components/confirm-dialog.tsx`:

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmDialog({ message, onConfirm, onDismiss }: ConfirmDialogProps) {
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onDismiss();
    }
  });

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        paddingX={4}
        paddingY={1}
      >
        <Text bold>{message}</Text>
        <Text>
          <Text color="green">[Y]</Text>
          <Text>es / </Text>
          <Text color="red">[N]</Text>
          <Text>o</Text>
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/tui/confirm-dialog.spec.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/confirm-dialog.tsx tests/tui/confirm-dialog.spec.tsx
git commit -m "feat: add ConfirmDialog component"
```

---

### Task 5: Create Scrollbar component

**Files:**
- Create: `src/tui/components/scrollbar.tsx`
- Test: `tests/tui/scrollbar.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/tui/scrollbar.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Scrollbar } from '../../src/tui/components/scrollbar.js';

describe('Scrollbar', () => {
  describe('when content fits the viewport', () => {
    it('should render nothing', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar totalLines={10} visibleLines={20} scrollOffset={0} height={10} />,
      );

      // Assert
      expect(lastFrame()!.trim()).toBe('');
    });
  });

  describe('when content overflows the viewport', () => {
    it('should render a track with thumb characters', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar totalLines={100} visibleLines={20} scrollOffset={0} height={10} />,
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('█');
      expect(output).toContain('░');
    });
  });

  describe('when scrollOffset is 0 (at bottom)', () => {
    it('should place the thumb at the bottom of the track', () => {
      // Act
      const { lastFrame } = render(
        <Scrollbar totalLines={100} visibleLines={20} scrollOffset={0} height={10} />,
      );
      const lines = lastFrame()!.split('\n');

      // Assert -- last non-empty line should be thumb
      const nonEmpty = lines.filter(l => l.trim());
      expect(nonEmpty[nonEmpty.length - 1]).toContain('█');
    });
  });

  describe('when scrollOffset is at maximum (at top)', () => {
    it('should place the thumb at the top of the track', () => {
      // Arrange -- maxOffset = 100 - 20 = 80
      const { lastFrame } = render(
        <Scrollbar totalLines={100} visibleLines={20} scrollOffset={80} height={10} />,
      );
      const lines = lastFrame()!.split('\n');

      // Assert -- first non-empty line should be thumb
      const nonEmpty = lines.filter(l => l.trim());
      expect(nonEmpty[0]).toContain('█');
    });
  });

  describe('when thumb size is proportional', () => {
    it('should have a larger thumb when more content is visible', () => {
      // Arrange
      const { lastFrame: small } = render(
        <Scrollbar totalLines={200} visibleLines={10} scrollOffset={0} height={20} />,
      );
      const { lastFrame: large } = render(
        <Scrollbar totalLines={40} visibleLines={10} scrollOffset={0} height={20} />,
      );

      // Assert
      const countThumb = (s: string) => (s.match(/█/g) || []).length;
      expect(countThumb(large()!)).toBeGreaterThan(countThumb(small()!));
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tui/scrollbar.spec.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement Scrollbar**

Create `src/tui/components/scrollbar.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height: number;
}

export function Scrollbar({ totalLines, visibleLines, scrollOffset, height }: ScrollbarProps) {
  if (totalLines <= visibleLines || height <= 0) {
    return <Box />;
  }

  const thumbHeight = Math.max(1, Math.round(height * visibleLines / totalLines));
  const maxOffset = Math.max(0, totalLines - visibleLines);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  // scrollOffset=0 means bottom, scrollOffset=maxOffset means top
  // thumbTop=0 means top of track, thumbTop=(height-thumbHeight) means bottom
  const thumbTop = maxOffset > 0
    ? Math.round((clampedOffset / maxOffset) * (height - thumbHeight))
    : 0;

  // Invert: high scrollOffset = top of content = thumb at top of track
  const invertedTop = height - thumbHeight - thumbTop;

  const rows: string[] = [];
  for (let i = 0; i < height; i++) {
    if (i >= invertedTop && i < invertedTop + thumbHeight) {
      rows.push('█');
    } else {
      rows.push('░');
    }
  }

  return (
    <Box flexDirection="column" width={1} marginLeft={1}>
      {rows.map((char, i) => (
        <Text key={i} color="gray">{char}</Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/tui/scrollbar.spec.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/scrollbar.tsx tests/tui/scrollbar.spec.tsx
git commit -m "feat: add Scrollbar component"
```

---

### Task 6: Integrate Scrollbar into SessionPanel

**Files:**
- Modify: `src/tui/components/session-panel.tsx`
- Modify: `tests/tui/session-panel.spec.tsx`

- [ ] **Step 1: Write test for scrollbar visibility**

Add to `tests/tui/session-panel.spec.tsx`:

```tsx
describe('when transcript overflows the panel', () => {
  it('should show a scrollbar', () => {
    // Arrange
    const manyLines = Array.from({ length: 50 }, (_, i) => `line-${i}`);

    // Act
    const { lastFrame } = render(
      <SessionPanel testId="TEST-1" testName="test" status="running" transcript={manyLines} gradeTranscript={[]} elapsed={0} viewMode="execution" scrollOffset={0} following={true} />,
    );

    // Assert
    expect(lastFrame()!).toContain('░');
  });
});

describe('when transcript fits the panel', () => {
  it('should not show a scrollbar', () => {
    // Act
    const { lastFrame } = render(
      <SessionPanel testId="TEST-1" testName="test" status="running" transcript={['short']} gradeTranscript={[]} elapsed={0} viewMode="execution" />,
    );

    // Assert
    expect(lastFrame()!).not.toContain('░');
    expect(lastFrame()!).not.toContain('█');
  });
});
```

- [ ] **Step 2: Import Scrollbar and integrate**

In `src/tui/components/session-panel.tsx`, add the import:

```typescript
import { Scrollbar } from './scrollbar.js';
```

Replace the existing content area (the `<Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">` block and its contents) with a flex row containing the content and scrollbar:

```tsx
<Box flexDirection="row" flexGrow={1} overflow="hidden">
  <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
    {activeTranscript.length === 0 ? (
      <Text color="gray">Waiting for output...</Text>
    ) : (
      <Markdown content={slicedLines.join('\n')} />
    )}
  </Box>
  <Scrollbar
    totalLines={allLines.length}
    visibleLines={visibleLines}
    scrollOffset={effectiveOffset}
    height={visibleLines}
  />
</Box>
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- tests/tui/session-panel.spec.tsx`
Expected: All tests pass (existing + new)

- [ ] **Step 4: Commit**

```bash
git add src/tui/components/session-panel.tsx tests/tui/session-panel.spec.tsx
git commit -m "feat: integrate scrollbar into session panel"
```

---

### Task 7: Context-aware BottomBar

**Files:**
- Modify: `src/tui/components/bottom-bar.tsx`
- Modify: `tests/tui/bottom-bar.spec.tsx`

- [ ] **Step 1: Write tests for new bottom bar states**

Add to `tests/tui/bottom-bar.spec.tsx`:

```tsx
describe('when on runner screen with completed run', () => {
  it('should show Esc back hint', () => {
    // Act
    const { lastFrame } = render(
      <BottomBar activeScreen="runner" runStatus="complete" runViewMode="primary" />,
    );

    // Assert
    expect(lastFrame()!).toContain('[Esc] back');
  });
});

describe('when on runner screen with active run in primary view', () => {
  it('should show run-mode hints instead of nav', () => {
    // Act
    const { lastFrame } = render(
      <BottomBar activeScreen="runner" runStatus="running" runViewMode="primary" />,
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('Run in progress');
    expect(output).toContain('[Esc] cancel');
    expect(output).not.toContain('[D]');
  });
});

describe('when on runner screen with active run in split view', () => {
  it('should show split-mode hints', () => {
    // Act
    const { lastFrame } = render(
      <BottomBar activeScreen="runner" runStatus="running" runViewMode="split" />,
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('[Esc] cancel');
    expect(output).toContain('focus');
    expect(output).toContain('maximize');
  });
});

describe('when on runner screen with complete run in primary view', () => {
  it('should show selection and re-run hints', () => {
    // Act
    const { lastFrame } = render(
      <BottomBar activeScreen="runner" runStatus="complete" runViewMode="primary" />,
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('[Space] select');
    expect(output).toContain('[Enter] re-run');
    expect(output).toContain('[Esc] back');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tui/bottom-bar.spec.tsx`
Expected: FAIL (props don't match current interface)

- [ ] **Step 3: Update BottomBar component**

Rewrite `src/tui/components/bottom-bar.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

export type Screen = 'dashboard' | 'runs' | 'stats' | 'options' | 'runner';
export type RunViewMode = 'primary' | 'split';

interface BottomBarProps {
  activeScreen: Screen;
  runStatus?: 'idle' | 'running' | 'complete';
  runViewMode?: RunViewMode;
}

export function BottomBar({ activeScreen, runStatus, runViewMode }: BottomBarProps) {
  const isRunner = activeScreen === 'runner';
  const isRunning = isRunner && runStatus === 'running';

  // Running: show contextual runner hints
  if (isRunning) {
    const hints = runViewMode === 'split'
      ? '[Esc] cancel  [1-9] focus  [m] maximize  [v] primary'
      : '[Esc] cancel  ← → sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split';

    return (
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
        <Box flexGrow={1}>
          <Text color="yellow" bold>Run in progress... </Text>
          <Text color="gray">{hints}</Text>
        </Box>
      </Box>
    );
  }

  // Runner complete/idle: show completion hints
  if (isRunner) {
    const completionHints = runViewMode === 'primary'
      ? '[Space] select  [Enter] re-run  ← → sessions  [Esc] back'
      : '[1-9] focus  [m] maximize  [v] primary  [Esc] back';

    return (
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
        <Box flexGrow={1}>
          <Text color="gray">{completionHints}</Text>
        </Box>
      </Box>
    );
  }

  // Standard nav bar for top-level screens
  const items: Array<{ key: string; label: string; screen: Screen }> = [
    { key: 'D', label: 'Dashboard', screen: 'dashboard' },
    { key: 'R', label: 'Runs', screen: 'runs' },
    { key: 'S', label: 'Stats', screen: 'stats' },
    { key: 'O', label: 'Options', screen: 'options' },
  ];

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Box flexGrow={1}>
        {items.map((item) => (
          <Box key={item.key} marginRight={2}>
            <Text
              bold={activeScreen === item.screen}
              color={activeScreen === item.screen ? 'white' : 'gray'}
            >
              [{item.key}]{item.label.slice(1)}
            </Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">Tab: next  [Q]uit  skill-unit v0.0.1</Text>
    </Box>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/tui/bottom-bar.spec.tsx`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/bottom-bar.tsx tests/tui/bottom-bar.spec.tsx
git commit -m "feat: context-aware bottom bar with run-mode hints"
```

---

### Task 8: Wire up App shell -- back navigation, nav lock, cancel dialog

**Files:**
- Modify: `src/tui/app.tsx`
- Modify: `src/tui/screens/runner.tsx` (remove inline footer, report view mode)

- [ ] **Step 1: Add state and imports to app.tsx**

Add imports:

```typescript
import { ConfirmDialog } from './components/confirm-dialog.js';
import type { RunViewMode } from './components/bottom-bar.js';
```

Add state variables inside `App()`:

```typescript
const [previousScreen, setPreviousScreen] = useState<Screen>('dashboard');
const [showCancelDialog, setShowCancelDialog] = useState(false);
const [runnerViewMode, setRunnerViewMode] = useState<RunViewMode>('primary');
```

Update hook destructuring:

```typescript
const [runState, { startRun, executeRun, selectTest, cancelRun }] = useTestRun();
```

- [ ] **Step 2: Track previousScreen on navigation to runner**

In the dashboard's `onRunTests` handler, before `setScreen('runner')`:

```typescript
setPreviousScreen('dashboard');
```

In `handleViewRun`, before `setScreen('runner')`:

```typescript
setPreviousScreen('runs');
```

- [ ] **Step 3: Update useInput handler with nav lock and back navigation**

Replace the existing `useInput` handler in `app.tsx`:

```typescript
useInput((input, key) => {
  // Cancel dialog is modal -- absorb all input
  if (showCancelDialog) return;

  const isRunnerActive = screen === 'runner' && runState.status === 'running';

  // Escape handling
  if (key.escape) {
    if (isRunnerActive) {
      setShowCancelDialog(true);
      return;
    }
    if (screen === 'runner') {
      setScreen(previousScreen);
      return;
    }
    return;
  }

  // Backspace = back from runner (only when not running)
  if (key.backspace || key.delete) {
    if (screen === 'runner' && !isRunnerActive) {
      setScreen(previousScreen);
      return;
    }
  }

  // Block all global nav during active run
  if (isRunnerActive) return;

  if (input === 'd' || input === 'D') setScreen('dashboard');
  if (input === 'r' || input === 'R') setScreen('runs');
  if (input === 's' || input === 'S') setScreen('stats');
  if (input === 'o' || input === 'O') setScreen('options');
  if (key.tab) {
    setScreen(prev => {
      const idx = NAV_SCREENS.indexOf(prev);
      return NAV_SCREENS[(idx + 1) % NAV_SCREENS.length];
    });
  }
  if (input === 'q' || (key.ctrl && input === 'c')) process.exit(0);
});
```

- [ ] **Step 4: Add cancel dialog handlers**

```typescript
function handleCancelConfirm() {
  cancelRun();
  setShowCancelDialog(false);
}

function handleCancelDismiss() {
  setShowCancelDialog(false);
}
```

- [ ] **Step 5: Update JSX to render cancel dialog and pass new BottomBar props**

```tsx
return (
  <Box flexDirection="column" height={termHeight}>
    {showCancelDialog ? (
      <ConfirmDialog
        message="Cancel the run?"
        onConfirm={handleCancelConfirm}
        onDismiss={handleCancelDismiss}
      />
    ) : (
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {screen === 'dashboard' && (
          <Dashboard
            specs={specs}
            onRunTests={tests => {
              setHistoricalRun(null);
              setPreviousScreen('dashboard');
              startRun(
                tests.map(t => ({
                  id: t.testCase.id,
                  name: t.testCase.name,
                  specName: t.specName,
                })),
              );
              setScreen('runner');

              const timestamp = formatTimestamp(new Date());
              const specPathSet = new Set(tests.map(t => t.specPath));
              const selectedSpecs = specs.filter(s => specPathSet.has(s.path));
              const selectedTestIds = new Set(tests.map(t => t.testCase.id));
              const manifests = selectedSpecs.map(spec => {
                const manifest = buildManifest(spec, appConfig, { timestamp });
                manifest['test-cases'] = manifest['test-cases'].filter(tc =>
                  selectedTestIds.has(tc.id),
                );
                return manifest;
              }).filter(m => m['test-cases'].length > 0);

              executeRun(manifests, selectedSpecs, appConfig, timestamp);
            }}
          />
        )}
        {screen === 'runs' && (
          <RunManager
            runs={statsIndex.runs}
            onCleanup={handleCleanup}
            onDeleteRun={handleDeleteRun}
            onViewRun={handleViewRun}
          />
        )}
        {screen === 'stats' && <Statistics index={statsIndex} />}
        {screen === 'options' && (
          <Options config={appConfig} onSave={setAppConfig} />
        )}
        {screen === 'runner' && (
          <Runner
            runState={
              historicalRun
                ? { ...historicalRun, activeTestId: historicalActiveTestId ?? historicalRun.activeTestId }
                : runState
            }
            onSelectTest={historicalRun ? setHistoricalActiveTestId : selectTest}
            onRerunTests={handleRerunTests}
            onViewModeChange={setRunnerViewMode}
          />
        )}
      </Box>
    )}
    <BottomBar
      activeScreen={screen}
      runStatus={screen === 'runner' ? runState.status : undefined}
      runViewMode={screen === 'runner' ? runnerViewMode : undefined}
    />
  </Box>
);
```

- [ ] **Step 6: Update Runner to remove inline footer and report view mode**

In `src/tui/screens/runner.tsx`, add the new prop to `RunnerProps`:

```typescript
interface RunnerProps {
  runState: TestRunState;
  onSelectTest: (id: string) => void;
  onRerunTests?: (testIds: string[]) => void;
  onViewModeChange?: (mode: 'primary' | 'split') => void;
}
```

Update the destructuring:

```typescript
export function Runner({ runState, onSelectTest, onRerunTests, onViewModeChange }: RunnerProps) {
```

Update the `[v]` toggle handler to notify parent:

```typescript
if (input === 'v') {
  setViewMode(prev => {
    const next = prev === 'primary' ? 'split' : 'primary';
    if (onViewModeChange) onViewModeChange(next);
    return next;
  });
  return;
}
```

Add a mount effect to report initial view mode:

```typescript
useEffect(() => {
  if (onViewModeChange) onViewModeChange(viewMode);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

Remove the entire footer block (the `{/* Footer status */}` Box near the bottom of the component):

```tsx
// DELETE THIS:
<Box>
  <Text color="gray">
    {status === 'complete'
      ? '[Space] select  [Enter] re-run  ← → sessions  [D] dashboard'
      : viewMode === 'primary'
        ? '← → sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split view'
        : '[1-9] focus pane  [m] maximize  [v] primary view'}
  </Text>
</Box>
```

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `npm run test`
Expected: All tests pass. Fix any failures caused by the changed BottomBar props or removed Runner footer.

- [ ] **Step 9: Commit**

```bash
git add src/tui/app.tsx src/tui/screens/runner.tsx
git commit -m "feat: back navigation, nav lock during runs, cancel dialog"
```

---

### Task 9: Add YAML serializer to config loader

**Files:**
- Modify: `src/config/loader.ts`
- Test: `tests/core/config-serializer.spec.ts`

The Options screen needs to write config back to `.skill-unit.yml`. The config loader has a YAML parser but no serializer.

- [ ] **Step 1: Write failing tests**

Create `tests/core/config-serializer.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { serializeYaml, parseYaml } from '../../src/config/loader.js';

describe('serializeYaml', () => {
  describe('when serializing scalar values', () => {
    it('should serialize strings, numbers, booleans, and null', () => {
      // Arrange
      const obj = { name: 'test', count: 5, enabled: true, model: null };

      // Act
      const result = serializeYaml(obj);

      // Assert
      expect(result).toContain('name: test');
      expect(result).toContain('count: 5');
      expect(result).toContain('enabled: true');
      expect(result).toContain('model: null');
    });
  });

  describe('when serializing nested objects', () => {
    it('should indent child keys by two spaces', () => {
      // Arrange
      const obj = { runner: { tool: 'claude', concurrency: 5 } };

      // Act
      const result = serializeYaml(obj);

      // Assert
      expect(result).toContain('runner:\n');
      expect(result).toContain('  tool: claude\n');
      expect(result).toContain('  concurrency: 5\n');
    });
  });

  describe('when serializing arrays', () => {
    it('should serialize as inline lists', () => {
      // Arrange
      const obj = { items: ['a', 'b', 'c'] };

      // Act
      const result = serializeYaml(obj);

      // Assert
      expect(result).toContain('items: [a, b, c]');
    });
  });

  describe('when roundtripping through parse and serialize', () => {
    it('should preserve values', () => {
      // Arrange
      const original = {
        'test-dir': 'skill-tests',
        runner: { tool: 'claude', model: null, 'max-turns': 10, concurrency: 5 },
        output: { format: 'interactive', 'show-passing-details': false, 'log-level': 'info' },
        execution: { timeout: '120s' },
        defaults: { setup: 'setup.sh', teardown: 'teardown.sh' },
      };

      // Act
      const yaml = serializeYaml(original);
      const parsed = parseYaml(yaml);

      // Assert
      expect(parsed['test-dir']).toBe('skill-tests');
      expect((parsed.runner as Record<string, unknown>).tool).toBe('claude');
      expect((parsed.runner as Record<string, unknown>).concurrency).toBe(5);
      expect((parsed.output as Record<string, unknown>).format).toBe('interactive');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/core/config-serializer.spec.ts`
Expected: FAIL (serializeYaml not exported)

- [ ] **Step 3: Implement serializeYaml**

Add to `src/config/loader.ts`:

```typescript
export function serializeYaml(obj: Record<string, unknown>): string {
  let output = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      output += `${key}: null\n`;
    } else if (Array.isArray(value)) {
      output += `${key}: [${value.join(', ')}]\n`;
    } else if (typeof value === 'object') {
      output += `${key}:\n`;
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue === null || childValue === undefined) {
          output += `  ${childKey}: null\n`;
        } else if (Array.isArray(childValue)) {
          output += `  ${childKey}: [${childValue.join(', ')}]\n`;
        } else {
          output += `  ${childKey}: ${childValue}\n`;
        }
      }
    } else {
      output += `${key}: ${value}\n`;
    }
  }

  return output;
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/core/config-serializer.spec.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/config/loader.ts tests/core/config-serializer.spec.ts
git commit -m "feat: add YAML serializer for config roundtripping"
```

---

### Task 10: Editable Options screen

**Files:**
- Modify: `src/tui/screens/options.tsx`
- Modify: `tests/tui/options.spec.tsx`

- [ ] **Step 1: Write tests for editing behavior**

Replace `tests/tui/options.spec.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Options } from '../../src/tui/screens/options.js';

const defaultConfig = {
  'test-dir': 'skill-tests',
  runner: { tool: 'claude', model: null, 'max-turns': 10, concurrency: 5 },
  output: { format: 'interactive' as const, 'show-passing-details': false, 'log-level': 'info' as const },
  execution: { timeout: '120s' },
  defaults: { setup: 'setup.sh', teardown: 'teardown.sh' },
};

describe('Options', () => {
  it('should render config fields', () => {
    // Act
    const { lastFrame } = render(<Options config={defaultConfig} onSave={() => {}} />);

    // Assert
    expect(lastFrame()!).toContain('claude');
  });

  it('should show edit hint in footer', () => {
    // Act
    const { lastFrame } = render(<Options config={defaultConfig} onSave={() => {}} />);

    // Assert
    expect(lastFrame()!).toContain('[Enter] edit');
  });

  describe('when a boolean field is toggled', () => {
    it('should show unsaved changes indicator', () => {
      // Arrange
      const { lastFrame, stdin } = render(<Options config={defaultConfig} onSave={() => {}} />);

      // Navigate down to show-passing-details (index 5)
      for (let i = 0; i < 5; i++) {
        stdin.write('\x1B[B'); // down arrow
      }

      // Act -- Enter to toggle boolean
      stdin.write('\r');

      // Assert
      expect(lastFrame()!).toContain('unsaved');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/tui/options.spec.tsx`
Expected: Some tests fail (new tests reference behavior that doesn't exist yet)

- [ ] **Step 3: Rewrite Options component**

Replace `src/tui/screens/options.tsx` with the full editable implementation:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Select, TextInput } from '@inkjs/ui';
import type { SkillUnitConfig, LogLevel } from '../../types/config.js';

interface OptionsProps {
  config: SkillUnitConfig;
  onSave: (config: SkillUnitConfig) => void;
}

type FieldType = 'enum' | 'boolean' | 'number' | 'string';

interface FieldDef {
  section: string;
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  get: (c: SkillUnitConfig) => string;
  set: (c: SkillUnitConfig, v: string) => SkillUnitConfig;
}

const FIELDS: FieldDef[] = [
  {
    section: 'Runner', key: 'tool', label: 'tool', type: 'enum',
    options: ['claude'],
    get: c => c.runner.tool,
    set: (c, v) => ({ ...c, runner: { ...c.runner, tool: v } }),
  },
  {
    section: 'Runner', key: 'model', label: 'model', type: 'string',
    get: c => c.runner.model ?? '',
    set: (c, v) => ({ ...c, runner: { ...c.runner, model: v || null } }),
  },
  {
    section: 'Runner', key: 'max-turns', label: 'max-turns', type: 'number',
    get: c => String(c.runner['max-turns']),
    set: (c, v) => ({ ...c, runner: { ...c.runner, 'max-turns': parseInt(v, 10) || 10 } }),
  },
  {
    section: 'Runner', key: 'concurrency', label: 'concurrency', type: 'number',
    get: c => String(c.runner.concurrency),
    set: (c, v) => ({ ...c, runner: { ...c.runner, concurrency: parseInt(v, 10) || 5 } }),
  },
  {
    section: 'Output', key: 'format', label: 'format', type: 'enum',
    options: ['interactive', 'json'],
    get: c => c.output.format,
    set: (c, v) => ({ ...c, output: { ...c.output, format: v as 'interactive' | 'json' } }),
  },
  {
    section: 'Output', key: 'show-passing-details', label: 'show-passing-details', type: 'boolean',
    get: c => String(c.output['show-passing-details']),
    set: (c, v) => ({ ...c, output: { ...c.output, 'show-passing-details': v === 'true' } }),
  },
  {
    section: 'Output', key: 'log-level', label: 'log-level', type: 'enum',
    options: ['debug', 'verbose', 'info', 'success', 'warn', 'error'],
    get: c => c.output['log-level'],
    set: (c, v) => ({ ...c, output: { ...c.output, 'log-level': v as LogLevel } }),
  },
  {
    section: 'Execution', key: 'timeout', label: 'timeout', type: 'string',
    get: c => c.execution.timeout,
    set: (c, v) => ({ ...c, execution: { ...c.execution, timeout: v } }),
  },
  {
    section: 'Defaults', key: 'setup', label: 'setup', type: 'string',
    get: c => c.defaults.setup,
    set: (c, v) => ({ ...c, defaults: { ...c.defaults, setup: v } }),
  },
  {
    section: 'Defaults', key: 'teardown', label: 'teardown', type: 'string',
    get: c => c.defaults.teardown,
    set: (c, v) => ({ ...c, defaults: { ...c.defaults, teardown: v } }),
  },
];

export function Options({ config, onSave }: OptionsProps) {
  const [cursor, setCursor] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<SkillUnitConfig>(config);
  const [saved, setSaved] = useState(false);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(config);

  useInput((input, key) => {
    if (editingIndex !== null) {
      if (key.escape) {
        setEditingIndex(null);
      }
      return;
    }

    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(FIELDS.length - 1, c + 1));
    } else if (key.return) {
      const field = FIELDS[cursor];
      if (field.type === 'boolean') {
        const current = field.get(draft);
        const toggled = current === 'true' ? 'false' : 'true';
        setDraft(field.set(draft, toggled));
      } else {
        setEditingIndex(cursor);
      }
    } else if (input === 's' || input === 'S') {
      onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  });

  let currentSection = '';

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Options</Text>
        <Text color="gray"> -- .skill-unit.yml</Text>
      </Box>

      {FIELDS.map((field, idx) => {
        const sectionHeader = field.section !== currentSection;
        if (sectionHeader) currentSection = field.section;
        const isActive = idx === cursor;
        const isEditing = idx === editingIndex;
        const value = field.get(draft);

        return (
          <Box key={field.key} flexDirection="column">
            {sectionHeader && (
              <Box marginTop={idx === 0 ? 0 : 1}>
                <Text bold color="cyan">{field.section}</Text>
              </Box>
            )}
            <Box>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}{' '}
              </Text>
              <Text color="gray">{field.label}: </Text>
              {isEditing ? (
                <FieldEditor
                  field={field}
                  value={value}
                  onSubmit={(newValue) => {
                    setDraft(field.set(draft, newValue));
                    setEditingIndex(null);
                  }}
                />
              ) : (
                <Text bold={isActive}>{value || '(none)'}</Text>
              )}
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        {saved ? (
          <Text color="green">Saved.</Text>
        ) : (
          <Text color="gray">
            {'[Enter] edit  [s] save  [up/down] navigate'}
            {hasChanges ? ' ' : ''}
          </Text>
        )}
        {!saved && hasChanges && <Text color="yellow">(unsaved changes)</Text>}
      </Box>
    </Box>
  );
}

function FieldEditor({
  field,
  value,
  onSubmit,
}: {
  field: FieldDef;
  value: string;
  onSubmit: (value: string) => void;
}) {
  if (field.type === 'enum' && field.options) {
    return (
      <Select
        options={field.options.map(o => ({ label: o, value: o }))}
        defaultValue={value}
        onChange={onSubmit}
      />
    );
  }

  return (
    <TextInput
      defaultValue={value}
      onSubmit={onSubmit}
      placeholder={field.label}
    />
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/tui/options.spec.tsx`
Expected: All tests pass

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/tui/screens/options.tsx tests/tui/options.spec.tsx
git commit -m "feat: editable options screen with inline editors"
```

---

### Task 11: Final integration validation

- [ ] **Step 1: Typecheck the entire project**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All tests pass

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Fix any issues found**

Address any type errors, test failures, or lint issues.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address integration issues from TUI polish"
```

---

### Task 12: Update architecture docs

**Files:**
- Modify: `docs/architecture/tui-design.md`

- [ ] **Step 1: Update tui-design.md**

Add the following sections/updates to `docs/architecture/tui-design.md`:

1. **App Shell section:** Add `previousScreen` state and back navigation behavior
2. **Screen Architecture section:** Add navigation lock behavior during active runs
3. **Data Flow section:** Add cancel run flow (Escape -> dialog -> cancelRun -> kill handles -> transition states)
4. **Keyboard Navigation table:** Add Escape (back/cancel), Backspace (back), and cancel dialog keys (Y/N)
5. **TestStatus documentation:** Add `cancelled` status with `⊘` icon
6. **Component Hierarchy:** Add ConfirmDialog and Scrollbar components
7. **Options screen:** Update to reflect editable fields and inline editors using `@inkjs/ui`
8. **Bottom bar:** Document context-aware display modes (standard nav, running hints, complete hints)

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/tui-design.md
git commit -m "docs: update TUI architecture for navigation, cancellation, scrollbar, and options editing"
```
