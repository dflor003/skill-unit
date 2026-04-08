import React from 'react';
import { Box, Text } from 'ink';

export type Screen = 'dashboard' | 'runs' | 'stats' | 'options' | 'runner';
export type RunViewMode = 'primary' | 'split';

interface BottomBarProps {
  activeScreen: Screen;
  runStatus?: 'idle' | 'running' | 'complete';
  runViewMode?: RunViewMode;
}

export function BottomBar({ activeScreen, runStatus, runViewMode }: BottomBarProps) {
  const isRunner = activeScreen === 'runner';
  const isRunning = isRunner && runStatus === 'running';

  // Running: show contextual runner hints
  if (isRunning) {
    const hints = runViewMode === 'split'
      ? '[Esc] cancel  [1-9] focus  [m] maximize  [v] primary'
      : '[Esc] cancel  \u2190 \u2192 sessions  \u2191\u2193 scroll  [f] follow  [t] transcript  [v] split';

    return (
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
        <Box flexGrow={1}>
          <Text color="yellow" bold>Run in progress... </Text>
          <Text color="gray">{hints}</Text>
        </Box>
      </Box>
    );
  }

  // Runner complete/idle: show completion hints
  if (isRunner) {
    const completionHints = runViewMode === 'split'
      ? '[1-9] focus  [m] maximize  [v] primary  [Esc] back'
      : '[Space] select  [Enter] re-run  \u2190 \u2192 sessions  [Esc] back';

    return (
      <Box borderStyle="single" borderTop borderBottom={false} borderLeft={false} borderRight={false} paddingX={1}>
        <Box flexGrow={1}>
          <Text color="gray">{completionHints}</Text>
        </Box>
      </Box>
    );
  }

  // Standard nav bar for top-level screens
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
              color={activeScreen === item.screen ? 'white' : 'gray'}
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
