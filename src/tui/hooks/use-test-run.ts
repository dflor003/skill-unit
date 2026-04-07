import { useState, useEffect, useRef, useCallback } from 'react';
import path from 'node:path';
import { runTest } from '../../core/runner.js';
import { gradeSpecs } from '../../core/grader.js';
import { generateReport } from '../../core/reporter.js';
import { recordRun } from '../../core/stats.js';
import type { TestStatus, RunResult, TestResult } from '../../types/run.js';
import type { Manifest, ManifestTestCase, Spec } from '../../types/spec.js';
import type { SkillUnitConfig } from '../../types/config.js';

const STATS_BASE_DIR = '.skill-unit';

export interface TestRunEntry {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  transcript: string[];
  activity: string;
}

export interface TestRunState {
  status: 'idle' | 'running' | 'complete';
  tests: TestRunEntry[];
  activeTestId: string | null;
  elapsed: number;
}

export interface TestRunActions {
  startRun: (tests: Array<{ id: string; name: string; specName: string }>) => void;
  executeRun: (
    manifests: Manifest[],
    specs: Spec[],
    config: SkillUnitConfig,
    timestamp: string,
  ) => void;
  selectTest: (id: string) => void;
  updateTest: (id: string, patch: Partial<TestRunEntry>) => void;
  completeRun: () => void;
}

const INITIAL_STATE: TestRunState = {
  status: 'idle',
  tests: [],
  activeTestId: null,
  elapsed: 0,
};

// Throttle helper: buffers transcript lines and flushes periodically
const TRANSCRIPT_FLUSH_MS = 200;

