#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// skill-unit report generator -- assembles a consolidated report from
// individual grader results files.
//
// Usage as script: node report.js <run-dir>
// Usage as module: const { generateReport } = require("./report")
//
// Reads all *.results.md files from <run-dir>/results/, parses pass/fail
// status and expectation details, writes a consolidated report.md, and
// returns structured data for terminal display.
// ---------------------------------------------------------------------------

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

  // Extract expectation lines (checkmark and x lines, plus arrow continuation lines)
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

// -- Extract spec name from file name -----------------------------------------

function extractSpecName(fileName) {
  // e.g., "test-design-tests.TDD-1.results.md" -> "test-design-tests"
  const withoutExt = fileName.replace(/\.results\.md$/, "");
  const lastDot = withoutExt.lastIndexOf(".");
  return lastDot > 0 ? withoutExt.substring(0, lastDot) : withoutExt;
}

// -- Generate report ----------------------------------------------------------

function generateReport(runDir) {
  const resultsDir = path.join(runDir, "results");

  if (!fs.existsSync(resultsDir)) {
    return { error: `Results directory not found: ${resultsDir}` };
  }

  const resultsFiles = fs.readdirSync(resultsDir)
    .filter((f) => f.endsWith(".results.md"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (resultsFiles.length === 0) {
    return { error: `No *.results.md files found in ${resultsDir}` };
  }

  const results = resultsFiles.map((f) => parseResultsFile(path.join(resultsDir, f)));
  const timestamp = path.basename(runDir);

  // Group by spec name
  const grouped = {};
  for (const r of results) {
    const specName = extractSpecName(r.fileName);
    if (!grouped[specName]) grouped[specName] = [];
    grouped[specName].push(r);
  }

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const totalTests = results.length;

  // -- Build the full report.md file ------------------------------------------

  const fileLines = [];

  fileLines.push(`# Test Run: ${timestamp}`);
  fileLines.push("");
  fileLines.push(`**${totalPassed} passed** | **${totalFailed} failed** | ${totalTests} total`);
  fileLines.push("");
  fileLines.push("---");
  fileLines.push("");

  for (const [specName, specResults] of Object.entries(grouped)) {
    const specPassed = specResults.filter((r) => r.passed).length;
    const specFailed = specResults.filter((r) => !r.passed).length;

    fileLines.push(`## ${specName} (${specPassed} passed, ${specFailed} failed)`);
    fileLines.push("");

    for (const r of specResults) {
      const transcriptLink = `${specName}.${r.testId}.transcript.md`;
      const resultsLink = r.fileName;

      if (r.passed) {
        fileLines.push(`- ✅ **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) — [transcript](${transcriptLink}) | [grading](${resultsLink})`);
      } else {
        fileLines.push(`- ❌ **${r.testId}: ${r.testName}** (${r.passedChecks}/${r.totalChecks}) — [transcript](${transcriptLink}) | [grading](${resultsLink})`);
        fileLines.push("");
        fileLines.push(`  <details>`);
        fileLines.push(`  <summary>Failure details</summary>`);
        fileLines.push("");

        if (r.expectationLines.length > 0) {
          fileLines.push("  **Expectations:**");
          for (const el of r.expectationLines) {
            fileLines.push(`  ${el}`);
          }
          fileLines.push("");
        }

        if (r.negativeExpectationLines.length > 0) {
          fileLines.push("  **Negative Expectations:**");
          for (const el of r.negativeExpectationLines) {
            fileLines.push(`  ${el}`);
          }
          fileLines.push("");
        }

        fileLines.push("  </details>");
      }
      fileLines.push("");
    }
  }

  // Write report file
  const reportPath = path.join(resultsDir, "report.md");
  fs.writeFileSync(reportPath, fileLines.join("\n"), "utf-8");

  // -- Build terminal summary -------------------------------------------------

  const termLines = [];

  termLines.push("");
  termLines.push(`# Test Results`);
  termLines.push("");

  for (const [specName, specResults] of Object.entries(grouped)) {
    const specPassed = specResults.filter((r) => r.passed).length;
    const specFailed = specResults.filter((r) => !r.passed).length;

    termLines.push(`## ${specName}`);
    termLines.push("");

    for (const r of specResults) {
      const icon = r.passed ? "✅" : "❌";
      const score = `${r.passedChecks}/${r.totalChecks}`;

      if (r.passed) {
        termLines.push(`  ${icon} **${r.testId}**: ${r.testName} \`(${score})\``);
      } else {
        termLines.push(`  ${icon} **${r.testId}**: ${r.testName} \`(${score})\``);

        // Show failed expectations inline
        const failures = [
          ...r.expectationLines.filter((l) => l.match(/^- ✗/)),
          ...r.negativeExpectationLines.filter((l) => l.match(/^- ✗/)),
        ];
        for (const f of failures) {
          // Strip the "- ✗ " prefix and show as indented reason
          const reason = f.replace(/^- ✗\s*/, "");
          termLines.push(`     *✗ ${reason}*`);
        }
      }
    }

    termLines.push("");
  }

  // Summary line
  termLines.push("---");
  termLines.push("");

  if (totalFailed === 0) {
    termLines.push(`**${totalPassed} passed**, ${totalTests} total`);
  } else {
    termLines.push(`**${totalPassed} passed**, **${totalFailed} failed**, ${totalTests} total`);
  }

  termLines.push(`Report: \`${reportPath}\``);
  termLines.push("");

  return {
    reportPath,
    totalPassed,
    totalFailed,
    totalTests,
    grouped,
    terminalSummary: termLines.join("\n"),
  };
}

// -- Module exports -----------------------------------------------------------

module.exports = { generateReport };

// -- Script entry point -------------------------------------------------------

if (require.main === module) {
  const runDir = process.argv[2];

  if (!runDir) {
    process.stderr.write("Usage: node report.js <run-dir>\n");
    process.exit(1);
  }

  const result = generateReport(runDir);

  if (result.error) {
    process.stderr.write(result.error + "\n");
    process.exit(1);
  }

  process.stdout.write(result.terminalSummary);
}
