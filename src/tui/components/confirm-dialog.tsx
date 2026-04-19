import React from 'react';
import { Box, Text } from 'ink';
import { useKeyboardShortcuts } from '../keyboard/index.js';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ConfirmDialog({
  message,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  useKeyboardShortcuts(
    [
      { keys: ['y', 'Y'], hint: 'yes', handler: onConfirm },
      { keys: ['n', 'N', 'escape'], hint: 'no', handler: onDismiss },
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
      <Box
        flexDirection="column"
        alignItems="center"
        borderStyle="round"
        paddingX={4}
        paddingY={1}
      >
        <Text bold>{message}</Text>
        <Text>
          <Text color="green">[Y]</Text>
          <Text>es / </Text>
          <Text color="red">[N]</Text>
          <Text>o</Text>
        </Text>
      </Box>
    </Box>
  );
}
