import type { RunResult, TestResult, TestStatus } from '../types/run.js';

const ANSI_RESET = '\x1b[0m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_RED = '\x1b[31m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_DIM = '\x1b[2m';

function statusIcon(status: TestStatus, passed: boolean): string {
  if (status === 'timedout') return '\u231B'; // hourglass
  if (status === 'error') return '\u26A0\uFE0F'; // warning sign
  return passed ? '\u2705' : '\u274C'; // green check / red X
}

function statusTag(status: TestStatus, passed: boolean): string | null {
  if (status === 'timedout') return 'TIMEOUT';
  if (status === 'error') return 'ERROR';
  if (!passed) return null;
  return null;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

// Derive a "path > segments" breadcrumb from a spec file path,
// mirroring the TUI dashboard's display style.
export function specBreadcrumb(
  specPath: string,
  testDir: string | undefined
): string {
  const normalized = specPath.replace(/\\/g, '/');
  let relative = normalized;
  if (testDir) {
    const prefix = testDir.replace(/\\/g, '/').replace(/\/$/, '') + '/';
    if (normalized.startsWith(prefix)) {
      relative = normalized.slice(prefix.length);
    }
  }
  const withoutExt = relative.replace(/\.spec\.md$/, '');
  return withoutExt.split('/').join(' > ');
}

function specHeader(test: TestResult, testDir: string | undefined): string {
  if (test.specPath) {
    return specBreadcrumb(test.specPath, testDir);
  }
  return test.specName;
}

interface Paint {
  bold(s: string): string;
  cyan(s: string): string;
  green(s: string): string;
  red(s: string): string;
  yellow(s: string): string;
  dim(s: string): string;
}

function makePaint(color: boolean): Paint {
  if (!color) {
    const id = (s: string) => s;
    return { bold: id, cyan: id, green: id, red: id, yellow: id, dim: id };
  }
  return {
    bold: (s) => `${ANSI_BOLD}${s}${ANSI_RESET}`,
    cyan: (s) => `${ANSI_CYAN}${s}${ANSI_RESET}`,
    green: (s) => `${ANSI_GREEN}${s}${ANSI_RESET}`,
    red: (s) => `${ANSI_RED}${s}${ANSI_RESET}`,
    yellow: (s) => `${ANSI_YELLOW}${s}${ANSI_RESET}`,
    dim: (s) => `${ANSI_DIM}${s}${ANSI_RESET}`,
  };
}

function formatTestLine(test: TestResult, paint: Paint): string {
  const icon = statusIcon(test.status, test.passed);
  const tag = statusTag(test.status, test.passed);
  const score = paint.dim(`(${test.passedChecks}/${test.totalChecks})`);
  const duration = paint.dim(formatDuration(test.durationMs));
  const tagStr = tag ? ` ${paint.yellow(`[${tag}]`)}` : '';
  const id = paint.bold(test.id);
  return `  ${icon} ${id} ${test.name} ${score}  ${duration}${tagStr}`;
}

function collectFailureReasons(test: TestResult): string[] {
  const all = [...test.expectationLines, ...test.negativeExpectationLines];
  return all
    .filter((l) => l.startsWith('- \u2717'))
    .map((l) => l.replace(/^- \u2717\s*/, ''));
}

interface TestGroup {
  header: string;
  tests: TestResult[];
}

function groupByHeader(
  tests: TestResult[],
  testDir: string | undefined
): TestGroup[] {
  const ordered: TestGroup[] = [];
  const indexByHeader = new Map<string, number>();
  for (const test of tests) {
    const header = specHeader(test, testDir);
    const existingIdx = indexByHeader.get(header);
    if (existingIdx === undefined) {
      indexByHeader.set(header, ordered.length);
      ordered.push({ header, tests: [test] });
    } else {
      ordered[existingIdx].tests.push(test);
    }
  }
  return ordered;
}

export interface CiReportOptions {
  testDir?: string;
  color?: boolean;
}

export function formatCiReport(
  run: RunResult,
  options: CiReportOptions = {}
): string {
  const color = options.color ?? !process.env.NO_COLOR;
  const paint = makePaint(color);
  const groups = groupByHeader(run.tests, options.testDir);
  const lines: string[] = [''];

  for (const group of groups) {
    const anyFailed = group.tests.some((t) => !t.passed);
    const rawStatus = anyFailed ? 'FAIL' : 'PASS';
    const status = anyFailed ? paint.red(rawStatus) : paint.green(rawStatus);
    const header = paint.bold(paint.cyan(group.header));
    lines.push(`${status}  ${header}`);
    for (const test of group.tests) {
      lines.push(formatTestLine(test, paint));
      if (!test.passed) {
        for (const reason of collectFailureReasons(test)) {
          lines.push(`    ${paint.red('\u2717')} ${reason}`);
        }
      }
    }
    lines.push('');
  }

  for (const line of formatCiSummary(run, paint)) {
    lines.push(line);
  }
  lines.push('');

  return lines.join('\n');
}

function formatCiSummary(run: RunResult, paint: Paint): string[] {
  const timedout = run.tests.filter((t) => t.status === 'timedout').length;
  const durationSec = `${(run.durationMs / 1000).toFixed(1)}s`;
  const costStr = `$${run.cost.toFixed(4)}`;
  const tokenStr = run.tokens.toLocaleString();

  const countParts: string[] = [
    paint.green(`\u2705 ${run.passed} passed`),
    paint.red(`\u274C ${run.failed} failed`),
  ];
  if (timedout > 0) {
    countParts.push(paint.yellow(`\u231B ${timedout} timed out`));
  }
  countParts.push(paint.dim(`${run.testCount} total`));

  return [
    `${paint.bold('Tests:')}     ${countParts.join('  ')}`,
    `${paint.bold('Duration:')}  ${durationSec}`,
    `${paint.bold('Cost:')}      ${costStr}`,
    `${paint.bold('Tokens:')}    ${tokenStr}`,
  ];
}
