import type { RunResult, TestResult } from '../types/run.js';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function secondsFromMs(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function groupBySpec(tests: TestResult[]): Map<string, TestResult[]> {
  const grouped = new Map<string, TestResult[]>();
  for (const t of tests) {
    const list = grouped.get(t.specName) ?? [];
    list.push(t);
    grouped.set(t.specName, list);
  }
  return grouped;
}

function renderFailureBody(test: TestResult): string {
  const lines = [
    ...test.expectationLines,
    ...test.negativeExpectationLines,
  ].filter((l) => l.startsWith('- \u2717'));
  return lines.join('\n');
}

function renderTestCase(test: TestResult): string {
  const attrParts = [
    `name="${escapeXml(test.name)}"`,
    `classname="${escapeXml(test.specName)}"`,
    `time="${secondsFromMs(test.durationMs)}"`,
  ];
  if (test.specPath) {
    attrParts.push(`file="${escapeXml(test.specPath)}"`);
  }
  const attrs = attrParts.join(' ');

  if (test.status === 'error' || test.status === 'timedout') {
    const msg =
      test.status === 'timedout'
        ? 'Test timed out'
        : 'Test errored before grading';
    return `    <testcase ${attrs}>\n      <error message="${escapeXml(msg)}" type="${test.status}"/>\n    </testcase>`;
  }

  if (!test.passed) {
    const msg = `${test.passedChecks}/${test.totalChecks} checks passed`;
    const body = renderFailureBody(test);
    const bodyText = body ? escapeXml(body) : '';
    return `    <testcase ${attrs}>\n      <failure message="${escapeXml(msg)}" type="AssertionError">${bodyText}</failure>\n    </testcase>`;
  }

  return `    <testcase ${attrs}/>`;
}

function renderSuite(
  specName: string,
  tests: TestResult[],
  timestamp: string
): string {
  const total = tests.length;
  const failures = tests.filter(
    (t) => !t.passed && t.status !== 'error' && t.status !== 'timedout'
  ).length;
  const errors = tests.filter(
    (t) => t.status === 'error' || t.status === 'timedout'
  ).length;
  const time = secondsFromMs(tests.reduce((sum, t) => sum + t.durationMs, 0));

  const attrs = [
    `name="${escapeXml(specName)}"`,
    `tests="${total}"`,
    `failures="${failures}"`,
    `errors="${errors}"`,
    `time="${time}"`,
    `timestamp="${escapeXml(timestamp)}"`,
  ].join(' ');

  const cases = tests.map(renderTestCase).join('\n');
  return `  <testsuite ${attrs}>\n${cases}\n  </testsuite>`;
}

export function generateJUnitXml(run: RunResult): string {
  const grouped = groupBySpec(run.tests);
  const totalFailures = run.tests.filter(
    (t) => !t.passed && t.status !== 'error' && t.status !== 'timedout'
  ).length;
  const totalErrors = run.tests.filter(
    (t) => t.status === 'error' || t.status === 'timedout'
  ).length;

  const rootAttrs = [
    `name="skill-unit"`,
    `tests="${run.testCount}"`,
    `failures="${totalFailures}"`,
    `errors="${totalErrors}"`,
    `time="${secondsFromMs(run.durationMs)}"`,
  ].join(' ');

  const suites = Array.from(grouped.entries())
    .map(([specName, tests]) => renderSuite(specName, tests, run.timestamp))
    .join('\n');

  const body = suites ? `\n${suites}\n` : '\n';

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites ${rootAttrs}>${body}</testsuites>\n`;
}
