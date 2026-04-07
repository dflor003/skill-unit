import fs from 'node:fs';
import path from 'node:path';
import type { TestStatus, StatsIndex } from '../../types/run.js';
import type { TestRunEntry, TestRunState } from './use-test-run.js';

type RunEntry = StatsIndex['runs'][number];

export function loadHistoricalRun(runDir: string, runEntry: RunEntry): TestRunState {
  const resultsDir = path.join(runDir, 'results');
  const tests: TestRunEntry[] = [];

  if (!fs.existsSync(resultsDir)) {
    return { tests: [], activeTestId: null, elapsed: runEntry.duration, status: 'complete' };
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.transcript.md'));

  for (const transcriptFile of files) {
    const withoutExt = transcriptFile.replace(/\.transcript\.md$/, '');
    const lastDot = withoutExt.lastIndexOf('.');
    if (lastDot <= 0) continue;

    const specName = withoutExt.substring(0, lastDot);
    const testId = withoutExt.substring(lastDot + 1);

    const transcriptPath = path.join(resultsDir, transcriptFile);
    const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

    const resultsFile = `${specName}.${testId}.results.md`;
    const resultsPath = path.join(resultsDir, resultsFile);
    let gradeContent = '';
    let passed = false;
    if (fs.existsSync(resultsPath)) {
      gradeContent = fs.readFileSync(resultsPath, 'utf-8');
      passed = /\*\*Verdict:\*\*\s*PASS/i.test(gradeContent);
    }

    const headingMatch = gradeContent.match(/^# Results:\s*(.+?):\s*(.+)$/m);
    const testName = headingMatch ? headingMatch[2].trim() : testId;

    const status: TestStatus = passed ? 'passed' : 'failed';

    tests.push({
      id: testId,
      name: testName,
      specName,
      status,
      durationMs: 0,
      transcript: [transcriptContent],
      gradeTranscript: gradeContent ? [gradeContent] : [],
      activity: '',
    });
  }

  return {
    tests,
    activeTestId: tests[0]?.id ?? null,
    elapsed: runEntry.duration,
    status: 'complete',
  };
}
