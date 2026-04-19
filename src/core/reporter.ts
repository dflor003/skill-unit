import fs from 'node:fs';
import path from 'node:path';
import type { RunResult } from '../types/run.js';

// ---------------------------------------------------------------------------
// skill-unit reporter -- parses grader results files and assembles reports.
//
// Usage as module:
//   import { parseResultsFile, generateReport, generateSummary } from './reporter.js';
//
// Reads all *.results.md files from <runDir>/results/, parses pass/fail
// status and expectation details, writes a consolidated report.md, and
// returns structured data for terminal display.
// ---------------------------------------------------------------------------

// -- Parsed result type -------------------------------------------------------

export interface ParsedResult {
  testId: string;
  testName: string;
  passed: boolean;
  passedChecks: number;
  failedChecks: number;
  totalChecks: number;
  expectationLines: string[];
  negativeExpectationLines: string[];
}

// -- Grader JSON schema ------------------------------------------------------

// The grader's contract is to emit a JSON file in this exact shape, which the
// framework validates and then renders to human-readable markdown. Moving the
// source of truth off free-form markdown removes an entire class of parser
// drift (emoji embellishments, keyword variants, "PARTIAL PASS", etc.).
//
// `met: true` means "this check passed" for BOTH arrays: for an expectation,
// it means the behavior was observed; for a negative expectation, it means
// the prohibited behavior did NOT occur. The `passed` field is the grader's
// overall verdict and is the single field the runs-list pass count reads.

export interface GraderCheckJson {
  text: string;
  met: boolean;
  evidence?: string;
}

export interface GraderResultJson {
  testId: string;
  testName: string;
  prompt?: string;
  passed: boolean;
  expectations: GraderCheckJson[];
  negativeExpectations: GraderCheckJson[];
}

export class GraderJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraderJsonError';
  }
}

function isCheckArray(value: unknown): value is GraderCheckJson[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (c) =>
      c !== null &&
      typeof c === 'object' &&
      typeof (c as { text: unknown }).text === 'string' &&
      typeof (c as { met: unknown }).met === 'boolean'
  );
}

export function validateGraderJson(raw: unknown): GraderResultJson {
  if (raw === null || typeof raw !== 'object') {
    throw new GraderJsonError('grader output is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.testId !== 'string') {
    throw new GraderJsonError('grader JSON missing string field: testId');
  }
  if (typeof o.testName !== 'string') {
    throw new GraderJsonError('grader JSON missing string field: testName');
  }
  if (typeof o.passed !== 'boolean') {
    throw new GraderJsonError('grader JSON missing boolean field: passed');
  }
  if (!isCheckArray(o.expectations)) {
    throw new GraderJsonError(
      'grader JSON field expectations must be an array of {text, met, evidence?}'
    );
  }
  if (!isCheckArray(o.negativeExpectations)) {
    throw new GraderJsonError(
      'grader JSON field negativeExpectations must be an array of {text, met, evidence?}'
    );
  }
  return {
    testId: o.testId,
    testName: o.testName,
    prompt: typeof o.prompt === 'string' ? o.prompt : undefined,
    passed: o.passed,
    expectations: o.expectations,
    negativeExpectations: o.negativeExpectations,
  };
}

// -- Lenient normalization ---------------------------------------------------

// Haiku routinely drifts the exact key names we prescribe in the grader
// system prompt: `passed` becomes `overallResult` / `overall_pass` / `status`,
// `text` inside a check becomes `expectation` / `description`, `met` becomes
// `status` or `result` with a string value, and expectations are sometimes
// nested inside a `grading` wrapper. The shape is always isomorphic -- the
// model understood the schema, just renamed fields on the way out. Rather
// than fail the whole run on cosmetic key drift, we normalize any of these
// known variants back onto the canonical schema. Strict validation still
// runs *after* normalization to catch genuinely broken output.

function pickString(
  o: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function pickArray(
  o: Record<string, unknown>,
  keys: readonly string[]
): unknown[] | undefined {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

// Recognize any "passing" sentinel a grader might emit in a verdict field.
function coerceVerdict(raw: unknown): boolean | undefined {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === 'pass' || s === 'passed' || s === 'met' || s === 'success')
      return true;
    if (
      s === 'fail' ||
      s === 'failed' ||
      s === 'failure' ||
      s === 'not met' ||
      s === 'not-met' ||
      s === 'unmet'
    )
      return false;
  }
  return undefined;
}

const VERDICT_KEYS = [
  'passed',
  'overallPass',
  'overall_pass',
  'overallResult',
  'overall_result',
  'overallStatus',
  'overall_status',
  'passFailStatus',
  'pass_fail_status',
  'result',
  'status',
] as const;

const CHECK_TEXT_KEYS = [
  'text',
  'expectation',
  'description',
  'name',
  'label',
] as const;

const CHECK_VERDICT_KEYS = [
  'met',
  'passed',
  'result',
  'status',
  'pass',
] as const;

function normalizeCheck(raw: unknown): GraderCheckJson | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = pickString(o, CHECK_TEXT_KEYS);
  if (text === undefined) return null;
  let met: boolean | undefined;
  for (const k of CHECK_VERDICT_KEYS) {
    if (k in o) {
      met = coerceVerdict(o[k]);
      if (met !== undefined) break;
    }
  }
  if (met === undefined) return null;
  const evidence = pickString(o, ['evidence', 'reason', 'note']);
  return { text, met, ...(evidence !== undefined ? { evidence } : {}) };
}

