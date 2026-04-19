import React, { useState, useEffect } from 'react';
import path from 'node:path';
import { Box, useApp, useStdout } from 'ink';
import {
  KeyboardRegistryProvider,
  useKeyboardShortcuts,
} from './keyboard/index.js';
import { BottomBar, type Screen } from './components/bottom-bar.js';
import { ConfirmDialog } from './components/confirm-dialog.js';
import { CleanupDialog } from './components/cleanup-dialog.js';
import { Dashboard } from './screens/dashboard.js';
import { Runner } from './screens/runner.js';
import { RunManager } from './screens/runs.js';
import { Statistics } from './screens/stats.js';
import { Options } from './screens/options.js';
import { useTestRun, type TestRunState } from './hooks/use-test-run.js';
import { loadHistoricalRun } from './hooks/use-historical-run.js';
import { loadConfig, CONFIG_DEFAULTS } from '../config/loader.js';
import { discoverSpecPaths } from '../core/discovery.js';
import {
  parseSpecFile,
  buildManifest,
  formatTimestamp,
} from '../core/compiler.js';
import { loadIndex, cleanupRuns, deleteRun } from '../core/stats.js';
import { saveConfig } from '../config/loader.js';
import type { Spec } from '../types/spec.js';
import type { StatsIndex } from '../types/run.js';
import type { SkillUnitConfig } from '../types/config.js';

const STATS_BASE_DIR = '.skill-unit';

export function App() {
  return (
    <KeyboardRegistryProvider>
      <AppInner />
    </KeyboardRegistryProvider>
  );
}

const NAV_SCREENS: Screen[] = ['dashboard', 'runs', 'stats', 'options'];

