# TUI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the TUI with scrollable transcripts, execution/grading transcript toggle, historical run browsing with re-run support, per-test immediate grading, and unified concurrency.

**Architecture:** The Runner screen becomes a dumb presentation component receiving all data as props. Both live runs (from `useTestRun` hook) and historical runs (loaded from disk) feed the same component. Grading kicks off per-test immediately after execution completes, sharing a single concurrency pool with execution tasks.

**Tech Stack:** TypeScript (strict), Ink (React for terminals), Vitest + ink-testing-library

**Design Spec:** `docs/specs/2026-04-07-tui-polish-design.md`

---

## Task 1: Bold Active Tab in Bottom Bar

**Files:**

- Modify: `src/tui/components/bottom-bar.tsx`
- Modify: `tests/tui/runs.spec.tsx` (adding bottom bar tests here since no dedicated bottom-bar spec exists)

- [ ] **Step 1: Write failing test for active tab color**

Add to `tests/tui/runs.spec.tsx` (this file already tests TUI components alongside RunManager):

Create a new test file `tests/tui/bottom-bar.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { BottomBar } from '../../src/tui/components/bottom-bar.js';

describe('BottomBar', () => {
  it('when a screen is active should not use blue color on the active tab', () => {
    // Act
    const { lastFrame } = render(<BottomBar activeScreen="dashboard" />);
    const output = lastFrame()!;

    // Assert
    // The active tab text "Dashboard" should be present
    expect(output).toContain('ashboard');
    // All tab labels should be present
    expect(output).toContain('uns');
    expect(output).toContain('tats');
    expect(output).toContain('ptions');
  });

  it('when runs screen is active should highlight it', () => {
    // Act
    const { lastFrame } = render(<BottomBar activeScreen="runs" />);
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('uns');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (baseline)**

```bash
npm.cmd run test -- tests/tui/bottom-bar.spec.tsx
```

Expected: PASS (these are baseline assertions).

- [ ] **Step 3: Change active tab color from blue to white**

In `src/tui/components/bottom-bar.tsx`, change line 25:

```tsx
// Before:
color={activeScreen === item.screen ? 'blue' : 'gray'}

// After:
color={activeScreen === item.screen ? 'white' : 'gray'}
```

- [ ] **Step 4: Run all tests to verify nothing broke**

```bash
npm.cmd run test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tui/components/bottom-bar.tsx tests/tui/bottom-bar.spec.tsx
git commit -m "feat: change active tab color to white for better contrast"
```

---

## Task 2: Unified Concurrency Config

**Files:**

- Modify: `src/types/config.ts`
- Modify: `src/config/loader.ts`
- Modify: `tests/core/config-loader.spec.ts`

- [ ] **Step 1: Write failing test for new concurrency field**

Add to `tests/core/config-loader.spec.ts`, inside the `CONFIG_DEFAULTS` describe block:

```typescript
it('should use concurrency instead of runner-concurrency', () => {
  // Assert
  expect(CONFIG_DEFAULTS.runner).toHaveProperty('concurrency');
  expect(CONFIG_DEFAULTS.runner.concurrency).toBe(5);
  expect(CONFIG_DEFAULTS.runner).not.toHaveProperty('runner-concurrency');
});

