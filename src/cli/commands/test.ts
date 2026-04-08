import path from 'node:path';
import { defineCommand } from 'citty';
import { loadConfig } from '../../config/loader.js';
import { discoverSpecPaths, filterSpecs } from '../../core/discovery.js';
import { parseSpecFile, buildManifest, formatTimestamp } from '../../core/compiler.js';
import { runTest } from '../../core/runner.js';
import { gradeSpecs } from '../../core/grader.js';
import { generateReport, generateSummary } from '../../core/reporter.js';
import { recordRun } from '../../core/stats.js';
import { createLogger } from '../../core/logger.js';
import type { SpecFilter, Manifest, ManifestTestCase } from '../../types/spec.js';
import type { RunResult, TestResult } from '../../types/run.js';
import type { SkillUnitConfig } from '../../types/config.js';

const STATS_BASE_DIR = '.skill-unit';

// -- Semaphore for concurrency control ----------------------------------------

class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// -- Wrap RunHandle events into a promise -------------------------------------

function runTestAsync(
  manifest: Manifest,
  testCase: ManifestTestCase,
  config: SkillUnitConfig,
  noStream: boolean,
): Promise<{ exitCode: number; timedOut: boolean; durationMs: number; costUsd: number; inputTokens: number; outputTokens: number }> {
  return new Promise((resolve, reject) => {
    const handle = runTest(manifest, testCase, config);

    handle.on('output', (chunk: string) => {
      if (!noStream) {
        process.stderr.write(chunk);
      }
    });

    handle.on('complete', (result) => {
      resolve(result);
    });

    handle.on('error', (err) => {
      reject(err);
    });
  });
}

