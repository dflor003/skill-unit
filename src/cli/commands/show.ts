import fs from 'node:fs';
import { defineCommand } from 'citty';
import {
  loadRunIndex,
  resolveRunId,
  UnknownRunError,
} from '../../core/runs-index.js';

export const showCommand = defineCommand({
  meta: {
    name: 'show',
    description: 'Summarize a single test run',
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
    'failed-only': {
      type: 'boolean',
      description: 'Only list tests that failed',
      default: false,
    },
    full: {
      type: 'boolean',
      description: 'Dump the full report.md instead of the summary table',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const failedOnly = Boolean(args['failed-only']);
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
    const index = loadRunIndex(runId, runsRoot);
    if (full) {
      if (index.reportPath) {
        process.stdout.write(fs.readFileSync(index.reportPath, 'utf-8'));
      } else {
        process.stdout.write(
          `No report.md found for run ${runId}. Use \`skill-unit report --run-dir ${index.runDir}\` to regenerate.\n`
        );
      }
      return;
    }
    process.stdout.write(
      `Run: ${index.runId} — ${index.passed} passed | ${index.failed} failed | ${index.total} total\n`
    );
    const tests = failedOnly
      ? index.tests.filter((t) => !t.passed)
      : index.tests;
    if (tests.length === 0) {
      process.stdout.write(
        failedOnly
          ? 'No failing tests in this run.\n'
          : 'No tests in this run.\n'
      );
      return;
    }
    process.stdout.write('test-id  verdict  spec                  reason\n');
    for (const t of tests) {
      const verdict = t.passed ? 'pass' : 'fail';
      const reason = t.failureReason ?? '';
      process.stdout.write(
        `${t.testId}  ${verdict}  ${t.specName}  ${truncate(reason, 60)}\n`
      );
    }
  },
});

function truncate(s: string, max: number): string {
  if (s.length <= max) return s.padEnd(max);
  return `${s.slice(0, max - 1)}…`;
}
