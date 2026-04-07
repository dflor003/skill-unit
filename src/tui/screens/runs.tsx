import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { StatsIndex } from '../../types/run.js';

type RunEntry = StatsIndex['runs'][number];

interface RunManagerProps {
  runs: RunEntry[];
  onCleanup: () => void;
  onDeleteRun: (id: string) => void;
}

function formatTimestamp(ts: string): string {
  // ISO string -> "YYYY-MM-DD HH:MM"
  const d = new Date(ts);
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return `${date} ${time}`;
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

export function RunManager({ runs, onCleanup, onDeleteRun }: RunManagerProps) {
  const [cursor, setCursor] = useState(0);

  useInput((input, key) => {
    if (runs.length === 0) return;

    if (key.upArrow) {
      setCursor(c => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor(c => Math.min(runs.length - 1, c + 1));
    } else if (input === 'd' || input === 'D') {
      const run = runs[cursor];
      if (run) onDeleteRun(run.id);
    } else if (input === 'c' || input === 'C') {
      onCleanup();
    }
  });

  if (runs.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} alignItems="center" justifyContent="center">
        <Text color="gray">No runs yet. Go to Dashboard and run some tests.</Text>
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
        <Box width={18}><Text bold color="gray">Timestamp</Text></Box>
        <Box width={7}><Text bold color="gray">Tests</Text></Box>
        <Box width={7}><Text bold color="gray">Pass</Text></Box>
        <Box width={7}><Text bold color="gray">Fail</Text></Box>
        <Box width={8}><Text bold color="gray">Duration</Text></Box>
        <Box width={9}><Text bold color="gray">Cost</Text></Box>
        <Box><Text bold color="gray">Tokens</Text></Box>
      </Box>

      {/* Run rows */}
      <Box flexDirection="column">
        {runs.map((run, idx) => {
          const isActive = idx === cursor;
          return (
            <Box key={run.id}>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}
                {' '}
              </Text>
              <Box width={17}>
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
                <Text color={run.failed > 0 ? 'red' : 'gray'}>{run.failed}</Text>
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

      {/* Footer help */}
      <Box marginTop={1}>
        <Text color="gray">up/down navigate  [d] delete selected  [c] cleanup old runs</Text>
      </Box>
    </Box>
  );
}
