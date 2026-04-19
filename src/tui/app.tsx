import React, { useState, useEffect, useCallback } from 'react';
import path from 'node:path';
import { Box, useApp, useInput, useStdout } from 'ink';
import {
  BottomBar,
  type Screen,
  type RunViewMode,
} from './components/bottom-bar.js';
import { ContextBar, type ContextHint } from './components/context-bar.js';
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
import { loadIndex, cleanupRuns } from '../core/stats.js';
import { saveConfig } from '../config/loader.js';
import type { Spec } from '../types/spec.js';
import type { StatsIndex } from '../types/run.js';
import type { SkillUnitConfig } from '../types/config.js';

const STATS_BASE_DIR = '.skill-unit';

export function App() {
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
  const [isEditingField, setIsEditingField] = useState(false);
  const [runnerViewMode, setRunnerViewMode] = useState<RunViewMode>('primary');
  const [contextHints, setContextHints] = useState<ContextHint[]>([]);
  const handleContextHintsChange = useCallback((hints: ContextHint[]) => {
    setContextHints(hints);
  }, []);
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

  const NAV_SCREENS: Screen[] = ['dashboard', 'runs', 'stats', 'options'];

  useInput((input, key) => {
    // Modal dialogs and text editors absorb all input
    if (showCancelDialog || showCleanupDialog || isEditingField) return;

    const isRunnerActive = screen === 'runner' && runState.status === 'running';

    // Escape handling
    if (key.escape) {
      if (isRunnerActive) {
        setShowCancelDialog(true);
        return;
      }
      if (screen === 'runner') {
        setScreen(previousScreen);
        return;
      }
      return;
    }

    // Backspace = back from runner (only when not running)
    if (key.backspace || key.delete) {
      if (screen === 'runner' && !isRunnerActive) {
        setScreen(previousScreen);
        return;
      }
    }

    // Block all global nav during active run
    if (isRunnerActive) return;

    // Nav shortcuts are uppercase-only (Shift+letter) so they never collide
    // with typing into text inputs like the dashboard search box.
    if (input === 'D') setScreen('dashboard');
    if (input === 'R') setScreen('runs');
    if (input === 'S') setScreen('stats');
    if (input === 'O') setScreen('options');
    if (key.tab) {
      setScreen((prev) => {
        const idx = NAV_SCREENS.indexOf(prev);
        const delta = key.shift ? -1 : 1;
        return NAV_SCREENS[
          (idx + delta + NAV_SCREENS.length) % NAV_SCREENS.length
        ];
      });
    }
    if (input === 'Q' || (key.ctrl && input === 'c')) exit();
  });

  return (
    <Box flexDirection="column" height={termHeight}>
      {showCancelDialog ? (
        <ConfirmDialog
          message="Cancel the run?"
          onConfirm={handleCancelConfirm}
          onDismiss={handleCancelDismiss}
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
              onContextHintsChange={handleContextHintsChange}
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
              onViewRun={handleViewRun}
              onContextHintsChange={handleContextHintsChange}
            />
          )}
          {screen === 'stats' && (
            <Statistics
              index={statsIndex}
              onContextHintsChange={handleContextHintsChange}
            />
          )}
          {screen === 'options' && (
            <Options
              config={appConfig}
              onSave={handleSaveConfig}
              onEditingChange={setIsEditingField}
              onContextHintsChange={handleContextHintsChange}
            />
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
              onViewModeChange={setRunnerViewMode}
            />
          )}
        </Box>
      )}
      {screen !== 'runner' && !showCleanupDialog && (
        <ContextBar hints={contextHints} />
      )}
      <BottomBar
        activeScreen={screen}
        runStatus={screen === 'runner' ? runState.status : undefined}
        runViewMode={screen === 'runner' ? runnerViewMode : undefined}
      />
    </Box>
  );
}
