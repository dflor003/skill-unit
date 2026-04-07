import { defineCommand } from 'citty';
import { generateReport } from '../../core/reporter.js';
import { createLogger } from '../../core/logger.js';

export const reportCommand = defineCommand({
  meta: {
    name: 'report',
    description: 'Generate a report from an existing test run directory',
  },
  args: {
    'run-dir': {
      type: 'string',
      description: 'Path to the run directory containing results/',
      required: true,
    },
  },
  run({ args }) {
    const log = createLogger('report');
    const runDir = args['run-dir'];

    if (!runDir) {
      log.error('--run-dir is required');
      process.exit(1);
    }

    log.info(`Generating report from: ${runDir}`);
    const result = generateReport(runDir);

    if (result.error) {
      log.error(result.error);
      process.exit(1);
    }

    console.log(result.terminalSummary);

    if (result.reportPath) {
      log.success(`Report written to: ${result.reportPath}`);
    }
  },
});
