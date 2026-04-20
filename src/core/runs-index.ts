import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_RUNS_ROOT = path.join('.workspace', 'runs');

export class UnknownRunError extends Error {
  constructor(runId: string, available: string[]) {
    const list =
      available.length === 0 ? '(no runs yet)' : available.join(', ');
    super(`Unknown run "${runId}". Available runs: ${list}`);
    this.name = 'UnknownRunError';
  }
}

export class UnknownTestError extends Error {
  constructor(testId: string, runId: string, available: string[]) {
    const list =
      available.length === 0 ? '(no tests in this run)' : available.join(', ');
    super(
      `Unknown test "${testId}" in run ${runId}. Available test ids: ${list}`
    );
    this.name = 'UnknownTestError';
  }
}

export interface RunSummary {
  id: string;
  passed: number;
  failed: number;
  total: number;
  reportPath: string | null;
}

export interface RunTestEntry {
  testId: string;
  testName: string;
  specName: string;
  passed: boolean;
  failureReason: string | null;
  resultsJsonPath: string;
  resultsMdPath: string | null;
  transcriptPath: string;
  graderTranscriptPath: string | null;
}

export interface RunIndex extends RunSummary {
  runId: string;
  runDir: string;
  tests: RunTestEntry[];
}

interface GraderCheck {
  text: string;
  met: boolean;
  evidence?: string;
}

interface GraderJson {
  testId: string;
  testName: string;
  passed: boolean;
  expectations: GraderCheck[];
  negativeExpectations: GraderCheck[];
}

function runsRootPath(runsRoot?: string): string {
  return runsRoot ?? DEFAULT_RUNS_ROOT;
}

export function listRuns(runsRoot?: string): RunSummary[] {
  const root = runsRootPath(runsRoot);
  if (!fs.existsSync(root)) return [];
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .reverse();
  return entries.map((id) => summarizeRun(id, root));
}

function summarizeRun(runId: string, runsRoot: string): RunSummary {
  const runDir = path.join(runsRoot, runId);
  const resultsDir = path.join(runDir, 'results');
  const reportPath = path.join(resultsDir, 'report.md');
  let passed = 0;
  let failed = 0;
  let total = 0;
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir)) {
      if (!file.endsWith('.results.json')) continue;
      total += 1;
      const raw = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as GraderJson;
      if (parsed.passed) passed += 1;
      else failed += 1;
    }
  }
  return {
    id: runId,
    passed,
    failed,
    total,
    reportPath: fs.existsSync(reportPath) ? reportPath : null,
  };
}

export function resolveRunId(input: string, runsRoot?: string): string {
  const root = runsRootPath(runsRoot);
  const ids = listRuns(root).map((r) => r.id);
  if (input === 'latest') {
    if (ids.length === 0) throw new UnknownRunError('latest', ids);
    return ids[0]!;
  }
  if (!ids.includes(input)) throw new UnknownRunError(input, ids);
  return input;
}

export function loadRunIndex(runId: string, runsRoot?: string): RunIndex {
  const root = runsRootPath(runsRoot);
  const runDir = path.join(root, runId);
  const resultsDir = path.join(runDir, 'results');
  const summary = summarizeRun(runId, root);
  const tests: RunTestEntry[] = [];
  if (fs.existsSync(resultsDir)) {
    for (const file of fs.readdirSync(resultsDir).sort()) {
      if (!file.endsWith('.results.json')) continue;
      const stem = file.slice(0, -'.results.json'.length);
      const dot = stem.lastIndexOf('.');
      const specName = dot >= 0 ? stem.slice(0, dot) : stem;
      const raw = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
      const parsed = JSON.parse(raw) as GraderJson;
      tests.push({
        testId: parsed.testId,
        testName: parsed.testName,
        specName,
        passed: parsed.passed,
        failureReason: firstUnmetReason(parsed),
        resultsJsonPath: path.join(resultsDir, file),
        resultsMdPath: existsOrNull(
          path.join(resultsDir, `${stem}.results.md`)
        ),
        transcriptPath: path.join(resultsDir, `${stem}.transcript.md`),
        graderTranscriptPath: existsOrNull(
          path.join(resultsDir, `${stem}.grader-transcript.md`)
        ),
      });
    }
  }
  return { ...summary, runId, runDir, tests };
}

export function loadTest(
  runId: string,
  testId: string,
  runsRoot?: string
): RunTestEntry {
  const index = loadRunIndex(runId, runsRoot);
  const hit = index.tests.find((t) => t.testId === testId);
  if (!hit) {
    throw new UnknownTestError(
      testId,
      runId,
      index.tests.map((t) => t.testId)
    );
  }
  return hit;
}

function firstUnmetReason(parsed: GraderJson): string | null {
  const unmet =
    parsed.expectations.find((c) => !c.met) ??
    parsed.negativeExpectations.find((c) => !c.met);
  if (!unmet) return null;
  return unmet.evidence ? `${unmet.text} — ${unmet.evidence}` : unmet.text;
}

function existsOrNull(p: string): string | null {
  return fs.existsSync(p) ? p : null;
}
