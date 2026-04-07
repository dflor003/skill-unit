import React from 'react';
import { Box, Text } from 'ink';

export type Screen = 'dashboard' | 'runs' | 'stats' | 'options' | 'runner';

interface BottomBarProps {
  activeScreen: Screen;
}

export function BottomBar({ activeScreen }: BottomBarProps) {
  const items: Array<{ key: string; label: string; screen: Screen }> = [
    { key: 'D', label: 'Dashboard', screen: 'dashboard' },
    { key: 'R', label: 'Runs', screen: 'runs' },
    { key: 'S', label: 'Stats', screen: 'stats' },
    { key: 'O', label: 'Options', screen: 'options' },
  ];

  return (
    <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
      <Box flexGrow={1}>
        {items.map((item) => (
          <Box key={item.key} marginRight={2}>
            <Text
              bold={activeScreen === item.screen}
              color={activeScreen === item.screen ? 'blue' : 'gray'}
            >
              [{item.key}]{item.label.slice(1)}
            </Text>
          </Box>
        ))}
      </Box>
      <Text color="gray">Tab: next  [Q]uit  skill-unit v0.0.1</Text>
    </Box>
  );
}
