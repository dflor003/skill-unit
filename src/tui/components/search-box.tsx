import React from 'react';
import { Box, Text } from 'ink';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBox({ value, placeholder = 'Search tests...' }: SearchBoxProps) {
  return (
    <Box>
      <Text color="blue">{'> '}</Text>
      <Text>{value || placeholder}</Text>
    </Box>
  );
}
