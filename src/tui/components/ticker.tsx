import React from 'react';
import { Box, Text } from 'ink';
import type { TestStatus } from '../../types/run.js';

interface SessionTab {
  id: string;
  name: string;
  status: TestStatus;
  activity: string;
}

interface TickerProps {
  sessions: SessionTab[];
  activeId: string | null;
  elapsed?: number;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export function Ticker({ sessions, elapsed = 0 }: TickerProps) {
  const total = sessions.length;
  const passed = sessions.filter((s) => s.status === 'passed').length;
  const failed = sessions.filter(
    (s) =>
      s.status === 'failed' || s.status === 'error' || s.status === 'timedout'
  ).length;
  const running = sessions.filter((s) => s.status === 'running').length;
  const grading = sessions.filter((s) => s.status === 'grading').length;
  const pending = sessions.filter(
    (s) => s.status === 'pending' || s.status === 'cancelled'
  ).length;
  const done = passed + failed;

  return (
    <Box
      flexShrink={0}
      borderStyle="single"
      borderBottom
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Text bold>
        Tests {done}/{total}
      </Text>
      <Text color="gray"> ({formatElapsed(elapsed)}) </Text>
      {passed > 0 && <Text color="green"> ✓ {passed} passed</Text>}
      {failed > 0 && <Text color="red"> ✗ {failed} failed</Text>}
      {running > 0 && <Text color="blue"> ⏳ {running} running</Text>}
      {grading > 0 && <Text color="yellow"> ⚙ {grading} grading</Text>}
      {pending > 0 && <Text color="gray"> ○ {pending} pending</Text>}
    </Box>
  );
}