function normalizeCheckArray(raw: unknown[]): GraderCheckJson[] {
  const out: GraderCheckJson[] = [];
  for (const item of raw) {
    const c = normalizeCheck(item);
    if (c !== null) out.push(c);
  }
  return out;
}

export function normalizeGraderJson(raw: unknown): GraderResultJson {
  if (raw === null || typeof raw !== 'object') {
    throw new GraderJsonError('grader output is not a JSON object');
  }
  const o = raw as Record<string, unknown>;

  // testId / testName: accept camelCase or snake_case
  const testId = pickString(o, ['testId', 'test_id', 'id']);
  const testName = pickString(o, ['testName', 'test_name', 'name']);
  if (testId === undefined) {
    throw new GraderJsonError('grader JSON missing testId (or test_id, id)');
  }
  if (testName === undefined) {
    throw new GraderJsonError(
      'grader JSON missing testName (or test_name, name)'
    );
  }

  // Expectations may be top-level or wrapped in a `grading` object.
  const root: Record<string, unknown> =
    o.grading && typeof o.grading === 'object'
      ? { ...o, ...(o.grading as Record<string, unknown>) }
      : o;

  const rawExpectations =
    pickArray(root, ['expectations', 'positiveExpectations']) ?? [];
  const rawNegatives =
    pickArray(root, ['negativeExpectations', 'negative_expectations']) ?? [];

  const expectations = normalizeCheckArray(rawExpectations);
  const negativeExpectations = normalizeCheckArray(rawNegatives);

  // Overall verdict: try explicit fields, else derive from checks.
  let passed: boolean | undefined;
  for (const k of VERDICT_KEYS) {
    if (k in o) {
      passed = coerceVerdict(o[k]);
      if (passed !== undefined) break;
    }
  }
  if (passed === undefined) {
    const all = [...expectations, ...negativeExpectations];
    if (all.length === 0) {
      throw new GraderJsonError(
        'grader JSON has no verdict field and no expectations to derive from'
      );
    }
    passed = all.every((c) => c.met);
  }

  const prompt = pickString(o, ['prompt', 'originalPrompt', 'original_prompt']);

  const canonical: GraderResultJson = {
    testId,
    testName,
    passed,
    expectations,
    negativeExpectations,
    ...(prompt !== undefined ? { prompt } : {}),
  };
  // Strict validation ensures our own normalizer never emits something the
  // downstream pipeline does not accept.
  return validateGraderJson(canonical);
}

// Convert a GraderCheckJson into the "- ✓ text" / "- ✗ text\n  → evidence"
// line form the rest of the codebase already consumes. Keeps downstream
// rendering (report.md details, TUI inline failures) unchanged.
function checkToLines(check: GraderCheckJson): string[] {
  const mark = check.met ? '✓' : '✗';
  const lines = [`- ${mark} ${check.text}`];
  if (check.evidence) {
    lines.push(`  → ${check.evidence}`);
  }
  return lines;
}

