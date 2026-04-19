import React from 'react';
import { Box, Text } from 'ink';
import type { TestStatus } from '../../types/run.js';
import { Markdown } from './markdown.js';

interface PaneSession {
  id: string;
  name: string;
  status: TestStatus;
  transcript: string[];
  durationMs: number;
}

interface SplitPanesProps {
  sessions: PaneSession[];
  focusedId: string | null;
  maximizedId: string | null;
}

export function getGridCols(count: number): number {
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

function statusIcon(status: TestStatus): { symbol: string; color: string } {
  switch (status) {
    case 'pending':
      return { symbol: '○', color: 'gray' };
    case 'running':
      return { symbol: '●', color: 'blue' };
    case 'grading':
      return { symbol: '⚙', color: 'yellow' };
    case 'passed':
      return { symbol: '✓', color: 'green' };
    case 'failed':
      return { symbol: '✗', color: 'red' };
    case 'timedout':
      return { symbol: '⏰', color: 'red' };
    case 'error':
      return { symbol: '!', color: 'red' };
    case 'cancelled':
      return { symbol: '⊘', color: 'gray' };
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

interface PaneProps {
  session: PaneSession;
  focused: boolean;
  fullWidth?: boolean;
}

function Pane({ session, focused, fullWidth }: PaneProps) {
  const { symbol, color } = statusIcon(session.status);
  const borderColor = focused ? 'blue' : undefined;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="single"
      borderColor={borderColor}
      width={fullWidth ? '100%' : '50%'}
    >
      {/* Pane header */}
      <Box paddingX={1}>
        <Text color={color}>{symbol}</Text>
        <Text> </Text>
        <Text color="gray">{session.id} </Text>
        <Text bold={focused}>{session.name}</Text>
        <Text color="gray"> {formatDuration(session.durationMs)}</Text>
      </Box>
      {/* Transcript */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        {session.transcript.length === 0 ? (
          <Text color="gray">Waiting for output...</Text>
        ) : (
          <Markdown content={session.transcript.slice(-10).join('\n')} />
        )}
      </Box>
    </Box>
  );
}

export function SplitPanes({
  sessions,
  focusedId,
  maximizedId,
}: SplitPanesProps) {
  // Maximized mode: show only one pane full-size
  if (maximizedId !== null) {
    const session = sessions.find((s) => s.id === maximizedId);
    if (session) {
      return (
        <Box flexDirection="column" flexGrow={1}>
          <Pane
            session={session}
            focused={session.id === focusedId}
            fullWidth
          />
        </Box>
      );
    }
  }

  // Grid layout based on session count
  const count = sessions.length;

  // 1-2 sessions: single column
  if (count <= 2) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        {sessions.map((s) => (
          <Pane key={s.id} session={s} focused={s.id === focusedId} fullWidth />
        ))}
      </Box>
    );
  }

  // 3-4 sessions: 2-column grid (rows of 2)
  if (count <= 4) {
    const rows: PaneSession[][] = [];
    for (let i = 0; i < count; i += 2) {
      rows.push(sessions.slice(i, i + 2));
    }
    return (
      <Box flexDirection="column" flexGrow={1}>
        {rows.map((row, rowIdx) => (
          <Box key={rowIdx} flexDirection="row" flexGrow={1}>
            {row.map((s) => (
              <Pane key={s.id} session={s} focused={s.id === focusedId} />
            ))}
          </Box>
        ))}
      </Box>
    );
  }

  // 5+ sessions: 3-column grid (rows of 3)
  const cols = 3;
  const rows: PaneSession[][] = [];
  for (let i = 0; i < count; i += cols) {
    rows.push(sessions.slice(i, i + cols));
  }
  return (
    <Box flexDirection="column" flexGrow={1}>
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx} flexDirection="row" flexGrow={1}>
          {row.map((s) => (
            <Pane key={s.id} session={s} focused={s.id === focusedId} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
