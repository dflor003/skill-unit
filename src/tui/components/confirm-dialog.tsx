import React from 'react';
import { Box, Text, useInput } from 'ink';

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
  useInput((input, key) => {
    if (input === 'y' || input === 'Y') {
      onConfirm();
    } else if (input === 'n' || input === 'N' || key.escape) {
      onDismiss();
    }
  });

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
