import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadTest,
  resolveRunId,
  UnknownRunError,
  UnknownTestError,
} from '../../core/runs-index.js';
import type { RunTestEntry } from '../../core/runs-index.js';

export const gradingCommand = defineCommand({
  meta: {
    name: 'grading',
    description:
      'Show the grader verdict and optional grader transcript for a test',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    'run-id': {
      type: 'positional',
      description: 'Run id or "latest"',
      required: true,
    },
    'test-id': {
      type: 'positional',
      description: 'Test case id (e.g. SU-1)',
      required: true,
    },
    full: {
      type: 'boolean',
      description: 'Append the full grader transcript',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const full = Boolean(args.full);
    let runId: string;
    try {
      runId = resolveRunId(args['run-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownRunError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    let entry: RunTestEntry;
    try {
      entry = loadTest(runId, args['test-id'] as string, runsRoot);
    } catch (err) {
      if (err instanceof UnknownTestError) {
        process.stderr.write(`${err.message}\n`);
        process.exit(1);
      }
      throw err;
    }
    const verdict = entry.passed ? 'pass' : 'fail';
    process.stdout.write(
      `Test: ${entry.testId} (${entry.specName}) — ${verdict}\n`
    );
    if (entry.failureReason) {
      process.stdout.write(`Reason: ${entry.failureReason}\n`);
    }
    if (entry.resultsMdPath && fs.existsSync(entry.resultsMdPath)) {
      process.stdout.write('\n');
      process.stdout.write(fs.readFileSync(entry.resultsMdPath, 'utf-8'));
    }
    if (full) {
      process.stdout.write('\n---\n\n');
      if (
        entry.graderTranscriptPath &&
        fs.existsSync(entry.graderTranscriptPath)
      ) {
        process.stdout.write(
          fs.readFileSync(entry.graderTranscriptPath, 'utf-8')
        );
      } else {
        process.stdout.write(`(no grader transcript for ${entry.testId})\n`);
      }
    }
  },
});
