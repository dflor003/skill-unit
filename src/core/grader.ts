// ---------------------------------------------------------------------------
// grader.ts -- dispatches the grader agent to evaluate test transcripts
//
// Ports grader.js to TypeScript with an event-emitter interface so the TUI
// can subscribe to live grading progress.
//
// After the runner produces transcripts, the grader spawns one CLI process
// per test case, passing expectations and the transcript path. Each grader
// reads the transcript, evaluates against expectations, and writes a results
// file.
//
// Concurrency is controlled by config.execution["grader-concurrency"].
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { createLogger } from './logger.js';
import type { Spec } from '../types/spec.js';
import type { SkillUnitConfig } from '../types/config.js';

const log = createLogger('grader');

// -- Types ------------------------------------------------------------------

export interface GradeResult {
  testId: string;
  specName: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GradeHandle extends EventEmitter {
  on(event: 'output', listener: (chunk: string) => void): this;
  on(event: 'complete', listener: (result: GradeResult) => void): this;
}

// -- Grader prompt construction -----------------------------------------------

export function buildGraderPrompt(
  tc: {
    id: string;
    name: string;
    prompt: string;
    expectations: string[];
    'negative-expectations': string[];
  },
  specName: string,
  timestamp: string,
): string {
  const resultsDir = path.join('.workspace', 'runs', timestamp, 'results');
  const transcriptPath = path.join(resultsDir, `${specName}.${tc.id}.transcript.md`);
  const outputPath = path.join(resultsDir, `${specName}.${tc.id}.results.md`);

  const expectations = (tc.expectations || []).map((e) => `- ${e}`).join('\n');
  const negExpectations = (tc['negative-expectations'] || []).length
    ? tc['negative-expectations'].map((e) => `- ${e}`).join('\n')
    : 'None';

  return `Grade this test case.

**Test ID:** ${tc.id}
**Test Name:** ${tc.name}

**Prompt:**
> ${tc.prompt}

**Expectations:**
${expectations}

**Negative Expectations:**
${negExpectations}

**Transcript path:** ${transcriptPath}
**Output path:** ${outputPath}`;
}

// -- Agent path resolution ----------------------------------------------------

export function resolveAgentPath(): string | null {
  const candidate = path.join(process.cwd(), 'agents', 'grader.md');
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

// -- CLI tool profiles for grader invocation ----------------------------------

export const GRADER_PROFILES: Record<string, (agentPath: string) => string[]> = {
  claude: (agentPath) => [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--max-turns', '5',
    '--permission-mode', 'dontAsk',
    '--no-chrome',
    '--no-session-persistence',
    '--agent', agentPath,
  ],
};

// -- Spawn a single grader process --------------------------------------------

function spawnGrader(tool: string, cliArgs: string[], prompt: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(tool, cliArgs, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on('close', (code: number | null) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });

    proc.on('error', (err: Error) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// -- Grade a single test case -------------------------------------------------

export function gradeTest(
  testCase: { id: string; name: string; prompt: string; expectations: string[]; 'negative-expectations': string[] },
  transcriptPath: string,
  config: SkillUnitConfig,
  specName: string,
  timestamp: string,
): GradeHandle {
  const handle = new EventEmitter() as GradeHandle;

  setImmediate(async () => {
    const tool = config.runner.tool || 'claude';
    const buildArgs = GRADER_PROFILES[tool];

    if (!buildArgs) {
      const err = new Error(`Unsupported tool for grading: "${tool}". Supported: ${Object.keys(GRADER_PROFILES).join(', ')}`);
      log.error(err.message);
      handle.emit('complete', {
        testId: testCase.id,
        specName,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
      } satisfies GradeResult);
      return;
    }

    const agentPath = resolveAgentPath();
    if (!agentPath) {
      const msg = 'Could not find agents/grader.md in the repository root.';
      log.error(msg);
      handle.emit('complete', {
        testId: testCase.id,
        specName,
        exitCode: 1,
        stdout: '',
        stderr: msg,
      } satisfies GradeResult);
      return;
    }

    void transcriptPath; // used in the prompt, passed via buildGraderPrompt

    const cliArgs = buildArgs(agentPath);
    const prompt = buildGraderPrompt(testCase, specName, timestamp);

    const { exitCode, stdout, stderr } = await spawnGrader(tool, cliArgs, prompt);

    if (stdout) {
      handle.emit('output', stdout);
    }

    handle.emit('complete', {
      testId: testCase.id,
      specName,
      exitCode,
      stdout,
      stderr,
    } satisfies GradeResult);
  });

  return handle;
}

// -- Batch execution with concurrency -----------------------------------------

async function runBatch<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

// -- Main grading function ----------------------------------------------------

export interface GradeSpecsOptions {
  /** When true, suppresses all logger output (TUI mode). */
  silent?: boolean;
}

export async function gradeSpecs(
  specs: Spec[],
  config: SkillUnitConfig,
  timestamp: string,
  options?: GradeSpecsOptions,
): Promise<void> {
  const silent = options?.silent ?? false;
  const gradeLog = silent
    ? { debug: () => {}, verbose: () => {}, info: () => {}, success: () => {}, warn: () => {}, error: () => {} }
    : log;

  const tool = config.runner.tool || 'claude';
  const concurrency = (config.execution && config.execution['grader-concurrency']) || 5;

  const buildArgs = GRADER_PROFILES[tool];
  if (!buildArgs) {
    gradeLog.error(`Unsupported tool for grading: "${tool}". Supported: ${Object.keys(GRADER_PROFILES).join(', ')}`);
    return;
  }

  const agentPath = resolveAgentPath();
  if (!agentPath) {
    gradeLog.error('Could not find agents/grader.md in the repository root.');
    return;
  }

  const cliArgs = buildArgs(agentPath);

  // Build all grading tasks across all specs
  interface GradeTask {
    specName: string;
    testId: string;
    run: () => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  }

  const tasks: GradeTask[] = [];

  for (const spec of specs) {
    const specName = spec.frontmatter.name || path.basename(spec.path, '.spec.md');

    for (const tc of spec.testCases) {
      const transcriptPath = path.join(
        '.workspace', 'runs', timestamp, 'results',
        `${specName}.${tc.id}.transcript.md`,
      );

      // Skip if no transcript (test may have been filtered or failed to run)
      if (!fs.existsSync(transcriptPath)) {
        gradeLog.warn(`Skipping ${tc.id}: no transcript at ${transcriptPath}`);
        continue;
      }

      const prompt = buildGraderPrompt(tc, specName, timestamp);

      tasks.push({
        specName,
        testId: tc.id,
        run: () => spawnGrader(tool, cliArgs, prompt),
      });
    }
  }

  if (tasks.length === 0) {
    gradeLog.info('No test cases to grade.');
    return;
  }

  gradeLog.info(`Grading ${tasks.length} test case(s) with concurrency ${concurrency}`);

  // Execute in batches
  const totalBatches = Math.ceil(tasks.length / concurrency);

  await runBatch(
    tasks.map((task, globalIdx) => async () => {
      const batchNum = Math.floor(globalIdx / concurrency) + 1;
      const batchStart = Math.floor(globalIdx / concurrency) * concurrency;
      // Only log batch header for the first task in each batch
      if (globalIdx % concurrency === 0) {
        const batchEnd = Math.min(batchStart + concurrency, tasks.length);
        const batchIds = tasks.slice(batchStart, batchEnd).map((t) => t.testId).join(', ');
        gradeLog.info(`Batch ${batchNum}/${totalBatches}: ${batchIds}`);
      }

      const result = await task.run();

      if (result.exitCode === 0) {
        gradeLog.success(`  ${task.testId}: OK`);
      } else {
        gradeLog.error(`  ${task.testId}: FAIL(${result.exitCode})`);
        if (result.stderr) {
          const preview = result.stderr.substring(0, 500);
          gradeLog.debug(`  ${task.testId} stderr: ${preview}${result.stderr.length > 500 ? '...' : ''}`);
        }
      }

      return result;
    }),
    concurrency,
  );

  gradeLog.info(`Graded ${tasks.length}/${tasks.length} test cases`);

  // Verify results files exist
  const resultsDir = path.join('.workspace', 'runs', timestamp, 'results');
  let missing = 0;
  for (const task of tasks) {
    const resultsPath = path.join(resultsDir, `${task.specName}.${task.testId}.results.md`);
    if (!fs.existsSync(resultsPath)) {
      gradeLog.warn(`Missing results file for ${task.testId}: ${resultsPath}`);
      missing++;
    }
  }

  if (missing > 0) {
    gradeLog.warn(`${missing} result file(s) missing`);
  } else {
    gradeLog.success('All result files written');
  }
}