export function parseResultsJson(content: string): ParsedResult {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (e) {
    throw new GraderJsonError(
      `grader output is not valid JSON: ${(e as Error).message}`
    );
  }
  // Route through the lenient normalizer first -- graders frequently drift
  // field names (`overallResult` vs `passed`, `description` vs `text`, etc.)
  // and rejecting those outputs would waste the whole run over cosmetic
  // naming. The normalizer produces a strict canonical shape.
  const data = normalizeGraderJson(raw);

  const expectationLines = data.expectations.flatMap(checkToLines);
  const negativeExpectationLines =
    data.negativeExpectations.flatMap(checkToLines);

  const allChecks = [...data.expectations, ...data.negativeExpectations];
  const passedChecks = allChecks.filter((c) => c.met).length;
  const failedChecks = allChecks.length - passedChecks;

  return {
    testId: data.testId,
    testName: data.testName,
    passed: data.passed,
    passedChecks,
    failedChecks,
    totalChecks: allChecks.length,
    expectationLines,
    negativeExpectationLines,
  };
}

// Render a grader JSON payload to the human-readable `.results.md` file that
// the TUI drill-in and report links point at. Keeping the markdown output
// keeps the UX unchanged while the source of truth becomes structured data.
export function renderResultsMarkdown(data: GraderResultJson): string {
  const lines: string[] = [];
  lines.push(`# Results: ${data.testId}: ${data.testName}`);
  lines.push('');
  lines.push(`**Verdict:** ${data.passed ? 'PASS' : 'FAIL'}`);
  lines.push('');
  if (data.prompt) {
    lines.push('**Prompt:**');
    lines.push(`> ${data.prompt}`);
    lines.push('');
  }
  lines.push('**Expectations:**');
  for (const c of data.expectations) {
    for (const l of checkToLines(c)) lines.push(l);
  }
  lines.push('');
  lines.push('**Negative Expectations:**');
  for (const c of data.negativeExpectations) {
    for (const l of checkToLines(c)) lines.push(l);
  }
  lines.push('');
  return lines.join('\n');
}

// Write both the canonical JSON artifact AND a rendered markdown file. Kept
// together so nothing downstream sees a half-written pair.
export function writeGraderResults(
  jsonPath: string,
  data: GraderResultJson
): void {
  const markdownPath = jsonPath.replace(/\.results\.json$/, '.results.md');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.writeFileSync(markdownPath, renderResultsMarkdown(data), 'utf-8');
}

// -- Verdict extraction (shared with TUI hooks) ------------------------------

// Graders drift across many phrasings. The heuristic: find the first line
// introducing the verdict via any known keyword (Verdict / Result / Status /
// Overall Result), then scan that line for PASS/FAIL tokens. FAIL wins if
// present (conservative); PASS only counts when no PARTIAL qualifier is
// present. Returns null when no verdict line is found at all.
export function isResultsFilePassed(content: string): boolean {
  const verdictLineMatch = content.match(
    /^(?:#+\s*|\*\*)(?:Verdict|Result|Status|Overall(?:\s+Result)?)\b[^\n]*/im
  );
  if (!verdictLineMatch) return false;
  const line = verdictLineMatch[0];
  if (/\bFAIL(?:ED|URE)?\b/i.test(line)) return false;
  if (/\bPASS(?:ED)?\b/i.test(line) && !/\bPARTIAL\b/i.test(line)) return true;
  return false;
}

// -- Parse a single results file content -------------------------------------

export function parseResultsFile(content: string): ParsedResult {
  // Extract test ID and name from heading. Grader uses varying formats:
  //   # Results: TEST-1: basic-usage
  //   # Results: TD-1 — Generated Test Case
  //   # Results: TD-2 -- Detects Existing Spec
  //   # Test Result: TD-2 -- Detects Existing Spec
  const headingMatch = content.match(
    /^#\s+(?:Results|Test Result):\s*(\S+?)(?:\s*:\s*|\s+—\s*|\s+--\s+)(.+)$/m
  );
  const testId = headingMatch ? headingMatch[1].trim() : 'unknown';
  const testName = headingMatch ? headingMatch[2].trim() : 'unknown';

  const passed = isResultsFilePassed(content);

  // Extract expectation lines (checkmark and x lines, plus arrow continuation lines)
  const expectationLines: string[] = [];
  const negativeExpectationLines: string[] = [];
  let currentSection: 'expectations' | 'negative' | null = null;

  for (const line of content.split('\n')) {
    if (line.match(/^\*\*Expectations:\*\*/)) {
      currentSection = 'expectations';
      continue;
    }
    if (line.match(/^\*\*Negative Expectations:\*\*/)) {
      currentSection = 'negative';
      continue;
    }
    // Stop at next section heading or end
    if (
      line.match(/^#/) ||
      (line.match(/^\*\*/) && !line.match(/^\*\*(Expectations|Negative)/))
    ) {
      if (currentSection) currentSection = null;
      continue;
    }

    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    if (
      currentSection === 'expectations' &&
      (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))
    ) {
      expectationLines.push(trimmed);
    } else if (
      currentSection === 'negative' &&
      (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))
    ) {
      negativeExpectationLines.push(trimmed);
    } else if (
      !currentSection &&
      (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))
    ) {
      // Top-level check lines (no section header) -- count them as expectations
      expectationLines.push(trimmed);
    }
  }

  // Count pass/fail expectations
  const allLines = [...expectationLines, ...negativeExpectationLines];
  const passedChecks = allLines.filter((l) => l.match(/^- ✓/)).length;
  const failedChecks = allLines.filter((l) => l.match(/^- ✗/)).length;

  return {
    testId,
    testName,
    passed,
    passedChecks,
    failedChecks,
    totalChecks: passedChecks + failedChecks,
    expectationLines,
    negativeExpectationLines,
  };
}

