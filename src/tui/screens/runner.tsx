import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
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
  // Scroll state per test: { [testId]: { offset, following } }
  const [scrollState, setScrollState] = useState<Record<string, { offset: number; following: boolean }>>({});
  // View mode per test (execution or grading)
  const [viewModes, setViewModes] = useState<Record<string, TranscriptViewMode>>({});
  // Track which tests the user has manually toggled (prevents auto-switch)
  const [manualToggled, setManualToggled] = useState<Set<string>>(new Set());

  useInput((input, key) => {
    if (tests.length === 0) return;

    // Toggle view mode with [v]
    if (input === 'v') {
      setViewMode(prev => (prev === 'primary' ? 'split' : 'primary'));
      return;
    }

    if (viewMode === 'primary') {
      // Selection toggle (only when run is complete)
      if (input === ' ' && status === 'complete') {
        if (activeTestId) {
          setSelectedTests(prev => {
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
        if (onRerunTests) onRerunTests(Array.from(selectedTests));
        return;
      }

      // Scroll up
      if (key.upArrow) {
        if (activeTestId) {
          setScrollState(prev => {
            const curr = prev[activeTestId] ?? { offset: 0, following: true };
            return { ...prev, [activeTestId]: { offset: curr.offset + 3, following: false } };
          });
        }
        return;
      }

      // Scroll down
      if (key.downArrow) {
        if (activeTestId) {
          setScrollState(prev => {
            const curr = prev[activeTestId] ?? { offset: 0, following: true };
            return { ...prev, [activeTestId]: { offset: Math.max(0, curr.offset - 3), following: curr.offset - 3 <= 0 } };
          });
        }
        return;
      }

      // Follow mode
      if (input === 'f') {
        if (activeTestId) {
          setScrollState(prev => ({ ...prev, [activeTestId]: { offset: 0, following: true } }));
        }
        return;
      }

      // Toggle execution/grading transcript
      if (input === 't') {
        if (activeTestId) {
          setViewModes(prev => {
            const curr = prev[activeTestId] ?? 'execution';
            return { ...prev, [activeTestId]: curr === 'execution' ? 'grading' : 'execution' };
          });
          setManualToggled(prev => new Set(prev).add(activeTestId));
        }
        return;
      }

      const currentIdx = tests.findIndex(t => t.id === activeTestId);

      if (key.leftArrow) {
        const prevIdx = Math.max(0, currentIdx - 1);
        const prev = tests[prevIdx];
        if (prev) onSelectTest(prev.id);
      } else if (key.rightArrow) {
        const nextIdx = Math.min(tests.length - 1, currentIdx + 1);
        const next = tests[nextIdx];
        if (next) onSelectTest(next.id);
      }
    } else {
      // Split pane mode: [1-9] sets focused pane, [m] toggles maximized
      if (input === 'm') {
        const focusId = splitFocusedId ?? tests[0]?.id ?? null;
        setMaximizedId(prev => (prev === focusId ? null : focusId));
        return;
      }

      const num = parseInt(input, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const target = tests[num - 1];
        if (target) {
          setSplitFocusedId(target.id);
        }
      }
    }
  });

  useEffect(() => {
    for (const test of tests) {
      if (test.status === 'grading' && !manualToggled.has(test.id)) {
        setViewModes(prev => {
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
        .filter(t => t.status === 'failed' || t.status === 'error' || t.status === 'timedout')
        .map(t => t.id);
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

  const activeTest = tests.find(t => t.id === activeTestId) ?? null;

  const tickerSessions = tests.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    activity: t.activity,
  }));

  const splitSessions = tests.map(t => ({
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
          {/* Header ticker strip */}
          <Ticker sessions={tickerSessions} activeId={activeTestId} />

          {/* Main content: progress sidebar + session panel */}
          <Box flexDirection="row" flexGrow={1}>
            {/* Left sidebar: progress tree */}
            <Box
              flexDirection="column"
              width={30}
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
                  scrollOffset={scrollState[activeTest.id]?.offset ?? 0}
                  following={scrollState[activeTest.id]?.following ?? true}
                  onScrollClamp={(clamped) => {
                    setScrollState(prev => ({ ...prev, [activeTest.id]: { offset: clamped, following: false } }));
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
            width={30}
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

      {/* Footer status */}
      <Box>
        <Text color="gray">
          {status === 'complete'
            ? '[Space] select  [Enter] re-run  ← → sessions  [D] dashboard'
            : viewMode === 'primary'
              ? '← → sessions  ↑↓ scroll  [f] follow  [t] transcript  [v] split view'
              : '[1-9] focus pane  [m] maximize  [v] primary view'}
        </Text>
      </Box>
    </Box>
  );
}
