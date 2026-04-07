import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProgressTree } from '../components/progress-tree.js';
import { Ticker } from '../components/ticker.js';
import { SessionPanel } from '../components/session-panel.js';
import { SplitPanes } from '../components/split-panes.js';
import type { TestRunState, TestRunActions } from '../hooks/use-test-run.js';

interface RunnerProps {
  runState: TestRunState;
  onSelectTest: (id: string) => void;
}

type ViewMode = 'primary' | 'split';

export function Runner({ runState, onSelectTest }: RunnerProps) {
  const { tests, activeTestId, elapsed, status } = runState;
  const [viewMode, setViewMode] = useState<ViewMode>('primary');
  const [splitFocusedId, setSplitFocusedId] = useState<string | null>(null);
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  useInput((input, key) => {
    if (tests.length === 0) return;

    // Toggle view mode with [v]
    if (input === 'v') {
      setViewMode(prev => (prev === 'primary' ? 'split' : 'primary'));
      return;
    }

    if (viewMode === 'primary') {
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
              <ProgressTree tests={tests} elapsed={elapsed} />
            </Box>

            {/* Main panel: session transcript */}
            <Box flexDirection="column" flexGrow={1}>
              {activeTest ? (
                <SessionPanel
                  testId={activeTest.id}
                  testName={activeTest.name}
                  status={activeTest.status}
                  transcript={activeTest.transcript}
                  elapsed={elapsed}
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
            <ProgressTree tests={tests} elapsed={elapsed} />
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
            ? 'Run complete. Press [D] to return to dashboard.'
            : viewMode === 'primary'
              ? '← → switch sessions  [v] split view'
              : '[1-9] focus pane  [m] maximize  [v] primary view'}
        </Text>
      </Box>
    </Box>
  );
}