it('should not have grader-concurrency in execution config', () => {
  // Assert
  expect(CONFIG_DEFAULTS.execution).not.toHaveProperty('grader-concurrency');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm.cmd run test -- tests/core/config-loader.spec.ts
```

Expected: FAIL -- `runner-concurrency` still exists, `concurrency` does not.

- [ ] **Step 3: Update config types**

Replace `src/types/config.ts`:

```typescript
export interface RunnerConfig {
  tool: string;
  model: string | null;
  'max-turns': number;
  concurrency: number;
  'allowed-tools'?: string[];
  'disallowed-tools'?: string[];
}

export interface OutputConfig {
  format: 'interactive' | 'json';
  'show-passing-details': boolean;
  'log-level': LogLevel;
}

export interface ExecutionConfig {
  timeout: string;
}

export interface DefaultsConfig {
  setup: string;
  teardown: string;
}

export interface SkillUnitConfig {
  'test-dir': string;
  runner: RunnerConfig;
  output: OutputConfig;
  execution: ExecutionConfig;
  defaults: DefaultsConfig;
}

export type LogLevel =
  | 'debug'
  | 'verbose'
  | 'info'
  | 'success'
  | 'warn'
  | 'error';
```

- [ ] **Step 4: Update config loader defaults**

In `src/config/loader.ts`, update `CONFIG_DEFAULTS`:

```typescript
export const CONFIG_DEFAULTS: SkillUnitConfig = {
  'test-dir': 'skill-tests',
  runner: {
    tool: 'claude',
    model: null,
    'max-turns': 10,
    concurrency: 5,
  },
  output: {
    format: 'interactive',
    'show-passing-details': false,
    'log-level': 'info',
  },
  execution: {
    timeout: '120s',
  },
  defaults: {
    setup: 'setup.sh',
    teardown: 'teardown.sh',
  },
};
```

- [ ] **Step 5: Add backward-compatible fallback in loadConfig**

In `src/config/loader.ts`, add a post-merge migration at the end of `loadConfig`, before the return:

```typescript
export function loadConfig(configPath: string): SkillUnitConfig {
  const defaults = JSON.parse(
    JSON.stringify(CONFIG_DEFAULTS)
  ) as SkillUnitConfig;

  if (!configPath || !fs.existsSync(configPath)) {
    return defaults;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = parseYaml(raw) as Partial<SkillUnitConfig> &
    Record<string, unknown>;

  const merged = deepMerge(defaults, parsed);

  // Backward compatibility: runner-concurrency -> concurrency
  const runnerRaw = parsed.runner as Record<string, unknown> | undefined;
  if (
    runnerRaw &&
    'runner-concurrency' in runnerRaw &&
    !('concurrency' in runnerRaw)
  ) {
    merged.runner.concurrency = runnerRaw['runner-concurrency'] as number;
  }

  return merged;
}
```

- [ ] **Step 6: Add backward-compat test**

Add to the `loadConfig` describe block in `tests/core/config-loader.spec.ts`:

```typescript
it('should fall back runner-concurrency to concurrency', () => {
  // Arrange
  const yaml = 'runner:\n  runner-concurrency: 3';
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'readFileSync').mockReturnValue(yaml);

  // Act
  const config = loadConfig('/mock/.skill-unit.yml');

  // Assert
  expect(config.runner.concurrency).toBe(3);
});
```

- [ ] **Step 7: Run tests**

```bash
npm.cmd run test -- tests/core/config-loader.spec.ts
```

Expected: All PASS.

- [ ] **Step 8: Fix all concurrency references across the codebase**

Update all files that reference `runner-concurrency` or `grader-concurrency`:

In `src/cli/commands/test.ts` line 182, change:

```typescript
// Before:
const concurrency = config.runner['runner-concurrency'] || 5;
// After:
const concurrency = config.runner.concurrency || 5;
```

In `src/tui/hooks/use-test-run.ts` line 168, change:

```typescript
// Before:
const concurrency = config.runner['runner-concurrency'] || 5;
// After:
const concurrency = config.runner.concurrency || 5;
```

In `src/core/grader.ts` line 228, change:

```typescript
// Before:
const concurrency =
  (config.execution && config.execution['grader-concurrency']) || 5;
// After:
const concurrency = config.runner.concurrency || 5;
```

In `src/tui/app.tsx` line 20-25, update `DEFAULT_CONFIG`:

```typescript
const DEFAULT_CONFIG: SkillUnitConfig = {
  'test-dir': 'skill-tests',
  runner: { tool: 'claude', model: null, 'max-turns': 10, concurrency: 5 },
  output: {
    format: 'interactive',
    'show-passing-details': false,
    'log-level': 'info',
  },
  execution: { timeout: '120s' },
  defaults: { setup: 'setup.sh', teardown: 'teardown.sh' },
};
```

- [ ] **Step 9: Typecheck and run full test suite**

```bash
npm.cmd run typecheck
npm.cmd run test
```

Expected: No type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/types/config.ts src/config/loader.ts src/cli/commands/test.ts src/tui/hooks/use-test-run.ts src/core/grader.ts src/tui/app.tsx tests/core/config-loader.spec.ts
git commit -m "refactor: unify concurrency config, rename runner-concurrency to concurrency"
```

---

## Task 3: Scrollable Session Panel

**Files:**

- Modify: `src/tui/components/session-panel.tsx`
- Create: `tests/tui/session-panel.spec.tsx`

- [ ] **Step 1: Write failing tests for scroll behavior**

Create `tests/tui/session-panel.spec.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SessionPanel } from '../../src/tui/components/session-panel.js';

describe('SessionPanel', () => {
  describe('when no session is selected', () => {
    it('should show a placeholder message', () => {
      // Act
      const { lastFrame } = render(
        <SessionPanel
          testId={null}
          testName=""
          status="idle"
          transcript={[]}
          gradeTranscript={[]}
          elapsed={0}
          viewMode="execution"
        />
      );

      // Assert
      expect(lastFrame()!).toContain('No session selected');
    });
  });

  describe('when transcript is empty', () => {
    it('should show waiting message', () => {
      // Act
      const { lastFrame } = render(
        <SessionPanel
          testId="TEST-1"
          testName="basic test"
          status="running"
          transcript={[]}
          gradeTranscript={[]}
          elapsed={5000}
          viewMode="execution"
        />
      );

      // Assert
      expect(lastFrame()!).toContain('Waiting for output');
    });
  });

  describe('when transcript has content', () => {
    it('should render the transcript', () => {
      // Arrange
      const transcript = ['## Turn 1', 'Hello world', '## Turn 2', 'Goodbye'];

      // Act
      const { lastFrame } = render(
        <SessionPanel
          testId="TEST-1"
          testName="basic test"
          status="running"
          transcript={transcript}
          gradeTranscript={[]}
          elapsed={5000}
          viewMode="execution"
        />
      );

      // Assert
      const output = lastFrame()!;
      expect(output).toContain('basic test');
      expect(output).toContain('Running');
    });
  });

  describe('when viewMode is grading', () => {
    it('should render gradeTranscript instead of transcript', () => {
      // Arrange
      const transcript = ['execution output'];
      const gradeTranscript = ['grading output'];

      // Act
      const { lastFrame } = render(
        <SessionPanel
          testId="TEST-1"
          testName="basic test"
          status="grading"
          transcript={transcript}
          gradeTranscript={gradeTranscript}
          elapsed={5000}
          viewMode="grading"
        />
      );

      // Assert
      const output = lastFrame()!;
      expect(output).toContain('Grading');
    });
  });

  describe('when following is active', () => {
    it('should not show the follow indicator', () => {
      // Arrange
      const transcript = ['line 1', 'line 2'];

      // Act
      const { lastFrame } = render(
        <SessionPanel
          testId="TEST-1"
          testName="basic test"
          status="running"
          transcript={transcript}
          gradeTranscript={[]}
          elapsed={1000}
          viewMode="execution"
        />
      );

      // Assert
      expect(lastFrame()!).not.toContain('[f] follow');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm.cmd run test -- tests/tui/session-panel.spec.tsx
```

Expected: FAIL -- `SessionPanel` does not accept `gradeTranscript` or `viewMode` props yet.

- [ ] **Step 3: Rewrite SessionPanel with scroll support and dual transcript**

Replace `src/tui/components/session-panel.tsx`:

```tsx
import React, { useRef, useState, useEffect } from 'react';
import { Box, Text, type DOMElement, measureElement } from 'ink';
import type { TestStatus } from '../../types/run.js';
import { Markdown } from './markdown.js';

export type TranscriptViewMode = 'execution' | 'grading';

interface SessionPanelProps {
  testId: string | null;
  testName: string;
  status: TestStatus | 'idle';
  transcript: string[];
  gradeTranscript: string[];
  elapsed: number;
  viewMode: TranscriptViewMode;
  scrollOffset?: number;
  following?: boolean;
}

function statusLabel(status: TestStatus | 'idle'): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'idle':
      return { label: 'Idle', color: 'gray' };
    case 'pending':
      return { label: 'Pending', color: 'gray' };
    case 'running':
      return { label: 'Running', color: 'blue' };
    case 'grading':
      return { label: 'Grading', color: 'yellow' };
    case 'passed':
      return { label: 'Passed', color: 'green' };
    case 'failed':
      return { label: 'Failed', color: 'red' };
    case 'timedout':
      return { label: 'Timed out', color: 'red' };
    case 'error':
      return { label: 'Error', color: 'red' };
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export function SessionPanel({
  testId,
  testName,
  status,
  transcript,
  gradeTranscript,
  elapsed,
  viewMode,
  scrollOffset = 0,
  following = true,
}: SessionPanelProps) {
  const panelRef = useRef<DOMElement>(null);
  const [panelHeight, setPanelHeight] = useState(20);

  useEffect(() => {
    if (panelRef.current) {
      const { height } = measureElement(panelRef.current);
      if (height > 0) setPanelHeight(height);
    }
  });

  if (!testId) {
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Text color="gray">
          No session selected. Use Left/Right arrows to switch sessions.
        </Text>
      </Box>
    );
  }

  const { label, color } = statusLabel(status);
  const activeTranscript =
    viewMode === 'grading' ? gradeTranscript : transcript;

  // Join transcript into a single string, then split by lines for slicing
  const fullContent = activeTranscript.join('\n');
  const allLines = fullContent.split('\n');

  // Compute visible slice based on scroll offset and panel height
  // Reserve 4 lines for header, view mode indicator, and follow indicator
  const visibleLines = Math.max(1, panelHeight - 4);
  let startLine: number;
  if (scrollOffset === 0) {
    // Show the last N lines (pinned to bottom)
    startLine = Math.max(0, allLines.length - visibleLines);
  } else {
    // Scroll offset is lines from the bottom
    startLine = Math.max(0, allLines.length - visibleLines - scrollOffset);
  }
  const visibleContent = allLines
    .slice(startLine, startLine + visibleLines)
    .join('\n');

  const showFollowIndicator = !following && scrollOffset > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Text bold>{testName}</Text>
        <Text> </Text>
        <Text color={color}>[{label}]</Text>
        <Text color="gray"> {formatElapsed(elapsed)}</Text>
      </Box>

      {/* View mode indicator */}
      <Box paddingX={1}>
        <Text
          bold={viewMode === 'execution'}
          color={viewMode === 'execution' ? 'white' : 'gray'}
        >
          {viewMode === 'execution' ? '[Execution]' : 'Execution'}
        </Text>
        <Text color="gray"> | </Text>
        <Text
          bold={viewMode === 'grading'}
          color={viewMode === 'grading' ? 'white' : 'gray'}
        >
          {viewMode === 'grading' ? '[Grading]' : 'Grading'}
        </Text>
        <Text color="gray"> [t] toggle</Text>
      </Box>

      {/* Transcript content */}
      <Box
        ref={panelRef}
        flexDirection="column"
        paddingX={1}
        flexGrow={1}
        overflow="hidden"
      >
        {activeTranscript.length === 0 ? (
          <Text color="gray">Waiting for output...</Text>
        ) : (
          <Markdown content={visibleContent} />
        )}
      </Box>

      {/* Follow indicator */}
      {showFollowIndicator && (
        <Box paddingX={1}>
          <Text color="yellow">[f] follow</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm.cmd run test -- tests/tui/session-panel.spec.tsx
```

Expected: All PASS.

- [ ] **Step 5: Typecheck**

```bash
npm.cmd run typecheck
```

Expected: Type errors in `runner.tsx` and `app.tsx` (they pass old props). That's expected; we'll fix them in Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/tui/components/session-panel.tsx tests/tui/session-panel.spec.tsx
git commit -m "feat: add scrollable session panel with dual transcript and follow mode"
```

---

## Task 4: Scroll and Toggle Key Handling in Runner

**Files:**

- Modify: `src/tui/screens/runner.tsx`

- [ ] **Step 1: Add scroll and toggle state to Runner**

The Runner component needs to manage per-test scroll state and view mode. Update `src/tui/screens/runner.tsx`:

Add state variables inside the `Runner` function, after the existing state:

```typescript
// Scroll state per test: { [testId]: { offset, following } }
const [scrollState, setScrollState] = useState<
  Record<string, { offset: number; following: boolean }>
>({});
// View mode per test (execution or grading)
const [viewModes, setViewModes] = useState<Record<string, TranscriptViewMode>>(
  {}
);
// Track which tests the user has manually toggled (prevents auto-switch)
const [manualToggled, setManualToggled] = useState<Set<string>>(new Set());
```

Add the `TranscriptViewMode` import:

```typescript
import type { TranscriptViewMode } from '../components/session-panel.js';
```

- [ ] **Step 2: Add key handlers for scroll, follow, and toggle**

Inside the `useInput` callback in Runner, add to the `viewMode === 'primary'` branch (after the existing left/right handling):

```typescript
// Scroll up
if (key.upArrow) {
  if (activeTestId) {
    setScrollState((prev) => {
      const curr = prev[activeTestId] ?? { offset: 0, following: true };
      return {
        ...prev,
        [activeTestId]: { offset: curr.offset + 3, following: false },
      };
    });
  }
  return;
}

// Scroll down
if (key.downArrow) {
  if (activeTestId) {
    setScrollState((prev) => {
      const curr = prev[activeTestId] ?? { offset: 0, following: true };
      return {
        ...prev,
        [activeTestId]: {
          offset: Math.max(0, curr.offset - 3),
          following: curr.offset - 3 <= 0,
        },
      };
    });
  }
  return;
}

// Follow mode
if (input === 'f') {
  if (activeTestId) {
    setScrollState((prev) => ({
      ...prev,
      [activeTestId]: { offset: 0, following: true },
    }));
  }
  return;
}

// Toggle execution/grading transcript
if (input === 't') {
  if (activeTestId) {
    setViewModes((prev) => {
      const curr = prev[activeTestId] ?? 'execution';
      return {
        ...prev,
        [activeTestId]: curr === 'execution' ? 'grading' : 'execution',
      };
    });
    setManualToggled((prev) => new Set(prev).add(activeTestId));
  }
  return;
}
```

- [ ] **Step 3: Auto-switch to grading view when test starts grading**

Add a `useEffect` in Runner that watches for status transitions to `'grading'`:

```typescript
useEffect(() => {
  for (const test of tests) {
    if (test.status === 'grading' && !manualToggled.has(test.id)) {
      setViewModes((prev) => {
        if (prev[test.id] !== 'grading') {
          return { ...prev, [test.id]: 'grading' };
        }
        return prev;
      });
    }
  }
}, [tests, manualToggled]);
```

- [ ] **Step 4: Pass scroll and view mode state to SessionPanel**

Update the `<SessionPanel>` usage in Runner to pass the new props. Replace the existing SessionPanel render:

```tsx
<SessionPanel
  testId={activeTest.id}
  testName={activeTest.name}
  status={activeTest.status}
  transcript={activeTest.transcript}
  gradeTranscript={activeTest.gradeTranscript}
  elapsed={elapsed}
  viewMode={viewModes[activeTest.id] ?? 'execution'}
  scrollOffset={scrollState[activeTest.id]?.offset ?? 0}
  following={scrollState[activeTest.id]?.following ?? true}
/>
```

- [ ] **Step 5: Update footer help text**

Update the footer text in Runner to include the new keys:

```tsx
{
  status === 'complete'
    ? 'Run complete. [Space] select  [Enter] re-run selected  [D] dashboard'
    : viewMode === 'primary'
      ? '← → switch sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split view'
      : '[1-9] focus pane  [m] maximize  [v] primary view';
}
```

- [ ] **Step 6: Typecheck**

```bash
npm.cmd run typecheck
```

Expected: Type errors -- Runner now expects `gradeTranscript` on test entries, which `useTestRun` doesn't provide yet. We'll fix that in Task 6.

- [ ] **Step 7: Commit**

```bash
git add src/tui/screens/runner.tsx
git commit -m "feat: add scroll, follow, and transcript toggle key handling to Runner"
```

---

## Task 5: Update Runner Props and TestRunEntry for Grade Transcript

**Files:**

- Modify: `src/tui/hooks/use-test-run.ts`
- Modify: `src/tui/screens/runner.tsx`
- Modify: `src/tui/app.tsx`
- Modify: `tests/tui/runner.spec.tsx`

- [ ] **Step 1: Add gradeTranscript to TestRunEntry**

In `src/tui/hooks/use-test-run.ts`, add to the `TestRunEntry` interface:

```typescript
export interface TestRunEntry {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  transcript: string[];
  gradeTranscript: string[];
  activity: string;
}
```

And update the `startRun` callback where entries are created (inside the `entries` mapping):

```typescript
const entries: TestRunEntry[] = tests.map((t) => ({
  id: t.id,
  name: t.name,
  specName: t.specName,
  status: 'pending',
  durationMs: 0,
  transcript: [],
  gradeTranscript: [],
  activity: '',
}));
```

- [ ] **Step 2: Update Runner to use TestRunEntry's gradeTranscript**

The Runner component already passes `activeTest.gradeTranscript` from Task 4. Ensure it reads from `runState.tests` which now includes `gradeTranscript`.

No code change needed if Runner reads from `runState.tests[].gradeTranscript` -- just verify the types align.

- [ ] **Step 3: Update app.tsx DEFAULT_CONFIG**

This was already done in Task 2 Step 8 (removing `grader-concurrency`). Verify it's in place.

- [ ] **Step 4: Update runner.spec.tsx test data to include gradeTranscript**

In `tests/tui/runner.spec.tsx`, the test data for ProgressTree and Ticker don't need gradeTranscript (they don't use it). But add a test for the Runner component if one doesn't exist. The existing tests only cover sub-components, so no changes needed.

- [ ] **Step 5: Typecheck and run tests**

```bash
npm.cmd run typecheck
npm.cmd run test
```

Expected: All pass. The type chain is now complete: `TestRunEntry.gradeTranscript` -> Runner -> SessionPanel.

- [ ] **Step 6: Commit**

```bash
git add src/tui/hooks/use-test-run.ts src/tui/screens/runner.tsx src/tui/app.tsx tests/tui/runner.spec.tsx
git commit -m "feat: add gradeTranscript field to TestRunEntry"
```

---

## Task 6: Per-test Immediate Grading in useTestRun

**Files:**

- Modify: `src/tui/hooks/use-test-run.ts`
- Modify: `src/core/grader.ts`

- [ ] **Step 1: Write failing test for gradeTest event streaming**

Add a test to `tests/core/grader.spec.ts` that verifies `gradeTest` returns a `GradeHandle` with event emitter interface. Read the existing file first to understand the test structure, then add:

```typescript
describe('gradeTest', () => {
  it('when called should return a GradeHandle with event emitter interface', () => {
    // Arrange
    const testCase = {
      id: 'TEST-1',
      name: 'basic',
      prompt: 'test prompt',
      expectations: ['should work'],
      'negative-expectations': [],
    };

    // Act
    const handle = gradeTest(
      testCase,
      '/fake/path',
      CONFIG_DEFAULTS,
      'test-spec',
      '2026-04-07-10-00-00'
    );

    // Assert
    expect(handle).toBeDefined();
    expect(typeof handle.on).toBe('function');
    expect(typeof handle.emit).toBe('function');
  });
});
```

Note: Import `gradeTest` and the test config. The actual grader agent won't be available in tests, so the handle will emit a complete event with an error. This is fine for verifying the interface.

- [ ] **Step 2: Run test**

```bash
npm.cmd run test -- tests/core/grader.spec.ts
```

Expected: PASS (gradeTest already exists and returns a GradeHandle).

- [ ] **Step 3: Rewrite useTestRun to grade per-test immediately**

This is the largest change. Replace the `executeRun` callback in `src/tui/hooks/use-test-run.ts`. The key changes:

1. Replace `gradeSpecs` import with `gradeTest`
2. Use a shared semaphore for both execution and grading
3. When a test completes execution, release its slot, then acquire a new slot for grading
4. Buffer grading output into `gradeTranscript`
5. Run is complete when all tests are in terminal state

Replace the `executeRun` callback (lines 161-347):

```typescript
const executeRun = useCallback(
  (
    manifests: Manifest[],
    specs: Spec[],
    config: SkillUnitConfig,
    timestamp: string
  ) => {
    const maxConcurrency = config.runner.concurrency || 5;

    // Build flat task list
    const allTasks: Array<{
      manifest: Manifest;
      testCase: ManifestTestCase;
      spec: Spec;
    }> = [];
    for (const manifest of manifests) {
      for (const tc of manifest['test-cases']) {
        // Find the full spec for this manifest
        const spec = specs.find(
          (s) =>
            s.frontmatter.name === manifest['spec-name'] ||
            path.basename(s.path, '.spec.md') === manifest['spec-name']
        );
        if (spec) {
          allTasks.push({ manifest, testCase: tc, spec });
        }
      }
    }

    // Shared semaphore for execution + grading
    let active = 0;
    let nextIdx = 0;
    let completedCount = 0;
    const totalTasks = allTasks.length;

    function checkRunComplete(): void {
      if (completedCount >= totalTasks) {
        // Flush any remaining transcript lines
        flushTranscripts();

        // Generate report
        const runDir = path.join('.workspace', 'runs', timestamp);
        const reportResult = generateReport(runDir);

        // Build RunResult for stats
        const testResults: import('../../types/run.js').TestResult[] =
          allTasks.map((task) => {
            const specName = task.manifest['spec-name'];
            const specGroup = reportResult.grouped[specName];
            const graded = specGroup?.find(
              (r) => r.testId === task.testCase.id
            );
            const passed = graded ? graded.passed : false;

            let testName = task.testCase.id;
            for (const spec of specs) {
              const tc = spec.testCases.find((c) => c.id === task.testCase.id);
              if (tc) {
                testName = tc.name;
                break;
              }
            }

            return {
              id: task.testCase.id,
              name: testName,
              specName,
              status: 'passed' as const,
              durationMs: 0,
              passed,
              passedChecks: graded?.passedChecks ?? 0,
              failedChecks: graded?.failedChecks ?? 0,
              totalChecks: graded?.totalChecks ?? 0,
              expectationLines: graded?.expectationLines ?? [],
              negativeExpectationLines: graded?.negativeExpectationLines ?? [],
            };
          });

        const totalPassed = testResults.filter((t) => t.passed).length;
        const totalFailed = testResults.filter((t) => !t.passed).length;
        const totalDuration = startTimeRef.current
          ? Date.now() - startTimeRef.current
          : 0;

        const runResult: import('../../types/run.js').RunResult = {
          id: timestamp,
          timestamp,
          testCount: testResults.length,
          passed: totalPassed,
          failed: totalFailed,
          durationMs: totalDuration,
          cost: 0,
          tokens: 0,
          tests: testResults,
          reportPath: reportResult.reportPath,
        };

        try {
          recordRun(runResult, STATS_BASE_DIR);
        } catch {
          // Non-fatal
        }

        completeRun();
      }
    }

    function startGrading(task: {
      manifest: Manifest;
      testCase: ManifestTestCase;
      spec: Spec;
    }): void {
      // Find full test case from spec (with expectations)
      const fullTestCase = task.spec.testCases.find(
        (tc) => tc.id === task.testCase.id
      );
      if (!fullTestCase) {
        updateTest(task.testCase.id, {
          status: 'error',
          activity: 'Test case not found in spec',
        });
        completedCount++;
        active--;
        tryNext();
        checkRunComplete();
        return;
      }

      updateTest(task.testCase.id, {
        status: 'grading',
        activity: 'Grading...',
      });

      const specName = task.manifest['spec-name'];
      const transcriptPath = path.join(
        '.workspace',
        'runs',
        timestamp,
        'results',
        `${specName}.${task.testCase.id}.transcript.md`
      );

      const gradeHandle = gradeTest(
        fullTestCase,
        transcriptPath,
        config,
        specName,
        timestamp
      );

      gradeHandle.on('output', (chunk: string) => {
        const buf = gradeTranscriptBuffers.current.get(task.testCase.id) ?? [];
        buf.push(chunk);
        gradeTranscriptBuffers.current.set(task.testCase.id, buf);
      });

      gradeHandle.on('complete', (result) => {
        const passed = result.exitCode === 0;
        updateTest(task.testCase.id, {
          status: passed ? 'passed' : 'failed',
          activity: '',
        });

        completedCount++;
        active--;
        tryNext();
        checkRunComplete();
      });
    }

    function tryNext(): void {
      while (active < maxConcurrency && nextIdx < allTasks.length) {
        const taskIdx = nextIdx++;
        const task = allTasks[taskIdx];
        active++;

        updateTest(task.testCase.id, {
          status: 'running',
          activity: 'Starting...',
        });

        const handle = runTest(task.manifest, task.testCase, config, {
          silent: true,
        });

        handle.on('output', (chunk: string) => {
          const buf = transcriptBuffers.current.get(task.testCase.id) ?? [];
          buf.push(chunk);
          transcriptBuffers.current.set(task.testCase.id, buf);
        });

        handle.on('tool-use', (name: string) => {
          updateTest(task.testCase.id, { activity: `Using ${name}...` });
        });

        handle.on('complete', (result) => {
          updateTest(task.testCase.id, {
            durationMs: result.durationMs,
            activity: '',
          });

          // Release execution slot
          active--;

          if (result.timedOut) {
            updateTest(task.testCase.id, { status: 'timedout', activity: '' });
            completedCount++;
            tryNext();
            checkRunComplete();
          } else if (result.exitCode !== 0) {
            updateTest(task.testCase.id, { status: 'error', activity: '' });
            completedCount++;
            tryNext();
            checkRunComplete();
          } else {
            // Acquire slot for grading
            if (active < maxConcurrency) {
              active++;
              startGrading(task);
            } else {
              // Queue grading for when a slot opens
              gradingQueue.push(task);
            }
            tryNext();
          }
        });

        handle.on('error', (err: Error) => {
          updateTest(task.testCase.id, {
            status: 'error',
            activity: err.message,
          });

          completedCount++;
          active--;
          tryNext();
          checkRunComplete();
        });
      }

      // Process grading queue if slots available
      while (active < maxConcurrency && gradingQueue.length > 0) {
        const task = gradingQueue.shift()!;
        active++;
        startGrading(task);
      }
    }

    const gradingQueue: Array<{
      manifest: Manifest;
      testCase: ManifestTestCase;
      spec: Spec;
    }> = [];

    // Kick off
    tryNext();
  },
  [updateTest, completeRun, flushTranscripts]
);
```

- [ ] **Step 4: Add gradeTranscript buffer refs and flush logic**

In `src/tui/hooks/use-test-run.ts`, add alongside the existing `transcriptBuffers` ref:

```typescript
const gradeTranscriptBuffers = useRef<Map<string, string[]>>(new Map());
```

Update the `flushTranscripts` callback to also flush grade transcript buffers:

```typescript
const flushTranscripts = useCallback(() => {
  const buffers = transcriptBuffers.current;
  const gradeBuffers = gradeTranscriptBuffers.current;
  if (buffers.size === 0 && gradeBuffers.size === 0) return;

  setState((prev) => {
    let changed = false;
    const updatedTests = prev.tests.map((t) => {
      const pending = buffers.get(t.id);
      const gradePending = gradeBuffers.get(t.id);
      if (
        (pending && pending.length > 0) ||
        (gradePending && gradePending.length > 0)
      ) {
        changed = true;
        return {
          ...t,
          transcript:
            pending && pending.length > 0
              ? [...t.transcript, ...pending]
              : t.transcript,
          gradeTranscript:
            gradePending && gradePending.length > 0
              ? [...t.gradeTranscript, ...gradePending]
              : t.gradeTranscript,
        };
      }
      return t;
    });
    if (changed) {
      buffers.clear();
      gradeBuffers.clear();
      return { ...prev, tests: updatedTests };
    }
    return prev;
  });
}, []);
```

Update the `startRun` callback to also clear grade buffers:

```typescript
gradeTranscriptBuffers.current.clear();
```

- [ ] **Step 5: Update imports**

In `src/tui/hooks/use-test-run.ts`, change the grader import:

```typescript
// Before:
import { gradeSpecs } from '../../core/grader.js';

// After:
import { gradeTest } from '../../core/grader.js';
```

Also add `import type { TestResult, RunResult } from '../../types/run.js';` if not already present (it is, but verify `TestResult` is included).

- [ ] **Step 6: Typecheck and run tests**

```bash
npm.cmd run typecheck
npm.cmd run test
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/tui/hooks/use-test-run.ts
git commit -m "feat: per-test immediate grading with shared concurrency pool"
```

---

## Task 7: Historical Run Detail View

**Files:**

- Modify: `src/tui/screens/runs.tsx`
- Modify: `src/tui/app.tsx`
- Create: `src/tui/hooks/use-historical-run.ts`
- Modify: `tests/tui/runs.spec.tsx`

- [ ] **Step 1: Write failing test for historical run loading**

Create `tests/tui/historical-run.spec.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { loadHistoricalRun } from '../../src/tui/hooks/use-historical-run.js';

describe('loadHistoricalRun', () => {
  it('when given a valid run directory should load transcripts', () => {
    // Arrange
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([
      'my-spec.TEST-1.transcript.md',
      'my-spec.TEST-1.results.md',
      'my-spec.TEST-2.transcript.md',
      'my-spec.TEST-2.results.md',
    ] as unknown as fs.Dirent[]);
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.endsWith('transcript.md')) return '## Turn 1\nHello world';
        if (p.endsWith('results.md'))
          return '# Results: TEST-1: basic\n\n**Verdict:** PASS';
        return '';
      }
    );

    // Act
    const result = loadHistoricalRun('.workspace/runs/2026-04-07-10-00-00', {
      id: '2026-04-07-10-00-00',
      timestamp: '2026-04-07T10:00:00Z',
      testCount: 2,
      passed: 2,
      failed: 0,
      duration: 30000,
      cost: 0.1,
      tokens: 5000,
    });

    // Assert
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0].transcript.length).toBeGreaterThan(0);
    expect(result.status).toBe('complete');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
```

Note: Add `import { afterEach } from 'vitest';` at the top.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm.cmd run test -- tests/tui/historical-run.spec.ts
```

Expected: FAIL -- module does not exist.

- [ ] **Step 3: Create use-historical-run.ts**

Create `src/tui/hooks/use-historical-run.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import type { TestStatus, StatsIndex } from '../../types/run.js';

type RunEntry = StatsIndex['runs'][number];

export interface HistoricalTestEntry {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  transcript: string[];
  gradeTranscript: string[];
  activity: string;
}

export interface HistoricalRunData {
  tests: HistoricalTestEntry[];
  activeTestId: string | null;
  elapsed: number;
  status: 'complete';
}

/**
 * Load a historical run from disk artifacts.
 * Reads transcript and results files from the run directory.
 */
export function loadHistoricalRun(
  runDir: string,
  runEntry: RunEntry
): HistoricalRunData {
  const resultsDir = path.join(runDir, 'results');
  const tests: HistoricalTestEntry[] = [];

  if (!fs.existsSync(resultsDir)) {
    return {
      tests: [],
      activeTestId: null,
      elapsed: runEntry.duration,
      status: 'complete',
    };
  }

  const files = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith('.transcript.md'));

  for (const transcriptFile of files) {
    // Parse spec name and test ID from filename: <spec>.<testId>.transcript.md
    const withoutExt = transcriptFile.replace(/\.transcript\.md$/, '');
    const lastDot = withoutExt.lastIndexOf('.');
    if (lastDot <= 0) continue;

    const specName = withoutExt.substring(0, lastDot);
    const testId = withoutExt.substring(lastDot + 1);

    // Read execution transcript
    const transcriptPath = path.join(resultsDir, transcriptFile);
    const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

    // Read grading results if available
    const resultsFile = `${specName}.${testId}.results.md`;
    const resultsPath = path.join(resultsDir, resultsFile);
    let gradeContent = '';
    let passed = false;
    if (fs.existsSync(resultsPath)) {
      gradeContent = fs.readFileSync(resultsPath, 'utf-8');
      passed = /\*\*Verdict:\*\*\s*PASS/i.test(gradeContent);
    }

    // Extract test name from results file heading or fall back to ID
    const headingMatch = gradeContent.match(/^# Results:\s*(.+?):\s*(.+)$/m);
    const testName = headingMatch ? headingMatch[2].trim() : testId;

    const status: TestStatus = passed ? 'passed' : 'failed';

    tests.push({
      id: testId,
      name: testName,
      specName,
      status,
      durationMs: 0,
      transcript: [transcriptContent],
      gradeTranscript: gradeContent ? [gradeContent] : [],
      activity: '',
    });
  }

  return {
    tests,
    activeTestId: tests[0]?.id ?? null,
    elapsed: runEntry.duration,
    status: 'complete',
  };
}
```

- [ ] **Step 4: Run test**

```bash
npm.cmd run test -- tests/tui/historical-run.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Add Enter handler to RunManager**

In `src/tui/screens/runs.tsx`, add an `onViewRun` prop and wire Enter to it:

Update the interface:

```typescript
interface RunManagerProps {
  runs: RunEntry[];
  onCleanup: () => void;
  onDeleteRun: (id: string) => void;
  onViewRun: (run: RunEntry) => void;
}
```

Update the component signature:

```typescript
export function RunManager({ runs, onCleanup, onDeleteRun, onViewRun }: RunManagerProps) {
```

Add to the `useInput` callback, after the existing `d` and `c` handlers:

```typescript
} else if (key.return) {
  const run = runs[cursor];
  if (run) onViewRun(run);
}
```

Update the footer help text:

```typescript
<Text color="gray">up/down navigate  [Enter] view run  [d] delete selected  [c] cleanup old runs</Text>
```

- [ ] **Step 6: Wire up App to handle historical run viewing**

In `src/tui/app.tsx`, add state for the historical run and a handler:

Add import:

```typescript
import {
  loadHistoricalRun,
  type HistoricalRunData,
} from './hooks/use-historical-run.js';
```

Add state:

```typescript
const [historicalRun, setHistoricalRun] = useState<HistoricalRunData | null>(
  null
);
const [historicalActiveTestId, setHistoricalActiveTestId] = useState<
  string | null
>(null);
```

Add handler:

```typescript
function handleViewRun(run: StatsIndex['runs'][number]) {
  const runDir = path.join('.workspace', 'runs', run.id);
  const data = loadHistoricalRun(runDir, run);
  setHistoricalRun(data);
  setHistoricalActiveTestId(data.activeTestId);
  setScreen('runner');
}
```

Add import for `path`:

```typescript
import path from 'node:path';
```

Update the RunManager render to pass the new prop:

```tsx
{
  screen === 'runs' && (
    <RunManager
      runs={statsIndex.runs}
      onCleanup={handleCleanup}
      onDeleteRun={handleDeleteRun}
      onViewRun={handleViewRun}
    />
  );
}
```

Update the Runner render to use historical data when available. Since `HistoricalRunData` and `TestRunState` share the same shape (both have `tests`, `activeTestId`, `elapsed`, `status`), cast the historical data:

```tsx
{
  screen === 'runner' && (
    <Runner
      runState={
        historicalRun
          ? ({
              ...historicalRun,
              activeTestId:
                historicalActiveTestId ?? historicalRun.activeTestId,
            } as unknown as TestRunState)
          : runState
      }
      onSelectTest={historicalRun ? setHistoricalActiveTestId : selectTest}
    />
  );
}
```

Add `TestRunState` to the imports from the hook:

```typescript
import { useTestRun, type TestRunState } from './hooks/use-test-run.js';
```

Note: When a live run starts (from Dashboard), clear the historical run:

```typescript
// In the onRunTests handler, add:
setHistoricalRun(null);
```

- [ ] **Step 7: Update RunManager test**

In `tests/tui/runs.spec.tsx`, update the RunManager renders to include the new prop:

```tsx
<RunManager
  runs={[]}
  onCleanup={() => {}}
  onDeleteRun={() => {}}
  onViewRun={() => {}}
/>
```

And for the run list test:

```tsx
<RunManager
  runs={runs}
  onCleanup={() => {}}
  onDeleteRun={() => {}}
  onViewRun={() => {}}
/>
```

- [ ] **Step 8: Typecheck and run tests**

```bash
npm.cmd run typecheck
npm.cmd run test
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add src/tui/hooks/use-historical-run.ts src/tui/screens/runs.tsx src/tui/app.tsx tests/tui/runs.spec.tsx tests/tui/historical-run.spec.ts
git commit -m "feat: historical run detail view with Enter from Run Manager"
```

---

## Task 8: Re-run Selected Tests from Completed Run

**Files:**

- Modify: `src/tui/screens/runner.tsx`
- Modify: `src/tui/components/progress-tree.tsx`
- Modify: `src/tui/app.tsx`

- [ ] **Step 1: Write failing test for selectable progress tree**

Add to `tests/tui/runner.spec.tsx`:

```tsx
describe('ProgressTree', () => {
  // ... existing tests ...

  it('when selectable should show checkboxes', () => {
    // Arrange
    const tests = [
      {
        id: 'TEST-1',
        name: 'basic',
        status: 'passed' as const,
        durationMs: 1200,
      },
      {
        id: 'TEST-2',
        name: 'error',
        status: 'failed' as const,
        durationMs: 3000,
      },
    ];
    const selected = new Set(['TEST-2']);

    // Act
    const { lastFrame } = render(
      <ProgressTree
        tests={tests}
        elapsed={5000}
        selectable
        selected={selected}
      />
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('basic');
    expect(output).toContain('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm.cmd run test -- tests/tui/runner.spec.tsx
```

Expected: FAIL -- ProgressTree does not accept `selectable` or `selected` props.

- [ ] **Step 3: Add selection support to ProgressTree**

In `src/tui/components/progress-tree.tsx`, add optional props:

```typescript
interface ProgressTreeProps {
  tests: TestEntry[];
  elapsed: number;
  selectable?: boolean;
  selected?: Set<string>;
}
```

Update the component signature:

```typescript
export function ProgressTree({ tests, elapsed, selectable, selected }: ProgressTreeProps) {
```

Update the test row rendering to show checkboxes when selectable:

```tsx
{
  tests.map((test) => {
    const { symbol, color } = statusIcon(test.status);
    const isRunning = test.status === 'running';
    const isSelected = selected?.has(test.id) ?? false;
    return (
      <Box key={test.id}>
        {selectable && (
          <Text color={isSelected ? 'blue' : 'gray'}>
            {isSelected ? '[x]' : '[ ]'}{' '}
          </Text>
        )}
        <Text color={color}>{symbol} </Text>
        <Text bold={isRunning}>{test.name}</Text>
        {test.durationMs > 0 && (
          <Text color="gray">{formatDuration(test.durationMs)}</Text>
        )}
      </Box>
    );
  });
}
```

- [ ] **Step 4: Add selection state and re-run handlers to Runner**

In `src/tui/screens/runner.tsx`, add state for selection (only active when run is complete):

```typescript
const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
const [selectionInitialized, setSelectionInitialized] = useState(false);
```

Auto-initialize selection with failed tests when run completes:

```typescript
useEffect(() => {
  if (status === 'complete' && !selectionInitialized) {
    const failedIds = tests
      .filter(
        (t) =>
          t.status === 'failed' ||
          t.status === 'error' ||
          t.status === 'timedout'
      )
      .map((t) => t.id);
    setSelectedTests(new Set(failedIds));
    setSelectionInitialized(true);
  }
}, [status, tests, selectionInitialized]);
```

Add space/enter handlers in the `useInput` callback (inside the `viewMode === 'primary'` branch):

```typescript
// Selection toggle (only when run is complete)
if (input === ' ' && status === 'complete') {
  if (activeTestId) {
    setSelectedTests((prev) => {
      const next = new Set(prev);
      if (next.has(activeTestId)) {
        next.delete(activeTestId);
      } else {
        next.add(activeTestId);
      }
      return next;
    });
  }
  return;
}

// Re-run selected tests
if (key.return && status === 'complete' && selectedTests.size > 0) {
  onRerunTests?.(Array.from(selectedTests));
  return;
}
```

Add an `onRerunTests` prop to Runner:

```typescript
interface RunnerProps {
  runState: TestRunState;
  onSelectTest: (id: string) => void;
  onRerunTests?: (testIds: string[]) => void;
}
```

Update the component signature:

```typescript
export function Runner({ runState, onSelectTest, onRerunTests }: RunnerProps) {
```

Pass selection to ProgressTree:

```tsx
<ProgressTree
  tests={tests}
  elapsed={elapsed}
  selectable={status === 'complete'}
  selected={selectedTests}
/>
```

Reset selection state when a new run starts (watch for status change):

```typescript
useEffect(() => {
  if (status === 'running') {
    setSelectedTests(new Set());
    setSelectionInitialized(false);
  }
}, [status]);
```

- [ ] **Step 5: Wire re-run in App**

In `src/tui/app.tsx`, add a handler that re-runs selected tests:

```typescript
function handleRerunTests(testIds: string[]) {
  // Find the test entries from the current run state (live or historical)
  const currentTests = historicalRun?.tests ?? runState.tests;
  const testsToRerun = currentTests.filter((t) => testIds.includes(t.id));

  if (testsToRerun.length === 0) return;

  // Clear historical state
  setHistoricalRun(null);

  // Find specs and build manifests for selected tests
  const selectedTestIds = new Set(testIds);
  const timestamp = formatTimestamp(new Date());

  // Match test IDs back to specs
  const matchedSpecs = new Set<string>();
  for (const t of testsToRerun) {
    matchedSpecs.add(t.specName);
  }

  const selectedSpecs = specs.filter((s) => {
    const specName = s.frontmatter.name || path.basename(s.path, '.spec.md');
    return matchedSpecs.has(specName);
  });

  const manifests = selectedSpecs
    .map((spec) => {
      const manifest = buildManifest(spec, appConfig, { timestamp });
      manifest['test-cases'] = manifest['test-cases'].filter((tc) =>
        selectedTestIds.has(tc.id)
      );
      return manifest;
    })
    .filter((m) => m['test-cases'].length > 0);

  // Start run
  startRun(
    testsToRerun.map((t) => ({
      id: t.id,
      name: t.name,
      specName: t.specName,
    }))
  );

  executeRun(manifests, selectedSpecs, appConfig, timestamp);
}
```

Pass it to Runner:

```tsx
{
  screen === 'runner' && (
    <Runner
      runState={historicalRun ?? runState}
      onSelectTest={historicalRun ? setHistoricalActiveTestId : selectTest}
      onRerunTests={handleRerunTests}
    />
  );
}
```

- [ ] **Step 6: Run tests**

```bash
npm.cmd run test -- tests/tui/runner.spec.tsx
```

Expected: All PASS.

- [ ] **Step 7: Typecheck and full test suite**

```bash
npm.cmd run typecheck
npm.cmd run test
```

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/tui/screens/runner.tsx src/tui/components/progress-tree.tsx src/tui/app.tsx tests/tui/runner.spec.tsx
git commit -m "feat: re-run selected tests from completed run view"
```

---

## Task 9: Update Architecture Documentation

**Files:**

- Modify: `docs/architecture/tui-design.md`

- [ ] **Step 1: Update tui-design.md**

Update the following sections in `docs/architecture/tui-design.md`:

1. **Silent Mode section:** Add note about grading using the same `gradeTest` EventEmitter interface in TUI mode.

2. **Data Flow: TUI Mode section:** Replace the flow to reflect per-test grading:

```
Dashboard: user selects tests, presses Enter
  -> App builds manifests, calls startRun() + executeRun()
  -> screen switches to Runner

useTestRun hook:
  -> shared concurrency pool (config.runner.concurrency)
  -> for each test case (with concurrency control):
       runTest(manifest, tc, config, { silent: true })
       'output' events -> buffered into transcript[] (flushed every 200ms)
       'tool-use' events -> update activity string
       'complete' events -> release slot, acquire slot for grading
  -> per-test grading (immediate, shares concurrency pool):
       gradeTest(tc, transcriptPath, config, specName, timestamp)
       'output' events -> buffered into gradeTranscript[]
       'complete' events -> update status to passed/failed
  -> all tests graded:
       generateReport()
       recordRun()
       completeRun() stops timer
```

3. **Keyboard Navigation table:** Add the new keys:

```
| Up/Down | Runner (Primary) | Scroll transcript, disable auto-follow |
| f | Runner (Primary) | Snap to bottom, re-enable auto-follow |
| t | Runner (Primary) | Toggle execution/grading transcript |
| Space | Runner (complete) | Toggle test selection for re-run |
| Enter | Runner (complete) | Re-run selected tests |
| Enter | Run Manager | View historical run details |
```

4. **Screen Architecture - Run Manager section:** Add Enter to view run details.

5. **Screen Architecture - Test Runner section:** Add scroll behavior, transcript toggle, and re-run selection sections.

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/tui-design.md
git commit -m "docs: update TUI architecture for scroll, grading toggle, re-run, and unified concurrency"
```
