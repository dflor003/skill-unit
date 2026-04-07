import React from 'react';
import { Box, Text, useInput } from 'ink';
import { ProgressTree } from '../components/progress-tree.js';
import { Ticker } from '../components/ticker.js';
import { SessionPanel } from '../components/session-panel.js';
import type { TestRunState, TestRunActions } from '../hooks/use-test-run.js';

interface RunnerProps {
  runState: TestRunState;
  onSelectTest: (id: string) => void;
}

export function Runner({ runState, onSelectTest }: RunnerProps) {
  const { tests, activeTestId, elapsed, status } = runState;

  useInput((_input, key) => {
    if (tests.length === 0) return;

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
  });

  const activeTest = tests.find(t => t.id === activeTestId) ?? null;

  const tickerSessions = tests.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    activity: t.activity,
  }));

  return (
    <Box flexDirection="column" flexGrow={1}>
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

      {/* Footer status */}
      <Box>
        <Text color="gray">
          {status === 'complete'
            ? 'Run complete. Press [D] to return to dashboard.'
            : '← → switch sessions'}
        </Text>
      </Box>
    </Box>
  );
}
