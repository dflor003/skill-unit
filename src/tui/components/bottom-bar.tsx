import React from 'react';
import { Box, Text } from 'ink';
import { useKeyboardHints } from '../keyboard/index.js';

export type Screen = 'dashboard' | 'runs' | 'stats' | 'options' | 'runner';

interface BottomBarProps {
  activeScreen: Screen;
  runStatus?: 'idle' | 'running' | 'complete';
}

const NAV_ITEMS: Array<{ key: string; label: string; screen: Screen }> = [
  { key: 'D', label: 'Dashboard', screen: 'dashboard' },
  { key: 'R', label: 'Runs', screen: 'runs' },
  { key: 'S', label: 'Stats', screen: 'stats' },
  { key: 'O', label: 'Options', screen: 'options' },
];

const NAV_LETTERS = new Set([
  'd',
  'D',
  'r',
  'R',
  's',
  'S',
  'o',
  'O',
  'q',
  'Q',
  'tab',
  'shift+tab',
  'ctrl+c',
]);

export function BottomBar({ activeScreen, runStatus }: BottomBarProps) {
  const hints = useKeyboardHints();
  const isRunning = activeScreen === 'runner' && runStatus === 'running';

  // Filter out hints for App-level global nav so the nav row is the sole
  // display for those keys. Screen/dialog hints come through.
  const screenHints = hints.filter((h) => !NAV_LETTERS.has(h.displayKey));

  return (
    <Box
      flexShrink={0}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      flexDirection="column"
    >
      {/* Screen-context hints (or running status) */}
      <Box flexShrink={0}>
        {isRunning && (
          <Text color="yellow" bold>
            Run in progress...{' '}
          </Text>
        )}
        <Text color="gray">
          {screenHints.map((h) => `[${h.displayKey}] ${h.label}`).join('  ')}
        </Text>
      </Box>
      {/* Global nav row (always visible) */}
      <Box flexShrink={0}>
        <Box flexGrow={1}>
          {NAV_ITEMS.map((item) => (
            <Box key={item.key} marginRight={2}>
              <Text
                bold={activeScreen === item.screen}
                color={activeScreen === item.screen ? 'white' : 'gray'}
              >
                [{item.key}]{item.label.slice(1)}
              </Text>
            </Box>
          ))}
        </Box>
        <Text color="gray">
          Tab/Shift+Tab: next/prev [Q]uit skill-unit v0.0.1
        </Text>
      </Box>
    </Box>
  );
}