function AppInner() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [previousScreen, setPreviousScreen] = useState<Screen>('dashboard');
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [appConfig, setAppConfig] = useState<SkillUnitConfig>(CONFIG_DEFAULTS);
  const [statsIndex, setStatsIndex] = useState<StatsIndex>(() => ({
    version: 1,
    lastUpdated: new Date().toISOString(),
    aggregate: {
      totalRuns: 0,
      totalTests: 0,
      passRate: 0,
      totalCost: 0,
      totalTokens: 0,
    },
    tests: {},
    runs: [],
  }));
  const [runState, { startRun, executeRun, selectTest, cancelRun }] =
    useTestRun();

  // Refresh stats index when a run completes
  useEffect(() => {
    if (runState.status === 'complete') {
      try {
        const index = loadIndex(STATS_BASE_DIR);
        setStatsIndex(index);
      } catch {
        // Non-fatal
      }
    }
  }, [runState.status]);
  const [historicalRun, setHistoricalRun] = useState<TestRunState | null>(null);
  const [historicalActiveTestId, setHistoricalActiveTestId] = useState<
    string | null
  >(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [pendingDeleteRunId, setPendingDeleteRunId] = useState<string | null>(
    null
  );
  const { stdout } = useStdout();
  const { exit } = useApp();
  const [termHeight, setTermHeight] = useState(stdout?.rows ?? 24);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => setTermHeight(stdout.rows);
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  useEffect(() => {
    try {
      const config = loadConfig('.skill-unit.yml');
      setAppConfig(config);
      const paths = discoverSpecPaths(config['test-dir']);
      const loaded = paths.map((p) => parseSpecFile(p));
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

  function handleSaveConfig(config: SkillUnitConfig) {
    saveConfig('.skill-unit.yml', config);
    setAppConfig(config);
  }

  function handleCleanup() {
    setShowCleanupDialog(true);
  }

  function handleCleanupConfirm(keepCount: number) {
    setShowCleanupDialog(false);
    try {
      cleanupRuns(STATS_BASE_DIR, keepCount);
      const index = loadIndex(STATS_BASE_DIR);
      setStatsIndex(index);
    } catch {
      // Non-fatal
    }
  }

  function handleCleanupDismiss() {
    setShowCleanupDialog(false);
  }

  function handleDeleteRun(id: string) {
    setPendingDeleteRunId(id);
  }

  function handleDeleteRunConfirm() {
    const id = pendingDeleteRunId;
    setPendingDeleteRunId(null);
    if (!id) return;
    try {
      deleteRun(STATS_BASE_DIR, id);
      const index = loadIndex(STATS_BASE_DIR);
      setStatsIndex(index);
    } catch {
      // Non-fatal
    }
  }

  function handleDeleteRunDismiss() {
    setPendingDeleteRunId(null);
  }

  function handleRerunTests(testIds: string[]) {
    const currentTests = historicalRun?.tests ?? runState.tests;
    const testsToRerun = currentTests.filter((t) => testIds.includes(t.id));
    if (testsToRerun.length === 0) return;

    setHistoricalRun(null);

    const selectedTestIds = new Set(testIds);
    const timestamp = formatTimestamp(new Date());

    const matchedSpecNames = new Set(testsToRerun.map((t) => t.specName));
    const selectedSpecs = specs.filter((s) => {
      const specName = s.frontmatter.name || path.basename(s.path, '.spec.md');
      return matchedSpecNames.has(specName);
    });

    const manifests = selectedSpecs
      .map((spec) => {
        const manifest = buildManifest(spec, appConfig, { timestamp });
        manifest['test-cases'] = manifest['test-cases'].filter((tc) =>
          selectedTestIds.has(tc.id)
        );
        return manifest;
      })
      .filter((m) => m['test-cases'].length > 0);

    startRun(
      testsToRerun.map((t) => ({
        id: t.id,
        name: t.name,
        specName: t.specName,
      }))
    );

    executeRun(manifests, selectedSpecs, appConfig, timestamp);
  }

  function handleViewRun(run: StatsIndex['runs'][number]) {
    const runDir = path.join('.workspace', 'runs', run.id);
    const data = loadHistoricalRun(runDir, run);
    setHistoricalRun(data);
    setHistoricalActiveTestId(data.activeTestId);
    setPreviousScreen('runs');
    setScreen('runner');
  }

  function handleCancelConfirm() {
    cancelRun();
    setShowCancelDialog(false);
  }

  function handleCancelDismiss() {
    setShowCancelDialog(false);
  }

  const isRunnerActive = screen === 'runner' && runState.status === 'running';

  const cycleScreen = (delta: 1 | -1) => {
    setScreen((prev) => {
      const idx = NAV_SCREENS.indexOf(prev);
      return NAV_SCREENS[
        (idx + delta + NAV_SCREENS.length) % NAV_SCREENS.length
      ]!;
    });
  };

  useKeyboardShortcuts([
    { keys: 'ctrl+c', handler: exit },
    { keys: ['q', 'Q'], handler: exit, enabled: !isRunnerActive },

    {
      keys: 'escape',
      handler: () => setShowCancelDialog(true),
      enabled: isRunnerActive,
    },
    {
      keys: 'escape',
      handler: () => setScreen(previousScreen),
      enabled: screen === 'runner' && !isRunnerActive,
    },
    {
      keys: ['backspace', 'delete'],
      handler: () => setScreen(previousScreen),
      enabled: screen === 'runner' && !isRunnerActive,
    },

    {
      keys: ['d', 'D'],
      handler: () => setScreen('dashboard'),
      enabled: !isRunnerActive,
    },
    {
      keys: ['r', 'R'],
      handler: () => setScreen('runs'),
      enabled: !isRunnerActive,
    },
    {
      keys: ['s', 'S'],
      handler: () => setScreen('stats'),
      enabled: !isRunnerActive,
    },
    {
      keys: ['o', 'O'],
      handler: () => setScreen('options'),
      enabled: !isRunnerActive,
    },
    { keys: 'tab', handler: () => cycleScreen(1), enabled: !isRunnerActive },
    {
      keys: 'shift+tab',
      handler: () => cycleScreen(-1),
      enabled: !isRunnerActive,
    },
  ]);

  return (
    <Box flexDirection="column" height={termHeight}>
      {showCancelDialog ? (
        <ConfirmDialog
          message="Cancel the run?"
          onConfirm={handleCancelConfirm}
          onDismiss={handleCancelDismiss}
        />
      ) : pendingDeleteRunId ? (
        <ConfirmDialog
          message={`Delete run ${pendingDeleteRunId}?`}
          onConfirm={handleDeleteRunConfirm}
          onDismiss={handleDeleteRunDismiss}
        />
      ) : showCleanupDialog ? (
        <CleanupDialog
          totalRuns={statsIndex.runs.length}
          onConfirm={handleCleanupConfirm}
          onDismiss={handleCleanupDismiss}
        />
      ) : (
        <Box flexGrow={1} flexDirection="column" paddingX={1}>
          {screen === 'dashboard' && (
            <Dashboard
              specs={specs}
              testDir={appConfig['test-dir']}
              onRunTests={(tests) => {
                setHistoricalRun(null);
                setPreviousScreen('dashboard');
                startRun(
                  tests.map((t) => ({
                    id: t.testCase.id,
                    name: t.testCase.name,
                    specName: t.specName,
                  }))
                );
                setScreen('runner');

                const timestamp = formatTimestamp(new Date());
                const specPathSet = new Set(tests.map((t) => t.specPath));
                const selectedSpecs = specs.filter((s) =>
                  specPathSet.has(s.path)
                );
                const selectedTestIds = new Set(
                  tests.map((t) => t.testCase.id)
                );
                const manifests = selectedSpecs
                  .map((spec) => {
                    const manifest = buildManifest(spec, appConfig, {
                      timestamp,
                    });
                    manifest['test-cases'] = manifest['test-cases'].filter(
                      (tc) => selectedTestIds.has(tc.id)
                    );
                    return manifest;
                  })
                  .filter((m) => m['test-cases'].length > 0);

                executeRun(manifests, selectedSpecs, appConfig, timestamp);
              }}
            />
          )}
          {screen === 'runs' && (
            <RunManager
              runs={statsIndex.runs}
              onCleanup={handleCleanup}
              onDeleteRun={handleDeleteRun}
              onViewRun={handleViewRun}
            />
          )}
          {screen === 'stats' && <Statistics index={statsIndex} />}
          {screen === 'options' && (
            <Options config={appConfig} onSave={handleSaveConfig} />
          )}
          {screen === 'runner' && (
            <Runner
              runState={
                historicalRun
                  ? {
                      ...historicalRun,
                      activeTestId:
                        historicalActiveTestId ?? historicalRun.activeTestId,
                    }
                  : runState
              }
              onSelectTest={
                historicalRun ? setHistoricalActiveTestId : selectTest
              }
              onRerunTests={handleRerunTests}
            />
          )}
        </Box>
      )}
      <BottomBar
        activeScreen={screen}
        runStatus={screen === 'runner' ? runState.status : undefined}
      />
    </Box>
  );
}
