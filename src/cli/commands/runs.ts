import { defineCommand } from 'citty';
import { listRuns } from '../../core/runs-index.js';

export const runsCommand = defineCommand({
  meta: {
    name: 'runs',
    description: 'List recent test runs with pass/fail counts',
  },
  args: {
    'runs-root': {
      type: 'string',
      description: 'Path to the runs directory',
      default: '.workspace/runs',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of runs to show (default: 10)',
      default: '10',
    },
    'failed-only': {
      type: 'boolean',
      description: 'Only show runs that had at least one failure',
      default: false,
    },
  },
  run({ args }) {
    const runsRoot = args['runs-root'];
    const limit = Number(args.limit);
    const failedOnly = Boolean(args['failed-only']);
    const all = listRuns(runsRoot);
    if (all.length === 0) {
      process.stdout.write(
        'No runs yet. Run tests with `skill-unit test --all`.\n'
      );
      return;
    }
    const filtered = failedOnly ? all.filter((r) => r.failed > 0) : all;
    const shown = filtered.slice(0, Number.isFinite(limit) ? limit : 10);
    process.stdout.write(
      'run-id               passed  failed  total  status\n'
    );
    for (const r of shown) {
      const status = r.failed === 0 ? 'pass' : 'fail';
      process.stdout.write(
        `${r.id}  ${String(r.passed).padStart(6)}  ${String(r.failed).padStart(6)}  ${String(r.total).padStart(5)}  ${status}\n`
      );
    }
  },
});