export function useTestRun(): [TestRunState, TestRunActions] {
  const [state, setState] = useState<TestRunState>(INITIAL_STATE);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBuffers = useRef<Map<string, string[]>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
      }
    };
  }, []);

  const updateTest = useCallback((id: string, patch: Partial<TestRunEntry>) => {
    setState(prev => ({
      ...prev,
      tests: prev.tests.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const completeRun = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (flushTimerRef.current !== null) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setState(prev => ({ ...prev, status: 'complete' }));
  }, []);

  const selectTest = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeTestId: id }));
  }, []);

  // Flush buffered transcript lines into state
  const flushTranscripts = useCallback(() => {
    const buffers = transcriptBuffers.current;
    if (buffers.size === 0) return;

    setState(prev => {
      let changed = false;
      const updatedTests = prev.tests.map(t => {
        const pending = buffers.get(t.id);
        if (pending && pending.length > 0) {
          changed = true;
          return { ...t, transcript: [...t.transcript, ...pending] };
        }
        return t;
      });
      if (changed) {
        buffers.clear();
        return { ...prev, tests: updatedTests };
      }
      return prev;
    });
  }, []);

  const startRun = useCallback(
    (tests: Array<{ id: string; name: string; specName: string }>) => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
      }
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current);
      }

      transcriptBuffers.current.clear();

      const entries: TestRunEntry[] = tests.map(t => ({
        id: t.id,
        name: t.name,
        specName: t.specName,
        status: 'pending',
        durationMs: 0,
        transcript: [],
        activity: '',
      }));

      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          setState(prev => ({
            ...prev,
            elapsed: Date.now() - startTimeRef.current!,
          }));
        }
      }, 250);

      // Periodically flush buffered transcript lines
      flushTimerRef.current = setInterval(flushTranscripts, TRANSCRIPT_FLUSH_MS);

      setState({
        status: 'running',
        tests: entries,
        activeTestId: entries[0]?.id ?? null,
        elapsed: 0,
      });
    },
    [flushTranscripts],
  );

  const executeRun = useCallback(
    (
      manifests: Manifest[],
      specs: Spec[],
      config: SkillUnitConfig,
      timestamp: string,
    ) => {
      const concurrency = config.runner['runner-concurrency'] || 5;

      // Build flat task list
      const allTasks: Array<{ manifest: Manifest; testCase: ManifestTestCase }> = [];
      for (const manifest of manifests) {
        for (const tc of manifest['test-cases']) {
          allTasks.push({ manifest, testCase: tc });
        }
      }

      // Run each test, managing concurrency with a simple semaphore
      let active = 0;
      let nextIdx = 0;
      const results: Array<{ manifest: Manifest; testCase: ManifestTestCase; exitCode: number; timedOut: boolean; durationMs: number }> = [];

      function tryNext(): void {
        while (active < concurrency && nextIdx < allTasks.length) {
          const taskIdx = nextIdx++;
          const { manifest, testCase } = allTasks[taskIdx];
          active++;

          updateTest(testCase.id, { status: 'running', activity: 'Starting...' });

          const handle = runTest(manifest, testCase, config, { silent: true });

          handle.on('output', (chunk: string) => {
            // Buffer transcript lines to avoid excessive re-renders
            const buf = transcriptBuffers.current.get(testCase.id) ?? [];
            buf.push(chunk);
            transcriptBuffers.current.set(testCase.id, buf);
          });

          handle.on('tool-use', (name: string) => {
            updateTest(testCase.id, { activity: `Using ${name}...` });
          });

          handle.on('complete', (result) => {
            const status: TestStatus = result.timedOut
              ? 'timedout'
              : result.exitCode === 0
                ? 'grading'
                : 'error';

            updateTest(testCase.id, {
              status,
              durationMs: result.durationMs,
              activity: status === 'grading' ? 'Awaiting grading' : '',
            });

            results.push({ manifest, testCase, ...result });
            active--;

            // Check if all tests are done
            if (results.length === allTasks.length) {
              onAllTestsDone(results);
            } else {
              tryNext();
            }
          });

          handle.on('error', (err: Error) => {
            updateTest(testCase.id, {
              status: 'error',
              activity: err.message,
            });

            results.push({ manifest, testCase, exitCode: 1, timedOut: false, durationMs: 0 });
            active--;

            if (results.length === allTasks.length) {
              onAllTestsDone(results);
            } else {
              tryNext();
            }
          });
        }
      }

      async function onAllTestsDone(
        runResults: Array<{ manifest: Manifest; testCase: ManifestTestCase; exitCode: number; timedOut: boolean; durationMs: number }>,
      ): Promise<void> {
        // Flush any remaining transcript lines
        flushTranscripts();

        // Mark all non-error tests as grading
        for (const r of runResults) {
          if (r.exitCode === 0) {
            updateTest(r.testCase.id, { status: 'grading', activity: 'Grading...' });
          }
        }

        // Grade
        try {
          await gradeSpecs(specs, config, timestamp, { silent: true });
        } catch {
          // Non-fatal: grading may fail if CLI harness is unavailable
        }

        // Generate report
        const runDir = path.join('.workspace', 'runs', timestamp);
        const reportResult = generateReport(runDir);

        // Build RunResult
        const testResultList: TestResult[] = runResults.map((tr) => {
          const specName = tr.manifest['spec-name'];
          const specGroup = reportResult.grouped[specName];
          const graded = specGroup?.find((r) => r.testId === tr.testCase.id);
          const passed = graded ? graded.passed : tr.exitCode === 0;

          // Look up test name from specs
          let testName = tr.testCase.id;
          for (const spec of specs) {
            const tc = spec.testCases.find((c) => c.id === tr.testCase.id);
            if (tc) {
              testName = tc.name;
              break;
            }
          }

          const finalStatus: TestStatus = tr.timedOut
            ? 'timedout'
            : tr.exitCode !== 0 && !graded
              ? 'error'
              : passed
                ? 'passed'
                : 'failed';

          // Update TUI state with final status
          updateTest(tr.testCase.id, {
            status: finalStatus,
            activity: '',
          });

          return {
            id: tr.testCase.id,
            name: testName,
            specName,
            status: finalStatus,
            durationMs: tr.durationMs,
            passed,
            passedChecks: graded?.passedChecks ?? 0,
            failedChecks: graded?.failedChecks ?? 0,
            totalChecks: graded?.totalChecks ?? 0,
            expectationLines: graded?.expectationLines ?? [],
            negativeExpectationLines: graded?.negativeExpectationLines ?? [],
          };
        });

        const totalPassed = testResultList.filter((t) => t.passed).length;
        const totalFailed = testResultList.filter((t) => !t.passed).length;
        const totalDuration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

        const runResult: RunResult = {
          id: timestamp,
          timestamp,
          testCount: testResultList.length,
          passed: totalPassed,
          failed: totalFailed,
          durationMs: totalDuration,
          cost: 0,
          tokens: 0,
          tests: testResultList,
          reportPath: reportResult.reportPath,
        };

        // Record stats
        try {
          recordRun(runResult, STATS_BASE_DIR);
        } catch {
          // Non-fatal
        }

        completeRun();
      }

      // Kick off
      tryNext();
    },
    [updateTest, completeRun, flushTranscripts],
  );

  const actions: TestRunActions = { startRun, executeRun, selectTest, updateTest, completeRun };
  return [state, actions];
}
