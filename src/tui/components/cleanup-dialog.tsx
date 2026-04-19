import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useKeyboardShortcuts } from '../keyboard/index.js';

interface CleanupOption {
  label: string;
  keepCount: number; // 0 = delete all
}

const OPTIONS: CleanupOption[] = [
  { label: 'Keep last 5 runs', keepCount: 5 },
  { label: 'Keep last 10 runs', keepCount: 10 },
  { label: 'Keep last 20 runs', keepCount: 20 },
  { label: 'Delete all runs', keepCount: 0 },
];

interface CleanupDialogProps {
  totalRuns: number;
  onConfirm: (keepCount: number) => void;
  onDismiss: () => void;
}

export function CleanupDialog({
  totalRuns,
  onConfirm,
  onDismiss,
}: CleanupDialogProps) {
  const [cursor, setCursor] = useState(0);

  useKeyboardShortcuts(
    [
      { keys: 'up', handler: () => setCursor((c) => Math.max(0, c - 1)) },
      {
        keys: 'down',
        handler: () => setCursor((c) => Math.min(OPTIONS.length - 1, c + 1)),
      },
      {
        keys: 'enter',
        hint: 'confirm',
        handler: () => onConfirm(OPTIONS[cursor]!.keepCount),
      },
      { keys: 'escape', hint: 'cancel', handler: onDismiss },
    ],
    { modal: true }
  );

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      flexGrow={1}
    >
      <Box flexDirection="column" borderStyle="round" paddingX={4} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold>Clean up runs</Text>
          <Text color="gray"> ({totalRuns} total)</Text>
        </Box>

        {OPTIONS.map((opt, idx) => {
          const isActive = idx === cursor;
          const wouldRemove =
            opt.keepCount === 0
              ? totalRuns
              : Math.max(0, totalRuns - opt.keepCount);
          const dimmed = wouldRemove === 0;

          return (
            <Box key={opt.keepCount}>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '}{' '}
              </Text>
              <Text bold={isActive} color={dimmed ? 'gray' : undefined}>
                {opt.label}
              </Text>
              {wouldRemove > 0 && <Text color="red"> (-{wouldRemove})</Text>}
            </Box>
          );
        })}

        <Box marginTop={1}>
          <Text color="gray">[Enter] confirm [Esc] cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
