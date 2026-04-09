import fs from 'node:fs';
import path from 'node:path';
import type { TestStatus, StatsIndex } from '../../types/run.js';
import type { TestRunEntry, TestRunState } from './use-test-run.js';

type RunEntry = StatsIndex['runs'][number];

export function loadHistoricalRun(
  runDir: string,
  runEntry: RunEntry
): TestRunState {
  const resultsDir = path.join(runDir, 'results');
  const tests: TestRunEntry[] = [];

  if (!fs.existsSync(resultsDir)) {
    return {
      tests: [],
      activeTestId: null,
      elapsed: runEntry.duration,
      status: 'complete',
    };
  }

  // Only match execution transcripts (exclude grader-transcript.md)
  const files = fs
    .readdirSync(resultsDir)
    .filter(
      (f) =>
        f.endsWith('.transcript.md') && !f.endsWith('.grader-transcript.md')
    );

  for (const transcriptFile of files) {
    const withoutExt = transcriptFile.replace(/\.transcript\.md$/, '');
    const lastDot = withoutExt.lastIndexOf('.');
    if (lastDot <= 0) continue;

    const specName = withoutExt.substring(0, lastDot);
    const testId = withoutExt.substring(lastDot + 1);

    const transcriptPath = path.join(resultsDir, transcriptFile);
    const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

    // Load grading verdict to determine pass/fail and test name
    const resultsFile = `${specName}.${testId}.results.md`;
    const resultsPath = path.join(resultsDir, resultsFile);
    let resultsContent = '';
    let passed = false;
    if (fs.existsSync(resultsPath)) {
      resultsContent = fs.readFileSync(resultsPath, 'utf-8');
      passed = /(?:^#+\s*|^\*\*)(?:Verdict|Result)[:\s]*\**\s*PASS\b/im.test(
        resultsContent
      );
    }

    // Load grader conversation transcript (separate from verdict)
    const graderFile = `${specName}.${testId}.grader-transcript.md`;
    const graderPath = path.join(resultsDir, graderFile);
    let graderContent = '';
    if (fs.existsSync(graderPath)) {
      graderContent = fs.readFileSync(graderPath, 'utf-8');
    }

    const headingMatch = resultsContent.match(
      /^#\s+(?:Results|Test Result):\s*(\S+?)(?:\s*:\s*|\s+—\s*|\s+--\s+)(.+)$/m
    );
    const testName = headingMatch ? headingMatch[2].trim() : testId;

    const status: TestStatus = passed ? 'passed' : 'failed';

    tests.push({
      id: testId,
      name: testName,
      specName,
      status,
      durationMs: 0,
      transcript: [transcriptContent],
      gradeTranscript: graderContent ? [graderContent] : [],
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
