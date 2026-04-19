import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { StatsIndex } from '../../types/run.js';
import type { ContextHint } from '../components/context-bar.js';
import { formatTimestamp } from '../format.js';

type RunEntry = StatsIndex['runs'][number];

interface RunManagerProps {
  runs: RunEntry[];
  onCleanup: () => void;
  onViewRun: (run: RunEntry) => void;
  onContextHintsChange?: (hints: ContextHint[]) => void;
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
  onViewRun,
  onContextHintsChange,
}: RunManagerProps) {
  const [cursor, setCursor] = useState(0);

  // Clamp cursor when runs list shrinks (e.g. after deletion)
  useEffect(() => {
    if (runs.length > 0 && cursor >= runs.length) {
      setCursor(runs.length - 1);
    }
  }, [runs.length, cursor]);

  useEffect(() => {
    if (runs.length === 0) {
      onContextHintsChange?.([]);
    } else {
      onContextHintsChange?.([
        { key: '↑↓', label: 'navigate' },
        { key: '[Enter]', label: 'view' },
        { key: '[C]', label: 'cleanup' },
      ]);
    }
  }, [runs.length, onContextHintsChange]);

  useInput((input, key) => {
    if (runs.length === 0) return;

    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(runs.length - 1, c + 1));
    } else if (input === 'C') {
      onCleanup();
    } else if (key.return) {
      const run = runs[cursor];
      if (run) onViewRun(run);
    }
  });

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
