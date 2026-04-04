#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// skill-unit report generator — assembles a consolidated report from
// individual grader results files.
//
// Usage: node report.js <run-dir>
//
// Reads all *.results.md files from <run-dir>/results/, parses pass/fail
// status and expectation details, and writes a consolidated report.md.
// ---------------------------------------------------------------------------

const runDir = process.argv[2];

if (!runDir) {
  process.stderr.write("Usage: node report.js <run-dir>\n");
  process.exit(1);
}

const resultsDir = path.join(runDir, "results");

if (!fs.existsSync(resultsDir)) {
  process.stderr.write(`ERROR: Results directory not found: ${resultsDir}\n`);
  process.exit(1);
}

// -- Parse a single results file --------------------------------------------

function parseResultsFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const fileName = path.basename(filePath);

  // Extract test ID and name from heading: # Results: {ID}: {Name}
  const headingMatch = content.match(/^# Results:\s*(.+?):\s*(.+)$/m);
  const testId = headingMatch ? headingMatch[1].trim() : "unknown";
  const testName = headingMatch ? headingMatch[2].trim() : "unknown";

  // Extract verdict
  const verdictMatch = content.match(/\*\*Verdict:\*\*\s*(PASS|FAIL)/i);
  const passed = verdictMatch ? verdictMatch[1].toUpperCase() === "PASS" : false;

  // Extract expectation lines (✓ and ✗ lines, plus → continuation lines)
  const expectationLines = [];
  const negativeExpectationLines = [];
  let currentSection = null;

  for (const line of content.split("\n")) {
    if (line.match(/^\*\*Expectations:\*\*/)) {
      currentSection = "expectations";
      continue;
    }
    if (line.match(/^\*\*Negative Expectations:\*\*/)) {
      currentSection = "negative";
      continue;
    }
    // Stop at next section heading or end
    if (line.match(/^#/) || (line.match(/^\*\*/) && !line.match(/^\*\*(Expectations|Negative)/))) {
      if (currentSection) currentSection = null;
      continue;
    }

    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    if (currentSection === "expectations" && (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))) {
      expectationLines.push(trimmed);
    } else if (currentSection === "negative" && (trimmed.match(/^- [✓✗]/) || trimmed.match(/^\s+→/))) {
      negativeExpectationLines.push(trimmed);
    }
  }

  // Count pass/fail expectations
  const allLines = [...expectationLines, ...negativeExpectationLines];
  const passedChecks = allLines.filter((l) => l.match(/^- ✓/)).length;
  const failedChecks = allLines.filter((l) => l.match(/^- ✗/)).length;

  return {
    fileName,
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

// -- Discover and parse results files ---------------------------------------

const resultsFiles = fs.readdirSync(resultsDir)
  .filter((f) => f.endsWith(".results.md"))
  .sort();

if (resultsFiles.length === 0) {
  process.stderr.write(`No *.results.md files found in ${resultsDir}\n`);
  process.exit(1);
}

const results = resultsFiles.map((f) => parseResultsFile(path.join(resultsDir, f)));

// -- Group by spec name -----------------------------------------------------

// File naming convention: {spec-name}.{test-id}.results.md
// Extract spec name as everything before the last two dot-separated segments.
function extractSpecName(fileName) {
  // e.g., "test-design-tests.TDD-1.results.md" → "test-design-tests"
  const withoutExt = fileName.replace(/\.results\.md$/, "");
  const lastDot = withoutExt.lastIndexOf(".");
  return lastDot > 0 ? withoutExt.substring(0, lastDot) : withoutExt;
}

const grouped = {};
for (const r of results) {
  const specName = extractSpecName(r.fileName);
  if (!grouped[specName]) grouped[specName] = [];
  grouped[specName].push(r);
}

// -- Extract timestamp from run dir name ------------------------------------

const timestamp = path.basename(runDir);

// -- Generate report --------------------------------------------------------

const totalPassed = results.filter((r) => r.passed).length;
const totalFailed = results.filter((r) => !r.passed).length;
const totalTests = results.length;

const lines = [];

lines.push(`# Test Run: ${timestamp}`);
lines.push("");
lines.push(`**${totalPassed} passed** | **${totalFailed} failed** | ${totalTests} total`);
lines.push("");
lines.push("---");
lines.push("");

for (const [specName, specResults] of Object.entries(grouped)) {
  const specPassed = specResults.filter((r) => r.passed).length;
  const specFailed = specResults.filter((r) => !r.passed).length;

  lines.push(`## ${specName} (${specPassed} passed, ${specFailed} failed)`);
  lines.push("");

  for (const r of specResults) {
    const transcriptLink = `${specName}.${r.testId}.transcript.md`;
    const resultsLink = r.fileName;

    if (r.passed) {
      // Passing test — single line with links
      lines.push(`- ✅ **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) — [transcript](${transcriptLink}) | [grading](${resultsLink})`);
    } else {
      // Failing test — collapsible details
      lines.push(`- ❌ **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) — [transcript](${transcriptLink}) | [grading](${resultsLink})`);
      lines.push("");
      lines.push(`  <details>`);
      lines.push(`  <summary>Failure details</summary>`);
      lines.push("");

      if (r.expectationLines.length > 0) {
        lines.push("  **Expectations:**");
        for (const el of r.expectationLines) {
          lines.push(`  ${el}`);
        }
        lines.push("");
      }

      if (r.negativeExpectationLines.length > 0) {
        lines.push("  **Negative Expectations:**");
        for (const el of r.negativeExpectationLines) {
          lines.push(`  ${el}`);
        }
        lines.push("");
      }

      lines.push("  </details>");
    }
    lines.push("");
  }
}

// -- Write report -----------------------------------------------------------

const reportPath = path.join(resultsDir, "report.md");
fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");

process.stdout.write(reportPath + "\n");
