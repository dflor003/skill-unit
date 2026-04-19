import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useKeyboardShortcuts } from '../keyboard/index.js';
import { ProgressTree } from '../components/progress-tree.js';
import { Ticker } from '../components/ticker.js';
import { SessionPanel } from '../components/session-panel.js';
import { SplitPanes } from '../components/split-panes.js';
import type { TestRunState } from '../hooks/use-test-run.js';
import type { TranscriptViewMode } from '../components/session-panel.js';

interface RunnerProps {
  runState: TestRunState;
  onSelectTest: (id: string) => void;
  onRerunTests?: (testIds: string[]) => void;
}

type ViewMode = 'primary' | 'split';

export function Runner({ runState, onSelectTest, onRerunTests }: RunnerProps) {
  const { tests, activeTestId, elapsed, status } = runState;
  const [viewMode, setViewMode] = useState<ViewMode>('primary');
  const [splitFocusedId, setSplitFocusedId] = useState<string | null>(null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [selectedTests, setSelectedTests] = useState<Set<string>>(new Set());
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  // Scroll state per test+viewMode: { ["testId:execution"]: { offset, following } }
  const [scrollState, setScrollState] = useState<
    Record<string, { offset: number; following: boolean }>
  >({});
  // View mode per test (execution or grading)
  const [viewModes, setViewModes] = useState<
    Record<string, TranscriptViewMode>
  >({});
  // Track which tests the user has manually toggled (prevents auto-switch)
  const [manualToggled, setManualToggled] = useState<Set<string>>(new Set());

  // Compose scroll state key from test ID + view mode so execution and
  // grading transcripts scroll independently.
  function scrollKey(testId: string): string {
    const vm = viewModes[testId] ?? 'execution';
    return `${testId}:${vm}`;
  }

  const toggleViewMode = () => {
    setViewMode((prev) => (prev === 'primary' ? 'split' : 'primary'));
  };

  const toggleCurrentTestSelection = () => {
    if (!activeTestId) return;
    setSelectedTests((prev) => {
      const next = new Set(prev);
      if (next.has(activeTestId)) {
        next.delete(activeTestId);
      } else {
        next.add(activeTestId);
      }
      return next;
    });
  };

  const rerunSelected = () => {
    if (onRerunTests) onRerunTests(Array.from(selectedTests));
  };

  const scrollUp = () => {
    if (!activeTestId) return;
    const sk = scrollKey(activeTestId);
    setScrollState((prev) => {
      const curr = prev[sk] ?? { offset: 0, following: true };
      return {
        ...prev,
        [sk]: { offset: curr.offset + 3, following: false },
      };
    });
  };

  const scrollDown = () => {
    if (!activeTestId) return;
    const sk = scrollKey(activeTestId);
    setScrollState((prev) => {
      const curr = prev[sk] ?? { offset: 0, following: true };
      return {
        ...prev,
        [sk]: {
          offset: Math.max(0, curr.offset - 3),
          following: curr.offset - 3 <= 0,
        },
      };
    });
  };

  const enableFollow = () => {
    if (!activeTestId) return;
    const sk = scrollKey(activeTestId);
    setScrollState((prev) => ({
      ...prev,
      [sk]: { offset: 0, following: true },
    }));
  };

  const toggleTranscriptView = () => {
    if (!activeTestId) return;
    setViewModes((prev) => {
      const curr = prev[activeTestId] ?? 'execution';
      return {
        ...prev,
        [activeTestId]: curr === 'execution' ? 'grading' : 'execution',
      };
    });
    setManualToggled((prev) => new Set(prev).add(activeTestId));
  };

  const selectPreviousSession = () => {
    const currentIdx = tests.findIndex((t) => t.id === activeTestId);
    const prevIdx = Math.max(0, currentIdx - 1);
    const prev = tests[prevIdx];
    if (prev) onSelectTest(prev.id);
  };

  const selectNextSession = () => {
    const currentIdx = tests.findIndex((t) => t.id === activeTestId);
    const nextIdx = Math.min(tests.length - 1, currentIdx + 1);
    const next = tests[nextIdx];
    if (next) onSelectTest(next.id);
  };

  const toggleMaximize = () => {
    const focusId = splitFocusedId ?? tests[0]?.id ?? null;
    setMaximizedId((prev) => (prev === focusId ? null : focusId));
  };

  const focusPane = (index: number) => {
    const target = tests[index];
    if (target) {
      setSplitFocusedId(target.id);
    }
  };

  const hasTests = tests.length > 0;
  const isComplete = status === 'complete';

  // Always-on scope (both view modes)
  useKeyboardShortcuts([
    {
      keys: 'v',
      hint: viewMode === 'primary' ? 'split' : 'primary',
      enabled: hasTests,
      handler: toggleViewMode,
    },
  ]);

  // Primary-mode scope
  useKeyboardShortcuts(
    viewMode === 'primary' && hasTests
      ? [
          {
            keys: 'space',
            hint: 'select',
            enabled: isComplete,
            handler: toggleCurrentTestSelection,
          },
          {
            keys: 'enter',
            hint: 're-run',
            enabled: isComplete && selectedTests.size > 0,
            handler: rerunSelected,
          },
          { keys: 'up', handler: scrollUp },
          { keys: 'down', handler: scrollDown },
          { keys: 'f', hint: 'follow', handler: enableFollow },
          { keys: 't', hint: 'transcript', handler: toggleTranscriptView },
          {
            keys: 'left',
            hintKey: '←→',
            hint: 'sessions',
            handler: selectPreviousSession,
          },
          { keys: 'right', handler: selectNextSession },
        ]
      : []
  );

  // Split-mode scope
  useKeyboardShortcuts(
    viewMode === 'split' && hasTests
      ? [
          { keys: 'm', hint: 'maximize', handler: toggleMaximize },
          { keys: '1', handler: () => focusPane(0) },
          { keys: '2', handler: () => focusPane(1) },
          { keys: '3', handler: () => focusPane(2) },
          { keys: '4', handler: () => focusPane(3) },
          { keys: '5', handler: () => focusPane(4) },
          { keys: '6', handler: () => focusPane(5) },
          { keys: '7', handler: () => focusPane(6) },
          { keys: '8', handler: () => focusPane(7) },
          { keys: '9', handler: () => focusPane(8) },
        ]
      : []
  );

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

  useEffect(() => {
    if (status === 'running') {
      setSelectedTests(new Set());
      setSelectionInitialized(false);
    }
  }, [status]);

  const activeTest = tests.find((t) => t.id === activeTestId) ?? null;

  const tickerSessions = tests.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    activity: t.activity,
  }));

  const splitSessions = tests.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    transcript: t.transcript,
    durationMs: t.durationMs,
  }));

  const effectiveFocusedId = splitFocusedId ?? tests[0]?.id ?? null;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {viewMode === 'primary' ? (
        <>
          {/* Compact summary bar */}
          <Ticker
            sessions={tickerSessions}
            activeId={activeTestId}
            elapsed={elapsed}
          />

          {/* Main content: progress sidebar + session panel */}
          <Box flexDirection="row" flexGrow={1}>
            {/* Left sidebar: progress tree */}
            <Box
              flexDirection="column"
              width={38}
              flexShrink={0}
              overflow="hidden"
              borderStyle="single"
              borderRight
              borderTop={false}
              borderBottom={false}
              borderLeft={false}
              paddingRight={1}
              marginRight={1}
            >
              <ProgressTree
                tests={tests}
                elapsed={elapsed}
                sidebarWidth={38}
                selectable={status === 'complete'}
                selected={selectedTests}
              />
            </Box>

            {/* Main panel: session transcript */}
            <Box flexDirection="column" flexGrow={1}>
              {activeTest ? (
                <SessionPanel
                  testId={activeTest.id}
                  testName={activeTest.name}
                  status={activeTest.status}
                  transcript={activeTest.transcript}
                  gradeTranscript={activeTest.gradeTranscript}
                  elapsed={elapsed}
                  viewMode={viewModes[activeTest.id] ?? 'execution'}
                  scrollOffset={
                    scrollState[scrollKey(activeTest.id)]?.offset ?? 0
                  }
                  following={
                    scrollState[scrollKey(activeTest.id)]?.following ?? true
                  }
                  onScrollClamp={(clamped) => {
                    const sk = scrollKey(activeTest.id);
                    setScrollState((prev) => ({
                      ...prev,
                      [sk]: { offset: clamped, following: false },
                    }));
                  }}
                />
              ) : (
                <Box padding={1}>
                  <Text color="gray">
                    {status === 'idle'
                      ? 'No tests running. Press Enter on the dashboard to start.'
                      : 'No session selected.'}
                  </Text>
                </Box>
              )}
            </Box>
          </Box>
        </>
      ) : (
        /* Split panes view */
        <Box flexDirection="row" flexGrow={1}>
          {/* Left sidebar: progress tree */}
          <Box
            flexDirection="column"
            width={38}
            borderStyle="single"
            borderRight
            borderTop={false}
            borderBottom={false}
            borderLeft={false}
            paddingRight={1}
            marginRight={1}
          >
            <ProgressTree
              tests={tests}
              elapsed={elapsed}
              sidebarWidth={38}
              selectable={status === 'complete'}
              selected={selectedTests}
            />
          </Box>

          {/* Split panes main area */}
          <Box flexDirection="column" flexGrow={1}>
            <SplitPanes
              sessions={splitSessions}
              focusedId={effectiveFocusedId}
              maximizedId={maximizedId}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
