import React from 'react';
import { Box, Text } from 'ink';

export interface ContextHint {
  key: string;
  label: string;
}

interface ContextBarProps {
  hints: ContextHint[];
}

export function ContextBar({ hints }: ContextBarProps) {
  if (hints.length === 0) return null;

  return (
    <Box flexShrink={0} paddingX={1}>
      {hints.map((hint, idx) => (
        <Box key={idx} marginRight={2}>
          <Text color="cyan">{hint.key}</Text>
          <Text color="gray"> {hint.label}</Text>
        </Box>
      ))}
    </Box>
  );
}
