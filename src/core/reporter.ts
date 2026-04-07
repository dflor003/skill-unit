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

// -- Parse a single results file content -------------------------------------

export function parseResultsFile(content: string): ParsedResult {
  // Extract test ID and name from heading: # Results: {ID}: {Name}
  const headingMatch = content.match(/^# Results:\s*(.+?):\s*(.+)$/m);
  const testId = headingMatch ? headingMatch[1].trim() : 'unknown';
  const testName = headingMatch ? headingMatch[2].trim() : 'unknown';

  // Extract verdict
  const verdictMatch = content.match(/\*\*Verdict:\*\*\s*(PASS|FAIL)/i);
  const passed = verdictMatch ? verdictMatch[1].toUpperCase() === 'PASS' : false;

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
    if (line.match(/^#/) || (line.match(/^\*\*/) && !line.match(/^\*\*(Expectations|Negative)/))) {
      if (currentSection) currentSection = null;
      continue;
    }

    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    if (currentSection === 'expectations' && (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))) {
      expectationLines.push(trimmed);
    } else if (currentSection === 'negative' && (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))) {
      negativeExpectationLines.push(trimmed);
    } else if (!currentSection && (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))) {
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

function parseResultsFilePath(filePath: string): ParsedResult & { fileName: string } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  return { fileName, ...parseResultsFile(content) };
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

  const resultsFiles = fs.readdirSync(resultsDir)
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

  const results = resultsFiles.map((f) => parseResultsFilePath(path.join(resultsDir, f)));
  const timestamp = path.basename(runDir);

  // Group by spec name
  const grouped: Record<string, Array<ParsedResult & { fileName: string }>> = {};
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
  fileLines.push(`**${totalPassed} passed** | **${totalFailed} failed** | ${totalTests} total`);
  fileLines.push('');
  fileLines.push('---');
  fileLines.push('');

  for (const [specName, specResults] of Object.entries(grouped)) {
    const specPassed = specResults.filter((r) => r.passed).length;
    const specFailed = specResults.filter((r) => !r.passed).length;

    fileLines.push(`## ${specName} (${specPassed} passed, ${specFailed} failed)`);
    fileLines.push('');

    for (const r of specResults) {
      const transcriptLink = `${specName}.${r.testId}.transcript.md`;
      const resultsLink = r.fileName;

      if (r.passed) {
        fileLines.push(`- \u2705 **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) \u2014 [transcript](${transcriptLink}) | [grading](${resultsLink})`);
      } else {
        fileLines.push(`- \u274c **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) \u2014 [transcript](${transcriptLink}) | [grading](${resultsLink})`);
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
    const specPassed = specResults.filter((r) => r.passed).length;
    const specFailed = specResults.filter((r) => !r.passed).length;

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
    termLines.push(`**${totalPassed} passed**, **${totalFailed} failed**, ${totalTests} total`);
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
