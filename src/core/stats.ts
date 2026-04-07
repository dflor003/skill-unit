import fs from 'node:fs';
import path from 'node:path';
import type { RunResult, StatsIndex } from '../types/run.js';

export function createEmptyIndex(): StatsIndex {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    aggregate: {
      totalRuns: 0,
      totalTests: 0,
      passRate: 0,
      totalCost: 0,
      totalTokens: 0,
    },
    tests: {},
    runs: [],
  };
}

export function loadIndex(baseDir: string): StatsIndex {
  const indexPath = path.join(baseDir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return createEmptyIndex();
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as StatsIndex;
}

function saveIndex(baseDir: string, index: StatsIndex): void {
  index.lastUpdated = new Date().toISOString();
  const indexPath = path.join(baseDir, 'index.json');
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
}

export function recordRun(result: RunResult, baseDir: string): void {
  // Save run artifact
  const runDir = path.join(baseDir, 'runs', result.id);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(result, null, 2));

  // Update index
  const index = loadIndex(baseDir);

  index.runs.push({
    id: result.id,
    timestamp: result.timestamp,
    testCount: result.testCount,
    passed: result.passed,
    failed: result.failed,
    duration: result.durationMs,
    cost: result.cost,
    tokens: result.tokens,
  });

  // Update per-test stats
  for (const test of result.tests) {
    const key = `${test.specName}/${test.id}`;
    const existing = index.tests[key];

    if (existing) {
      existing.runCount += 1;
      existing.passCount += test.passed ? 1 : 0;
      existing.avgDuration = ((existing.avgDuration * (existing.runCount - 1)) + test.durationMs) / existing.runCount;
      existing.lastRun = result.timestamp;
      existing.lastResult = test.passed ? 'pass' : 'fail';
    } else {
      index.tests[key] = {
        name: test.name,
        runCount: 1,
        passCount: test.passed ? 1 : 0,
        avgDuration: test.durationMs,
        avgCost: 0,
        avgTokens: 0,
        lastRun: result.timestamp,
        lastResult: test.passed ? 'pass' : 'fail',
      };
    }
  }

  // Update aggregate
  const agg = index.aggregate;
  agg.totalRuns = index.runs.length;
  agg.totalTests += result.testCount;
  agg.totalCost += result.cost;
  agg.totalTokens += result.tokens;

  const totalPassed = Object.values(index.tests).reduce((sum, t) => sum + t.passCount, 0);
  const totalTestRuns = Object.values(index.tests).reduce((sum, t) => sum + t.runCount, 0);
  agg.passRate = totalTestRuns > 0 ? totalPassed / totalTestRuns : 0;

  saveIndex(baseDir, index);
}

export function cleanupRuns(baseDir: string, keepCount: number): void {
  const index = loadIndex(baseDir);
  const runsDir = path.join(baseDir, 'runs');

  if (index.runs.length <= keepCount) return;

  const toRemove = index.runs.slice(0, index.runs.length - keepCount);
  index.runs = index.runs.slice(index.runs.length - keepCount);

  for (const run of toRemove) {
    const runDir = path.join(runsDir, run.id);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }

  // Rebuild test stats from remaining runs
  index.tests = {};
  for (const runEntry of index.runs) {
    const runDir = path.join(runsDir, runEntry.id);
    const runDataPath = path.join(runDir, 'run.json');
    if (!fs.existsSync(runDataPath)) continue;

    const runData: RunResult = JSON.parse(fs.readFileSync(runDataPath, 'utf-8')) as RunResult;
    for (const test of runData.tests) {
      const key = `${test.specName}/${test.id}`;
      const existing = index.tests[key];
      if (existing) {
        existing.runCount += 1;
        existing.passCount += test.passed ? 1 : 0;
        existing.avgDuration = ((existing.avgDuration * (existing.runCount - 1)) + test.durationMs) / existing.runCount;
        existing.lastRun = runData.timestamp;
        existing.lastResult = test.passed ? 'pass' : 'fail';
      } else {
        index.tests[key] = {
          name: test.name,
          runCount: 1,
          passCount: test.passed ? 1 : 0,
          avgDuration: test.durationMs,
          avgCost: 0,
          avgTokens: 0,
          lastRun: runData.timestamp,
          lastResult: test.passed ? 'pass' : 'fail',
        };
      }
    }
  }

  // Recalculate aggregate
  const agg = index.aggregate;
  agg.totalRuns = index.runs.length;
  agg.totalTests = index.runs.reduce((sum, r) => sum + r.testCount, 0);
  agg.totalCost = index.runs.reduce((sum, r) => sum + r.cost, 0);
  agg.totalTokens = index.runs.reduce((sum, r) => sum + r.tokens, 0);
  const totalPassed = Object.values(index.tests).reduce((sum, t) => sum + t.passCount, 0);
  const totalTestRuns = Object.values(index.tests).reduce((sum, t) => sum + t.runCount, 0);
  agg.passRate = totalTestRuns > 0 ? totalPassed / totalTestRuns : 0;

  saveIndex(baseDir, index);
}

export function rebuildIndex(baseDir: string): void {
  const runsDir = path.join(baseDir, 'runs');
  if (!fs.existsSync(runsDir)) {
    saveIndex(baseDir, createEmptyIndex());
    return;
  }

  const index = createEmptyIndex();
  const runDirs = fs.readdirSync(runsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of runDirs) {
    const runDataPath = path.join(runsDir, dir.name, 'run.json');
    if (!fs.existsSync(runDataPath)) continue;

    const runData: RunResult = JSON.parse(fs.readFileSync(runDataPath, 'utf-8')) as RunResult;

    index.runs.push({
      id: runData.id,
      timestamp: runData.timestamp,
      testCount: runData.testCount,
      passed: runData.passed,
      failed: runData.failed,
      duration: runData.durationMs,
      cost: runData.cost,
      tokens: runData.tokens,
    });

    for (const test of runData.tests) {
      const key = `${test.specName}/${test.id}`;
      const existing = index.tests[key];
      if (existing) {
        existing.runCount += 1;
        existing.passCount += test.passed ? 1 : 0;
        existing.avgDuration = ((existing.avgDuration * (existing.runCount - 1)) + test.durationMs) / existing.runCount;
        existing.lastRun = runData.timestamp;
        existing.lastResult = test.passed ? 'pass' : 'fail';
      } else {
        index.tests[key] = {
          name: test.name,
          runCount: 1,
          passCount: test.passed ? 1 : 0,
          avgDuration: test.durationMs,
          avgCost: 0,
          avgTokens: 0,
          lastRun: runData.timestamp,
          lastResult: test.passed ? 'pass' : 'fail',
        };
      }
    }
  }

  // Calculate aggregate
  const agg = index.aggregate;
  agg.totalRuns = index.runs.length;
  agg.totalTests = index.runs.reduce((sum, r) => sum + r.testCount, 0);
  agg.totalCost = index.runs.reduce((sum, r) => sum + r.cost, 0);
  agg.totalTokens = index.runs.reduce((sum, r) => sum + r.tokens, 0);
  const totalPassed = Object.values(index.tests).reduce((sum, t) => sum + t.passCount, 0);
  const totalTestRuns = Object.values(index.tests).reduce((sum, t) => sum + t.runCount, 0);
  agg.passRate = totalTestRuns > 0 ? totalPassed / totalTestRuns : 0;

  saveIndex(baseDir, index);
}