export const testCommand = defineCommand({
  meta: {
    name: 'test',
    description: 'Run tests from spec files (full test pipeline)',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file',
      default: '.skill-unit.yml',
    },
    all: {
      type: 'boolean',
      description: 'Run all tests (required when no other filters are provided)',
    },
    file: {
      type: 'string',
      alias: 'f',
      description: 'Filter by file path',
    },
    tag: {
      type: 'string',
      description: 'Filter by tag',
    },
    test: {
      type: 'string',
      description: 'Filter by test case IDs (comma-separated)',
    },
    name: {
      type: 'string',
      description: 'Filter by spec name',
    },
    model: {
      type: 'string',
      description: 'Override model for runner',
    },
    timeout: {
      type: 'string',
      description: 'Override timeout (e.g. 60s, 2m)',
    },
    'max-turns': {
      type: 'string',
      description: 'Override max turns for runner',
    },
    'keep-workspaces': {
      type: 'boolean',
      description: 'Keep temporary workspaces after test run',
    },
    ci: {
      type: 'boolean',
      description: 'Enable CI mode (non-interactive, exits non-zero on failure)',
    },
    'no-stream': {
      type: 'boolean',
      description: 'Disable streaming output',
    },
  },
  async run({ args, rawArgs }) {
    const log = createLogger('test');
    const config = loadConfig(args.config ?? '.skill-unit.yml');

    // Build filter from args
    const filter: SpecFilter = {};
    if (args.name) filter.name = args.name.split(',').map((n: string) => n.trim());
    if (args.tag) filter.tag = args.tag.split(',').map((t: string) => t.trim());
    if (args.file) filter.file = args.file.split(',').map((f: string) => f.trim());
    if (args.test) filter.test = args.test.split(',').map((t: string) => t.trim());

    const hasFilter = args.all || args.name || args.tag || args.file || args.test;

    // Collect positional args as additional name filters
    const knownValues = [args.config, args.name, args.tag, args.file, args.test, args.model, args.timeout, args['max-turns']].filter(Boolean);
    const positional = rawArgs.filter((a) => !a.startsWith('-') && !knownValues.includes(a));
    if (positional.length > 0) {
      filter.name = [...(filter.name ?? []), ...positional];
    }

    const hasAnyFilter = hasFilter || positional.length > 0;

    if (!hasAnyFilter) {
      log.error('No filter specified. Use --all to run all tests, or specify --name, --tag, --file, or --test.');
      process.stderr.write('Use --all to run all tests or provide a filter.\n');
      process.exit(1);
    }

    const specPaths = discoverSpecPaths(config['test-dir']);
    const specs = specPaths.map((p) => parseSpecFile(p));
    const filtered = filterSpecs(specs, filter);

    if (filtered.length === 0) {
      log.warn('No spec files found matching filters');
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const modelOverride = args.model ?? null;
    const timeoutOverride = args.timeout ?? null;
    const maxTurnsOverride = args['max-turns'] ? parseInt(args['max-turns'], 10) : null;
    const noStream = !!args['no-stream'];

    const manifests = filtered.map((spec) =>
      buildManifest(spec, config, { timestamp, modelOverride, timeoutOverride, maxTurnsOverride }),
    );

    log.info(`Compiled ${manifests.length} manifest${manifests.length === 1 ? '' : 's'}`);
    for (const manifest of manifests) {
      log.verbose(`  ${manifest['spec-name']}: ${manifest['test-cases'].length} test case${manifest['test-cases'].length === 1 ? '' : 's'}`);
    }

    // -- Phase 1: Run all tests with concurrency control -----------------------

    const concurrency = config.runner.concurrency || 5;
    const semaphore = new Semaphore(concurrency);
    const runStartTime = Date.now();

    interface TestRunResult {
      manifest: Manifest;
      testCase: ManifestTestCase;
      exitCode: number;
      timedOut: boolean;
      durationMs: number;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
    }

    // Build a flat list of all (manifest, testCase) pairs
    const allTasks: Array<{ manifest: Manifest; testCase: ManifestTestCase }> = [];
    for (const manifest of manifests) {
      for (const tc of manifest['test-cases']) {
        allTasks.push({ manifest, testCase: tc });
      }
    }

    log.info(`Running ${allTasks.length} test${allTasks.length === 1 ? '' : 's'} (concurrency: ${concurrency})`);

    const testRunResults: TestRunResult[] = await Promise.all(
      allTasks.map(async ({ manifest, testCase }) => {
        await semaphore.acquire();
        try {
          const result = await runTestAsync(manifest, testCase, config, noStream);
          return { manifest, testCase, ...result };
        } catch (err) {
          log.error(`[${testCase.id}]: ${err instanceof Error ? err.message : String(err)}`);
          return { manifest, testCase, exitCode: 1, timedOut: false, durationMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 };
        } finally {
          semaphore.release();
        }
      }),
    );

    const runDurationMs = Date.now() - runStartTime;

    // -- Phase 2: Grade all tests -----------------------------------------------

    log.info('Grading test results...');
    await gradeSpecs(filtered, config, timestamp);

    // -- Phase 3: Generate report -----------------------------------------------

    const runDir = path.join('.workspace', 'runs', timestamp);
    const reportResult = generateReport(runDir);

    // -- Phase 4: Build RunResult and record stats ------------------------------

    // Map graded results back to test results
    const testResults: TestResult[] = testRunResults.map((tr) => {
      const specName = tr.manifest['spec-name'];
      // Find the corresponding parsed result from the report (if available)
      const specGroup = reportResult.grouped[specName];
      const graded = specGroup?.find((r) => r.testId === tr.testCase.id);

      const passed = graded ? graded.passed : tr.exitCode === 0;
      const testStatus = tr.timedOut
        ? 'timedout' as const
        : tr.exitCode !== 0 && !graded
          ? 'error' as const
          : passed
            ? 'passed' as const
            : 'failed' as const;

      // Look up the test name from the filtered specs
      let testName = tr.testCase.id;
      for (const spec of filtered) {
        const tc = spec.testCases.find((c) => c.id === tr.testCase.id);
        if (tc) {
          testName = tc.name;
          break;
        }
      }

      return {
        id: tr.testCase.id,
        name: testName,
        specName,
        status: testStatus,
        durationMs: tr.durationMs,
        passed,
        passedChecks: graded?.passedChecks ?? 0,
        failedChecks: graded?.failedChecks ?? 0,
        totalChecks: graded?.totalChecks ?? 0,
        expectationLines: graded?.expectationLines ?? [],
        negativeExpectationLines: graded?.negativeExpectationLines ?? [],
        transcriptPath: path.join(runDir, 'results', `${specName}.${tr.testCase.id}.transcript.md`),
        resultPath: graded ? path.join(runDir, 'results', graded.fileName) : undefined,
      };
    });

    const totalPassed = testResults.filter((t) => t.passed).length;
    const totalFailed = testResults.filter((t) => !t.passed).length;

    const runResult: RunResult = {
      id: timestamp,
      timestamp,
      testCount: testResults.length,
      passed: totalPassed,
      failed: totalFailed,
      durationMs: runDurationMs,
      cost: testRunResults.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      tokens: testRunResults.reduce((sum, r) => sum + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0),
      tests: testResults,
      reportPath: reportResult.reportPath,
    };

    recordRun(runResult, STATS_BASE_DIR);
    log.info('Stats recorded');

    // -- Phase 5: Print summary -------------------------------------------------

    if (reportResult.terminalSummary) {
      process.stdout.write(reportResult.terminalSummary + '\n');
    }

    const summaryLine = generateSummary(runResult);
    process.stdout.write(summaryLine + '\n');

    // -- Exit code --------------------------------------------------------------

    if (totalFailed > 0) {
      process.exit(1);
    }
  },
});
