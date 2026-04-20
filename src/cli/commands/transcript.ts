import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadTest,
  resolveRunId,
  UnknownRunError,
  UnknownTestError,
} from '../../core/runs-index.js';
import type { RunTestEntry } from '../../core/runs-index.js';

export const transcriptCommand = defineCommand({
  meta: {
    name: 'transcript',
    description: 'Show the agent transcript for a single test in a run',
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
      description: 'Append the full transcript content to the summary',
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
    const reason = entry.failureReason ?? '';
    process.stdout.write(
      `Test: ${entry.testId} (${entry.specName}) — ${verdict}\n`
    );
    if (reason) process.stdout.write(`Reason: ${reason}\n`);
    if (full) {
      process.stdout.write('\n---\n\n');
      if (fs.existsSync(entry.transcriptPath)) {
        process.stdout.write(fs.readFileSync(entry.transcriptPath, 'utf-8'));
      } else {
        process.stdout.write('(transcript file is missing)\n');
      }
    }
  },
});
