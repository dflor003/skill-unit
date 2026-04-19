import React from 'react';
import { Box, Text } from 'ink';

interface SearchBoxProps {
  value: string;
  placeholder?: string;
}

export function SearchBox({
  value,
  placeholder = 'Search tests...',
}: SearchBoxProps) {
  const hasValue = value.length > 0;
  return (
    <Box
      borderStyle="round"
      borderColor={hasValue ? 'cyan' : 'gray'}
      paddingX={1}
      flexShrink={0}
      flexGrow={1}
    >
      <Text>🔍 </Text>
      {hasValue ? (
        <Text color="white">{value}</Text>
      ) : (
        <Text color="gray">{placeholder}</Text>
      )}
    </Box>
  );
}
