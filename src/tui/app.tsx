import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { BottomBar, type Screen } from './components/bottom-bar.js';

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');

  useInput((input, key) => {
    if (input === 'd' || input === 'D') setScreen('dashboard');
    if (input === 'r' || input === 'R') setScreen('runs');
    if (input === 's' || input === 'S') setScreen('stats');
    if (input === 'o' || input === 'O') setScreen('options');
    if (input === 'q' || (key.ctrl && input === 'c')) process.exit(0);
  });

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1} flexDirection="column" padding={1}>
        {screen === 'dashboard' && <Text>Dashboard (coming soon)</Text>}
        {screen === 'runs' && <Text>Run Manager (coming soon)</Text>}
        {screen === 'stats' && <Text>Statistics (coming soon)</Text>}
        {screen === 'options' && <Text>Options (coming soon)</Text>}
        {screen === 'runner' && <Text>Test Runner (coming soon)</Text>}
      </Box>
      <BottomBar activeScreen={screen} />
    </Box>
  );
}
