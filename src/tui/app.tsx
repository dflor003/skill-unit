import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { BottomBar, type Screen } from './components/bottom-bar.js';
import { Dashboard } from './screens/dashboard.js';
import { Runner } from './screens/runner.js';
import { useTestRun } from './hooks/use-test-run.js';
import { loadConfig } from '../config/loader.js';
import { discoverSpecPaths } from '../core/discovery.js';
import { parseSpecFile } from '../core/compiler.js';
import type { Spec } from '../types/spec.js';

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [runState, { startRun, selectTest }] = useTestRun();

  useEffect(() => {
    try {
      const config = loadConfig('.skill-unit.yml');
      const paths = discoverSpecPaths(config['test-dir']);
      const loaded = paths.map(p => parseSpecFile(p));
      setSpecs(loaded);
    } catch {
      // Non-fatal: leave specs empty if loading fails
    }
  }, []);

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
        {screen === 'dashboard' && (
          <Dashboard
            specs={specs}
            onRunTests={tests => {
              startRun(
                tests.map(t => ({
                  id: t.testCase.id,
                  name: t.testCase.name,
                  specName: t.specName,
                })),
              );
              setScreen('runner');
            }}
          />
        )}
        {screen === 'runs' && <Text>Run Manager (coming soon)</Text>}
        {screen === 'stats' && <Text>Statistics (coming soon)</Text>}
        {screen === 'options' && <Text>Options (coming soon)</Text>}
        {screen === 'runner' && (
          <Runner runState={runState} onSelectTest={selectTest} />
        )}
      </Box>
      <BottomBar activeScreen={screen} />
    </Box>
  );
}
