import React from 'react';
import { Box, Text } from 'ink';
import type { TestStatus } from '../../types/run.js';

interface TestEntry {
  id: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  activity?: string;
}

interface ProgressTreeProps {
  tests: TestEntry[];
  elapsed: number;
  sidebarWidth?: number;
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
    case 'cancelled':
      return { symbol: '⊘', color: 'gray' };
  }
}

function formatDuration(ms: number): string {
  if (ms === 0) return '';
  return ` ${(ms / 1000).toFixed(1)}s`;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

export function ProgressTree({
  tests,
  sidebarWidth = 38,
  selectable,
  selected,
}: ProgressTreeProps) {
  // Usable width: total - border(1) - paddingRight(1) - icon(up to 2) - space(1) - safety(1)
  const checkboxWidth = selectable ? 5 : 0; // "[x] " with extra safety
  // Pad every ID to the widest so names align in a column.
  const idWidth = tests.reduce((w, t) => Math.max(w, t.id.length), 0);
  const idColWidth = idWidth > 0 ? idWidth + 1 : 0; // +1 for trailing space
  const nameWidth = sidebarWidth - 5 - checkboxWidth - idColWidth;

  return (
    <Box flexDirection="column">
      {tests.map((test) => {
        const { symbol, color } = statusIcon(test.status);
        const isRunning =
          test.status === 'running' || test.status === 'grading';
        const isSelected = selected?.has(test.id) ?? false;
        const duration = formatDuration(test.durationMs);
        const maxName = nameWidth - duration.length;
        const displayName = truncate(test.name, Math.max(8, maxName));
        const paddedId = test.id.padEnd(idWidth);

        const showActivity = isRunning && !!test.activity;

        return (
          <React.Fragment key={test.id}>
            <Box>
              {selectable && (
                <Text color={isSelected ? 'blue' : 'gray'}>
                  {isSelected ? '[x]' : '[ ]'}{' '}
                </Text>
              )}
              <Text color={color}>{symbol} </Text>
              {idWidth > 0 && <Text color="gray">{paddedId} </Text>}
              <Text bold={isRunning}>{displayName}</Text>
              {test.durationMs > 0 && <Text color="gray">{duration}</Text>}
            </Box>
            {showActivity && (
              <Box marginLeft={checkboxWidth + 3 + idColWidth}>
                <Text color="gray" dimColor>
                  {truncate(test.activity!, maxName)}
                </Text>
              </Box>
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}