// -- Parse a results file from disk ------------------------------------------

// Prefer the structured JSON artifact (new grader contract) over the legacy
// markdown. JSON is the deterministic source of truth; markdown is rendered
// from it for humans. Older runs that predate the JSON contract still have
// only `.results.md` on disk and are handled by the markdown fallback. The
// filename always encodes the testId, so if either parser returns "unknown"
// we recover it from the filename -- downstream code matches graded results
// to tests by testId, and a stale "unknown" used to make the runs list
// disagree with the drill-in.
function parseResultsFilePath(
  filePath: string
): ParsedResult & { fileName: string } {
  const fileName = path.basename(filePath);
  const jsonPath = filePath.replace(/\.results\.md$/, '.results.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = parseResultsJson(content);
      if (!parsed.testId) {
        const match = fileName.match(/\.([^.]+)\.results\.md$/);
        if (match) parsed.testId = match[1];
      }
      return { fileName, ...parsed };
    } catch {
      // Malformed JSON falls through to the markdown path so the run is
      // still visible, rather than silently dropping the whole entry.
    }
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseResultsFile(content);
  if (parsed.testId === 'unknown') {
    const match = fileName.match(/\.([^.]+)\.results\.md$/);
    if (match) parsed.testId = match[1];
  }
  return { fileName, ...parsed };
}

// -- Extract spec name from file name -----------------------------------------

function extractSpecName(fileName: string): string {
  // e.g., "test-design-tests.TDD-1.results.md" -> "test-design-tests"
  const withoutExt = fileName.replace(/\.results\.md$/, '');
  const lastDot = withoutExt.lastIndexOf('.');
  return lastDot > 0 ? withoutExt.substring(0, lastDot) : withoutExt;
}

// -- Generate report ----------------------------------------------------------

export interface GenerateReportResult {
  reportPath?: string;
  totalPassed: number;
  totalFailed: number;
  totalTests: number;
  grouped: Record<string, Array<ParsedResult & { fileName: string }>>;
  terminalSummary: string;
  error?: string;
}

