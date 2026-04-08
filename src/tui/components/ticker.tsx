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

export function Ticker({ sessions, activeId }: TickerProps) {
  return (
    <Box flexDirection="row" flexWrap="wrap" marginBottom={1}>
      {sessions.map(session => {
        const isActive = session.id === activeId;
        const { symbol, color } = statusIcon(session.status);
        return (
          <Box key={session.id} marginRight={2}>
            <Text
              bold={isActive}
              color={isActive ? 'blue' : 'gray'}
            >
              <Text color={color}>{symbol}</Text>
              {' '}
              {session.name}
            </Text>
            {!isActive && (
              <Text color="gray"> {session.activity}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
