import React from 'react';
import { Box, Text } from 'ink';
import type { TestStatus } from '../../types/run.js';

interface TestEntry {
  id: string;
  name: string;
  status: TestStatus;
  durationMs: number;
}

interface ProgressTreeProps {
  tests: TestEntry[];
  elapsed: number;
  selectable?: boolean;
  selected?: Set<string>;
}

function statusIcon(status: TestStatus): { symbol: string; color: string } {
  switch (status) {
    case 'pending':
      return { symbol: '○', color: 'gray' };
    case 'running':
      return { symbol: '⏳', color: 'blue' };
    case 'grading':
      return { symbol: '⚙', color: 'yellow' };
    case 'passed':
      return { symbol: '✓', color: 'green' };
    case 'failed':
      return { symbol: '✗', color: 'red' };
    case 'timedout':
      return { symbol: '⏰', color: 'red' };
    case 'error':
      return { symbol: '✗', color: 'red' };
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

function formatDuration(ms: number): string {
  if (ms === 0) return '';
  return ` ${(ms / 1000).toFixed(1)}s`;
}

export function ProgressTree({ tests, elapsed, selectable, selected }: ProgressTreeProps) {
  const completed = tests.filter(
    t => t.status === 'passed' || t.status === 'failed' || t.status === 'timedout' || t.status === 'error',
  ).length;
  const total = tests.length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Tests </Text>
        <Text color="gray">
          {completed}/{total} ({formatElapsed(elapsed)})
        </Text>
      </Box>
      {tests.map(test => {
        const { symbol, color } = statusIcon(test.status);
        const isRunning = test.status === 'running';
        const isSelected = selected?.has(test.id) ?? false;
        return (
          <Box key={test.id}>
            {selectable && (
              <Text color={isSelected ? 'blue' : 'gray'}>{isSelected ? '[x]' : '[ ]'} </Text>
            )}
            <Text color={color}>{symbol} </Text>
            <Text bold={isRunning}>{test.name}</Text>
            {test.durationMs > 0 && (
              <Text color="gray">{formatDuration(test.durationMs)}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