export function generateReport(runDir: string): GenerateReportResult {
  const resultsDir = path.join(runDir, 'results');

  if (!fs.existsSync(resultsDir)) {
    return {
      error: `Results directory not found: ${resultsDir}`,
      totalPassed: 0,
      totalFailed: 0,
      totalTests: 0,
      grouped: {},
      terminalSummary: '',
    };
  }

  const resultsFiles = fs
    .readdirSync(resultsDir)
    .filter((f) => f.endsWith('.results.md'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (resultsFiles.length === 0) {
    return {
      error: `No *.results.md files found in ${resultsDir}`,
      totalPassed: 0,
      totalFailed: 0,
      totalTests: 0,
      grouped: {},
      terminalSummary: '',
    };
  }

  const results = resultsFiles.map((f) =>
    parseResultsFilePath(path.join(resultsDir, f))
  );
  const timestamp = path.basename(runDir);

  // Group by spec name
  const grouped: Record<
    string,
    Array<ParsedResult & { fileName: string }>
  > = {};
  for (const r of results) {
    const specName = extractSpecName(r.fileName);
    if (!grouped[specName]) grouped[specName] = [];
    grouped[specName].push(r);
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const totalTests = results.length;

  // -- Build the full report.md file ------------------------------------------

  const fileLines: string[] = [];

  fileLines.push(`# Test Run: ${timestamp}`);
  fileLines.push('');
  fileLines.push(
    `**${totalPassed} passed** | **${totalFailed} failed** | ${totalTests} total`
  );
  fileLines.push('');
  fileLines.push('---');
  fileLines.push('');

  for (const [specName, specResults] of Object.entries(grouped)) {
    const specPassed = specResults.filter((r) => r.passed).length;
    const specFailed = specResults.filter((r) => !r.passed).length;

    fileLines.push(
      `## ${specName} (${specPassed} passed, ${specFailed} failed)`
    );
    fileLines.push('');

    for (const r of specResults) {
      const transcriptLink = `${specName}.${r.testId}.transcript.md`;
      const resultsLink = r.fileName;

      if (r.passed) {
        fileLines.push(
          `- \u2705 **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) \u2014 [transcript](${transcriptLink}) | [grading](${resultsLink})`
        );
      } else {
        fileLines.push(
          `- \u274c **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) \u2014 [transcript](${transcriptLink}) | [grading](${resultsLink})`
        );
        fileLines.push('');
        fileLines.push('  <details>');
        fileLines.push('  <summary>Failure details</summary>');
        fileLines.push('');

        if (r.expectationLines.length > 0) {
          fileLines.push('  **Expectations:**');
          for (const el of r.expectationLines) {
            fileLines.push(`  ${el}`);
          }
          fileLines.push('');
        }

        if (r.negativeExpectationLines.length > 0) {
          fileLines.push('  **Negative Expectations:**');
          for (const el of r.negativeExpectationLines) {
            fileLines.push(`  ${el}`);
          }
          fileLines.push('');
        }

        fileLines.push('  </details>');
      }
      fileLines.push('');
    }
  }

  // Write report file
  const reportPath = path.join(resultsDir, 'report.md');
  fs.writeFileSync(reportPath, fileLines.join('\n'), 'utf-8');

  // -- Build terminal summary -------------------------------------------------

  const termLines: string[] = [];

  termLines.push('');
  termLines.push('# Test Results');
  termLines.push('');

  for (const [specName, specResults] of Object.entries(grouped)) {
    termLines.push(`## ${specName}`);
    termLines.push('');

    for (const r of specResults) {
      const icon = r.passed ? '\u2705' : '\u274c';
      const score = `${r.passedChecks}/${r.totalChecks}`;

      termLines.push(`  ${icon} **${r.testId}**: ${r.testName} \`(${score})\``);

      if (!r.passed) {
        // Show failed expectations inline
        const failures = [
          ...r.expectationLines.filter((l) => l.match(/^- \u2717/)),
          ...r.negativeExpectationLines.filter((l) => l.match(/^- \u2717/)),
        ];
        for (const f of failures) {
          const reason = f.replace(/^- \u2717\s*/, '');
          termLines.push(`     *\u2717 ${reason}*`);
        }
      }
    }

    termLines.push('');
  }

  termLines.push('---');
  termLines.push('');

  if (totalFailed === 0) {
    termLines.push(`**${totalPassed} passed**, ${totalTests} total`);
  } else {
    termLines.push(
      `**${totalPassed} passed**, **${totalFailed} failed**, ${totalTests} total`
    );
  }

  termLines.push(`Report: \`${reportPath}\``);
  termLines.push('');

  return {
    reportPath,
    totalPassed,
    totalFailed,
    totalTests,
    grouped,
    terminalSummary: termLines.join('\n'),
  };
}

// -- Generate compact terminal summary from RunResult -------------------------

export function generateSummary(runResult: RunResult): string {
  const { passed, failed, testCount, durationMs, cost, tokens } = runResult;
  const durationSec = (durationMs / 1000).toFixed(1);
  const costStr = `$${cost.toFixed(4)}`;
  const tokStr = tokens.toLocaleString();

  const parts = [
    `${passed} passed`,
    `${failed} failed`,
    `${testCount} total`,
    `${durationSec}s`,
    costStr,
    `${tokStr} tokens`,
  ];

  return parts.join(' | ');
}
