import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { BottomBar, type Screen } from './components/bottom-bar.js';
import { Dashboard } from './screens/dashboard.js';
import { Runner } from './screens/runner.js';
import { RunManager } from './screens/runs.js';
import { Statistics } from './screens/stats.js';
import { useTestRun } from './hooks/use-test-run.js';
import { loadConfig } from '../config/loader.js';
import { discoverSpecPaths } from '../core/discovery.js';
import { parseSpecFile } from '../core/compiler.js';
import { loadIndex, cleanupRuns } from '../core/stats.js';
import type { Spec } from '../types/spec.js';
import type { StatsIndex } from '../types/run.js';

const STATS_BASE_DIR = '.skill-unit';

export function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [statsIndex, setStatsIndex] = useState<StatsIndex>(() => ({
    version: 1,
    lastUpdated: new Date().toISOString(),
    aggregate: { totalRuns: 0, totalTests: 0, passRate: 0, totalCost: 0, totalTokens: 0 },
    tests: {},
    runs: [],
  }));
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

    try {
      const index = loadIndex(STATS_BASE_DIR);
      setStatsIndex(index);
    } catch {
      // Non-fatal: leave stats index empty if loading fails
    }
  }, []);

  function handleCleanup() {
    try {
      cleanupRuns(STATS_BASE_DIR, 10);
      const index = loadIndex(STATS_BASE_DIR);
      setStatsIndex(index);
    } catch {
      // Non-fatal
    }
  }

  function handleDeleteRun(id: string) {
    try {
      // Remove the run from the index by keeping only runs that don't match the id
      const index = loadIndex(STATS_BASE_DIR);
      index.runs = index.runs.filter(r => r.id !== id);
      setStatsIndex({ ...index });
    } catch {
      // Non-fatal
    }
  }

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
        {screen === 'runs' && (
          <RunManager
            runs={statsIndex.runs}
            onCleanup={handleCleanup}
            onDeleteRun={handleDeleteRun}
          />
        )}
        {screen === 'stats' && <Statistics index={statsIndex} />}
        {screen === 'options' && <Text>Options (coming soon)</Text>}
        {screen === 'runner' && (
          <Runner runState={runState} onSelectTest={selectTest} />
        )}
      </Box>
      <BottomBar activeScreen={screen} />
    </Box>
  );
}
