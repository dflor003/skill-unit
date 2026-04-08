import { useState, useEffect, useRef, useCallback } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { runTest } from '../../core/runner.js';
import { gradeTest } from '../../core/grader.js';
import { generateReport } from '../../core/reporter.js';
import { recordRun } from '../../core/stats.js';
import type { TestStatus, RunResult, TestResult } from '../../types/run.js';
import type { Manifest, ManifestTestCase, Spec, TestCase } from '../../types/spec.js';
import type { SkillUnitConfig } from '../../types/config.js';

const STATS_BASE_DIR = '.skill-unit';

export interface TestRunEntry {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  transcript: string[];
  gradeTranscript: string[];
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

interface RunTask {
  manifest: Manifest;
  testCase: ManifestTestCase;
  spec: Spec;
}

export function useTestRun(): [TestRunState, TestRunActions] {
  const [state, setState] = useState<TestRunState>(INITIAL_STATE);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBuffers = useRef<Map<string, string[]>>(new Map());
  const gradeTranscriptBuffers = useRef<Map<string, string[]>>(new Map());
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
    const gradeBuffers = gradeTranscriptBuffers.current;
    if (buffers.size === 0 && gradeBuffers.size === 0) return;

    setState(prev => {
      let changed = false;
      const updatedTests = prev.tests.map(t => {
        const pending = buffers.get(t.id);
        const gradePending = gradeBuffers.get(t.id);
        if ((pending && pending.length > 0) || (gradePending && gradePending.length > 0)) {
          changed = true;
          return {
            ...t,
            transcript: pending && pending.length > 0 ? [...t.transcript, ...pending] : t.transcript,
            gradeTranscript: gradePending && gradePending.length > 0 ? [...t.gradeTranscript, ...gradePending] : t.gradeTranscript,
          };
        }
        return t;
      });
      if (changed) {
        buffers.clear();
        gradeBuffers.clear();
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
      gradeTranscriptBuffers.current.clear();

      const entries: TestRunEntry[] = tests.map(t => ({
        id: t.id,
        name: t.name,
        specName: t.specName,
        status: 'pending',
        durationMs: 0,
        transcript: [],
        gradeTranscript: [],
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
      const maxConcurrency = config.runner.concurrency || 5;

      // Build flat task list -- each entry has manifest, testCase, and the full spec
      const allTasks: RunTask[] = [];
      for (const manifest of manifests) {
        for (const tc of manifest['test-cases']) {
          const spec = specs.find(s =>
            s.frontmatter.name === manifest['spec-name'] ||
            path.basename(s.path, '.spec.md') === manifest['spec-name'],
          );
          if (spec) allTasks.push({ manifest, testCase: tc, spec });
        }
      }

      let active = 0;
      let nextIdx = 0;
      let completedCount = 0;
      let totalCost = 0;
      let totalTokens = 0;
      const totalTasks = allTasks.length;
      const gradingQueue: RunTask[] = [];

      function checkRunComplete(): void {
        if (completedCount >= totalTasks) {
          flushTranscripts();
          // Generate report
          const runDir = path.join('.workspace', 'runs', timestamp);
          const reportResult = generateReport(runDir);

          // Build RunResult for stats recording
          const testResults: TestResult[] = allTasks.map(task => {
            const specName = task.manifest['spec-name'];
            const specGroup = reportResult.grouped[specName];
            const graded = specGroup?.find(r => r.testId === task.testCase.id);
            const passed = graded ? graded.passed : false;

            let testName = task.testCase.id;
            for (const spec of specs) {
              const tc = spec.testCases.find((c: TestCase) => c.id === task.testCase.id);
              if (tc) { testName = tc.name; break; }
            }

            return {
              id: task.testCase.id,
              name: testName,
              specName,
              status: (passed ? 'passed' : 'failed') as TestStatus,
              durationMs: 0,
              passed,
              passedChecks: graded?.passedChecks ?? 0,
              failedChecks: graded?.failedChecks ?? 0,
              totalChecks: graded?.totalChecks ?? 0,
              expectationLines: graded?.expectationLines ?? [],
              negativeExpectationLines: graded?.negativeExpectationLines ?? [],
            };
          });

          const totalPassed = testResults.filter(t => t.passed).length;
          const totalFailed = testResults.filter(t => !t.passed).length;
          const totalDuration = startTimeRef.current ? Date.now() - startTimeRef.current : 0;

          const runResult: RunResult = {
            id: timestamp,
            timestamp,
            testCount: testResults.length,
            passed: totalPassed,
            failed: totalFailed,
            durationMs: totalDuration,
            cost: totalCost,
            tokens: totalTokens,
            tests: testResults,
            reportPath: reportResult.reportPath,
          };

          try { recordRun(runResult, STATS_BASE_DIR); } catch { /* Non-fatal */ }
          completeRun();
        }
      }

      function startGrading(task: RunTask): void {
        const fullTestCase = task.spec.testCases.find((tc: TestCase) => tc.id === task.testCase.id);
        if (!fullTestCase) {
          updateTest(task.testCase.id, { status: 'error', activity: 'Test case not found' });
          completedCount++;
          active--;
          tryNext();
          checkRunComplete();
          return;
        }

        updateTest(task.testCase.id, { status: 'grading', activity: 'Grading...' });

        const specName = task.manifest['spec-name'];
        const transcriptPath = path.join(
          '.workspace', 'runs', timestamp, 'results',
          `${specName}.${task.testCase.id}.transcript.md`,
        );

        const gradeHandle = gradeTest(fullTestCase, transcriptPath, config, specName, timestamp);

        gradeHandle.on('output', (chunk: string) => {
          const buf = gradeTranscriptBuffers.current.get(task.testCase.id) ?? [];
          buf.push(chunk);
          gradeTranscriptBuffers.current.set(task.testCase.id, buf);
        });

        gradeHandle.on('complete', (result) => {
          // Parse the results file to determine pass/fail (exit code only indicates
          // whether the grader process ran successfully, not the test verdict)
          let passed = false;
          const resultsPath = path.join(
            '.workspace', 'runs', timestamp, 'results',
            `${specName}.${task.testCase.id}.results.md`,
          );
          try {
            const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
            passed = /(?:^#+\s*|^\*\*)(?:Verdict|Result)[:\s]*\**\s*PASS\b/im.test(resultsContent);
          } catch {
            // If results file can't be read, fall back to grader exit code
            passed = result.exitCode === 0;
          }
          updateTest(task.testCase.id, {
            status: passed ? 'passed' : 'failed',
            activity: '',
          });
          completedCount++;
          active--;
          tryNext();
          checkRunComplete();
        });
      }

      function tryNext(): void {
        // Start new execution tasks
        while (active < maxConcurrency && nextIdx < allTasks.length) {
          const taskIdx = nextIdx++;
          const task = allTasks[taskIdx];
          active++;

          updateTest(task.testCase.id, { status: 'running', activity: 'Starting...' });

          const handle = runTest(task.manifest, task.testCase, config, { silent: true });

          handle.on('output', (chunk: string) => {
            const buf = transcriptBuffers.current.get(task.testCase.id) ?? [];
            buf.push(chunk);
            transcriptBuffers.current.set(task.testCase.id, buf);
          });

          handle.on('tool-use', (name: string) => {
            updateTest(task.testCase.id, { activity: `Using ${name}...` });
          });

          handle.on('complete', (result) => {
            updateTest(task.testCase.id, { durationMs: result.durationMs, activity: '' });
            totalCost += result.costUsd ?? 0;
            totalTokens += (result.inputTokens ?? 0) + (result.outputTokens ?? 0);
            active--; // Release execution slot

            if (result.timedOut) {
              updateTest(task.testCase.id, { status: 'timedout' });
              completedCount++;
            } else if (result.exitCode !== 0) {
              updateTest(task.testCase.id, { status: 'error' });
              completedCount++;
            } else {
              // Queue grading
              if (active < maxConcurrency) {
                active++;
                startGrading(task);
              } else {
                gradingQueue.push(task);
              }
            }
            tryNext();
            checkRunComplete();
          });

          handle.on('error', (err: Error) => {
            updateTest(task.testCase.id, { status: 'error', activity: err.message });
            completedCount++;
            active--;
            tryNext();
            checkRunComplete();
          });
        }

        // Process grading queue if slots available
        while (active < maxConcurrency && gradingQueue.length > 0) {
          const task = gradingQueue.shift()!;
          active++;
          startGrading(task);
        }
      }

      tryNext();
    },
    [updateTest, completeRun, flushTranscripts],
  );

  const actions: TestRunActions = { startRun, executeRun, selectTest, updateTest, completeRun };
  return [state, actions];
}
