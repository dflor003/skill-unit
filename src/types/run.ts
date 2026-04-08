export type TestStatus =
  | 'pending'
  | 'running'
  | 'grading'
  | 'passed'
  | 'failed'
  | 'timedout'
  | 'error'
  | 'cancelled';

export interface TestResult {
  id: string;
  name: string;
  specName: string;
  status: TestStatus;
  durationMs: number;
  passed: boolean;
  passedChecks: number;
  failedChecks: number;
  totalChecks: number;
  expectationLines: string[];
  negativeExpectationLines: string[];
  transcriptPath?: string;
  resultPath?: string;
}

export interface RunResult {
  id: string;
  timestamp: string;
  testCount: number;
  passed: number;
  failed: number;
  durationMs: number;
  cost: number;
  tokens: number;
  tests: TestResult[];
  reportPath?: string;
}

export interface RunProgress {
  status: 'running' | 'grading' | 'complete';
  specName: string;
  total: number;
  completed: number;
  current: string | null;
  results: Array<{ id: string; status: TestStatus; durationMs: number }>;
}

export interface TestStats {
  name: string;
  runCount: number;
  passCount: number;
  avgDuration: number;
  avgCost: number;
  avgTokens: number;
  lastRun: string;
  lastResult: 'pass' | 'fail';
}

export interface AggregateStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  totalCost: number;
  totalTokens: number;
}

export interface StatsIndex {
  version: number;
  lastUpdated: string;
  aggregate: AggregateStats;
  tests: Record<string, TestStats>;
  runs: Array<{
    id: string;
    timestamp: string;
    testCount: number;
    passed: number;
    failed: number;
    duration: number;
    cost: number;
    tokens: number;
  }>;
}
