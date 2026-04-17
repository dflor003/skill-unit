import { describe, it, expect } from 'vitest';
import { formatCiReport } from '../../src/core/ci-reporter.js';
import type { RunResult, TestResult } from '../../src/types/run.js';

function passedTest(overrides: Partial<TestResult> = {}): TestResult {
  return {
    id: 'T-1',
    name: 't1',
    specName: 'spec-a',
    status: 'passed',
    durationMs: 2000,
    passed: true,
    passedChecks: 2,
    failedChecks: 0,
    totalChecks: 2,
    expectationLines: [],
    negativeExpectationLines: [],
    ...overrides,
  };
}

function failedTest(overrides: Partial<TestResult> = {}): TestResult {
  return passedTest({
    status: 'failed',
    passed: false,
    passedChecks: 0,
    failedChecks: 2,
    ...overrides,
  });
}

function baseRun(tests: TestResult[]): RunResult {
  return {
    id: 'run-1',
    timestamp: 'run-1',
    testCount: tests.length,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    durationMs: tests.reduce((sum, t) => sum + t.durationMs, 0),
    cost: 0.01,
    tokens: 1500,
    tests,
  };
}

describe('formatCiReport', () => {
  it('groups tests by spec with PASS / FAIL suite header', () => {
    // Arrange
    const run = baseRun([
      passedTest({ id: 'A-1', name: 'a1', specName: 'spec-a' }),
      failedTest({ id: 'B-1', name: 'b1', specName: 'spec-b' }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toMatch(/PASS\s+spec-a/);
    expect(out).toMatch(/FAIL\s+spec-b/);
  });

  it('includes passed tests in the output, not just failed', () => {
    // Arrange
    const run = baseRun([
      passedTest({ id: 'A-1', name: 'a1' }),
      passedTest({ id: 'A-2', name: 'a2' }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('a1');
    expect(out).toContain('a2');
    expect(out).toContain('\u2705'); // green check emoji
  });

  it('shows check score and duration per test', () => {
    // Arrange
    const run = baseRun([
      passedTest({
        name: 'basic',
        durationMs: 4230,
        passedChecks: 2,
        totalChecks: 2,
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('basic');
    expect(out).toContain('(2/2)');
    expect(out).toContain('4.2s');
  });

  it('renders a multi-line summary with totals, duration, cost, and tokens', () => {
    // Arrange
    const run = baseRun([passedTest({ id: 'A-1' }), failedTest({ id: 'A-2' })]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('Tests:');
    expect(out).toContain('1 passed');
    expect(out).toContain('1 failed');
    expect(out).toContain('2 total');
    expect(out).toContain('Duration:');
    expect(out).toContain('Cost:');
    expect(out).toContain('$');
    expect(out).toContain('Tokens:');
  });

  it('includes timed-out count in the summary only when > 0', () => {
    // Arrange
    const withTimeout = baseRun([
      passedTest({ id: 'A-1' }),
      failedTest({ id: 'A-2', status: 'timedout' }),
    ]);
    const withoutTimeout = baseRun([
      passedTest({ id: 'A-1' }),
      failedTest({ id: 'A-2' }),
    ]);

    // Act
    const outWith = formatCiReport(withTimeout, { color: false });
    const outWithout = formatCiReport(withoutTimeout, { color: false });

    // Assert
    expect(outWith).toContain('timed out');
    expect(outWithout).not.toContain('timed out');
  });

  it('lists failed expectation reasons beneath failed tests', () => {
    // Arrange
    const run = baseRun([
      failedTest({
        id: 'A-1',
        name: 'error-case',
        expectationLines: [
          '- \u2713 invoked correct command',
          '- \u2717 did not explain the skill purpose',
          '- \u2717 missing error handling discussion',
        ],
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('did not explain the skill purpose');
    expect(out).toContain('missing error handling discussion');
    expect(out).not.toContain('invoked correct command');
  });

  it('does not dump expectation lines for passing tests', () => {
    // Arrange
    const run = baseRun([
      passedTest({
        id: 'A-1',
        name: 'ok',
        expectationLines: ['- \u2713 did thing', '- \u2713 did another thing'],
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).not.toContain('did thing');
    expect(out).not.toContain('did another thing');
  });

  it('includes failed lines from negative expectations as well', () => {
    // Arrange
    const run = baseRun([
      failedTest({
        id: 'A-1',
        name: 'neg',
        expectationLines: [],
        negativeExpectationLines: ['- \u2717 leaked sensitive token'],
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('leaked sensitive token');
  });

  it('uses a breadcrumb spec header derived from specPath when testDir is provided', () => {
    // Arrange
    const run = baseRun([
      passedTest({
        id: 'A-1',
        name: 'a1',
        specName: 'empty-project',
        specPath: 'skill-tests/skill-unit/empty-project.spec.md',
      }),
    ]);

    // Act
    const out = formatCiReport(run, {
      testDir: 'skill-tests',
      color: false,
    });

    // Assert
    expect(out).toContain('skill-unit > empty-project');
  });

  it('falls back to specName when specPath is missing', () => {
    // Arrange
    const run = baseRun([
      passedTest({
        id: 'A-1',
        name: 'a1',
        specName: 'legacy-spec',
        specPath: undefined,
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toContain('legacy-spec');
  });

  it('renders the test id in bold before the test name', () => {
    // Arrange
    const run = baseRun([passedTest({ id: 'SU-1', name: 'my-test' })]);

    // Act
    const out = formatCiReport(run, { color: true });

    // Assert
    expect(out).toContain('\x1b[1mSU-1\x1b[0m my-test');
  });

  it('does not bold the test name', () => {
    // Arrange
    const run = baseRun([passedTest({ id: 'SU-1', name: 'plain-name' })]);

    // Act
    const out = formatCiReport(run, { color: true });

    // Assert
    expect(out).not.toContain('\x1b[1mplain-name\x1b[0m');
  });

  it('omits ANSI codes when color is disabled', () => {
    // Arrange
    const run = baseRun([passedTest({ name: 'my-test' })]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).not.toContain('\x1b[');
  });

  it('marks timedout and errored tests distinctly from failed', () => {
    // Arrange
    const run = baseRun([
      failedTest({
        id: 'A-1',
        name: 'timed',
        status: 'timedout',
        passed: false,
      }),
      failedTest({
        id: 'A-2',
        name: 'errored',
        status: 'error',
        passed: false,
      }),
    ]);

    // Act
    const out = formatCiReport(run, { color: false });

    // Assert
    expect(out).toMatch(/TIMEOUT|timedout/i);
    expect(out).toMatch(/ERROR|errored/i);
  });
});
