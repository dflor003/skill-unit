import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { StatsIndex } from '../../types/run.js';
import { formatTimestamp } from '../format.js';
import { useKeyboardShortcuts } from '../keyboard/index.js';

type RunEntry = StatsIndex['runs'][number];

interface RunManagerProps {
  runs: RunEntry[];
  onCleanup: () => void;
  onDeleteRun: (id: string) => void;
  onViewRun: (run: RunEntry) => void;
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m${rem}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`;
}

export function RunManager({
  runs,
  onCleanup,
  onDeleteRun,
  onViewRun,
}: RunManagerProps) {
  const [cursor, setCursor] = useState(0);

  // Clamp cursor when runs list shrinks (e.g. after deletion)
  useEffect(() => {
    if (runs.length > 0 && cursor >= runs.length) {
      setCursor(runs.length - 1);
    }
  }, [runs.length, cursor]);

  useKeyboardShortcuts([
    {
      keys: 'up',
      enabled: runs.length > 0,
      handler: () => setCursor((c) => Math.max(0, c - 1)),
    },
    {
      keys: 'down',
      enabled: runs.length > 0,
      handler: () => setCursor((c) => Math.min(runs.length - 1, c + 1)),
    },
    {
      keys: ['c', 'C'],
      hint: 'cleanup',
      enabled: runs.length > 0,
      handler: onCleanup,
    },
    {
      // Both keys: in this ink version, ASCII 0x7f (what most terminals send
      // on Backspace) maps to `key.delete`, not `key.backspace`, so binding
      // only 'delete' would still catch backspace anyway. The confirmation
      // prompt in app.tsx is what guards against accidental deletes.
      keys: ['backspace', 'delete'],
      hint: 'delete',
      enabled: runs.length > 0,
      handler: () => {
        const run = runs[cursor];
        if (run) onDeleteRun(run.id);
      },
    },
    {
      keys: 'enter',
      hint: 'view',
      enabled: runs.length > 0,
      handler: () => {
        const run = runs[cursor];
        if (run) onViewRun(run);
      },
    },
  ]);

  if (runs.length === 0) {
    return (
      <Box
        flexDirection="column"
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
      >
        <Text color="gray">
          No runs yet. Go to Dashboard and run some tests.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold>Run Manager</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">
          {runs.length} run{runs.length !== 1 ? 's' : ''}
        </Text>
      </Box>

      {/* Header row */}
      <Box marginBottom={1}>
        <Box width={22}>
          <Text bold color="gray">
            Timestamp
          </Text>
        </Box>
        <Box width={7}>
          <Text bold color="gray">
            Tests
          </Text>
        </Box>
        <Box width={7}>
          <Text bold color="gray">
            Pass
          </Text>
        </Box>
        <Box width={7}>
          <Text bold color="gray">
            Fail
          </Text>
        </Box>
        <Box width={8}>
          <Text bold color="gray">
            Duration
          </Text>
        </Box>
        <Box width={9}>
          <Text bold color="gray">
            Cost
          </Text>
        </Box>
        <Box>
          <Text bold color="gray">
            Tokens
          </Text>
        </Box>
      </Box>

      {/* Run rows */}
      <Box flexDirection="column">
        {runs.map((run, idx) => {
          const isActive = idx === cursor;
          return (
            <Box key={run.id}>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}{' '}
              </Text>
              <Box width={22}>
                <Text bold={isActive} color={isActive ? 'blue' : undefined}>
                  {formatTimestamp(run.timestamp)}
                </Text>
              </Box>
              <Box width={7}>
                <Text>{run.testCount}</Text>
              </Box>
              <Box width={7}>
                <Text color="green">{run.passed}</Text>
              </Box>
              <Box width={7}>
                <Text color={run.failed > 0 ? 'red' : 'gray'}>
                  {run.failed}
                </Text>
              </Box>
              <Box width={8}>
                <Text>{formatDuration(run.duration)}</Text>
              </Box>
              <Box width={9}>
                <Text>{formatCost(run.cost)}</Text>
              </Box>
              <Box>
                <Text color="gray">{run.tokens.toLocaleString()}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
