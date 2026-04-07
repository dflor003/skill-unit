import React from 'react';
import { Box, Text } from 'ink';
import type { TestStatus } from '../../types/run.js';

interface SessionPanelProps {
  testId: string | null;
  testName: string;
  status: TestStatus | 'idle';
  transcript: string[];
  elapsed: number;
}

function statusLabel(status: TestStatus | 'idle'): { label: string; color: string } {
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

export function SessionPanel({ testId, testName, status, transcript, elapsed }: SessionPanelProps) {
  if (!testId) {
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Text color="gray">No session selected. Use Left/Right arrows to switch sessions.</Text>
      </Box>
    );
  }

  const { label, color } = statusLabel(status);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        marginBottom={1}
      >
        <Text bold>{testName}</Text>
        <Text> </Text>
        <Text color={color}>[{label}]</Text>
        <Text color="gray"> {formatElapsed(elapsed)}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {transcript.length === 0 ? (
          <Text color="gray">Waiting for output...</Text>
        ) : (
          transcript.map((line, idx) => (
            <Text key={idx} wrap="truncate">{line}</Text>
          ))
        )}
      </Box>
    </Box>
  );
}
