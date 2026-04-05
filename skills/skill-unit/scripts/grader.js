#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const log = require("./logger")("grader");

// ---------------------------------------------------------------------------
// skill-unit grader — spawns grader CLI processes to evaluate test results
//
// This module is imported by cli.js. After the runner produces transcripts,
// the grader spawns one CLI process per test case, passing expectations and
// the transcript path. Each grader reads the transcript, evaluates against
// expectations, and writes a results file.
//
// Concurrency is controlled by config.execution["grader-concurrency"].
// ---------------------------------------------------------------------------

// -- Agent path ---------------------------------------------------------------
// The grader agent (agents/grader.md) defines the model, tools, and grading
// instructions. We invoke it directly via --agent.

// -- Grader prompt construction -----------------------------------------------

function buildGraderPrompt(tc, specName, timestamp) {
  const resultsDir = path.join(".workspace", "runs", timestamp, "results");
  const transcriptPath = path.join(resultsDir, `${specName}.${tc.id}.transcript.md`);
  const outputPath = path.join(resultsDir, `${specName}.${tc.id}.results.md`);

  const expectations = (tc.expectations || []).map((e) => `- ${e}`).join("\n");
  const negExpectations = (tc["negative-expectations"] || []).length
    ? tc["negative-expectations"].map((e) => `- ${e}`).join("\n")
    : "None";

  return `Grade this test case.

**Test ID:** ${tc.id}
**Test Name:** ${tc.name}

**Prompt:**
> ${tc.prompt}

**Expectations:**
${expectations}

**Negative Expectations:**
${negExpectations}

**Transcript path:** ${transcriptPath}
**Output path:** ${outputPath}`;
}

// -- CLI tool profiles for grader invocation ----------------------------------

function resolveAgentPath() {
  // Look for agents/grader.md relative to repo root
  const candidate = path.join(process.cwd(), "agents", "grader.md");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

const GRADER_PROFILES = {
  claude: (agentPath) => [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--max-turns", "5",
    "--permission-mode", "dontAsk",
    "--no-chrome",
    "--no-session-persistence",
    "--agent", agentPath,
  ],
};

// -- Spawn a single grader process --------------------------------------------

function spawnGrader(tool, cliArgs, prompt) {
  return new Promise((resolve) => {
    const proc = spawn(tool, cliArgs, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on("close", (code) => {
      resolve({ exitCode: code || 0, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

// -- Batch execution with concurrency -----------------------------------------

async function runBatch(tasks, concurrency) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

// -- Main grading function ----------------------------------------------------

async function gradeSpecs(specs, config, timestamp) {
  const tool = config.runner.tool || "claude";
  const concurrency = (config.execution && config.execution["grader-concurrency"]) || 5;

  const buildArgs = GRADER_PROFILES[tool];
  if (!buildArgs) {
    log.error(`Unsupported tool for grading: "${tool}". Supported: ${Object.keys(GRADER_PROFILES).join(", ")}`);
    return;
  }

  const agentPath = resolveAgentPath();
  if (!agentPath) {
    log.error("Could not find agents/grader.md in the repository root.");
    return;
  }

  const cliArgs = buildArgs(agentPath);

  // Build all grading tasks across all specs
  const tasks = [];

  for (const spec of specs) {
    const specName = spec.frontmatter.name || path.basename(spec.path, ".spec.md");

    for (const tc of spec.testCases) {
      const transcriptPath = path.join(
        ".workspace", "runs", timestamp, "results",
        `${specName}.${tc.id}.transcript.md`
      );

      // Skip if no transcript (test may have been filtered or failed to run)
      if (!fs.existsSync(transcriptPath)) {
        log.warn(`Skipping ${tc.id}: no transcript at ${transcriptPath}`);
        continue;
      }

      const prompt = buildGraderPrompt(tc, specName, timestamp);

      tasks.push({
        specName,
        testId: tc.id,
        run: () => spawnGrader(tool, cliArgs, prompt),
      });
    }
  }

  if (tasks.length === 0) {
    log.info("No test cases to grade.");
    return;
  }

  log.info(`Grading ${tasks.length} test case(s) with concurrency ${concurrency}`);

  // Execute in batches
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(tasks.length / concurrency);

    log.info(`Batch ${batchNum}/${totalBatches}: ${batch.map((t) => t.testId).join(", ")}`);

    const results = await Promise.all(batch.map((t) => t.run()));

    for (let j = 0; j < batch.length; j++) {
      const { exitCode, stderr } = results[j];
      if (exitCode === 0) {
        log.success(`  ${batch[j].testId}: OK`);
      } else {
        log.error(`  ${batch[j].testId}: FAIL(${exitCode})`);
        if (stderr) {
          const preview = stderr.substring(0, 500);
          log.debug(`  ${batch[j].testId} stderr: ${preview}${stderr.length > 500 ? "..." : ""}`);
        }
      }
    }

    log.info(`Graded ${Math.min(i + concurrency, tasks.length)}/${tasks.length} test cases`);
  }

  // Verify results files exist
  const resultsDir = path.join(".workspace", "runs", timestamp, "results");
  let missing = 0;
  for (const task of tasks) {
    const resultsPath = path.join(resultsDir, `${task.specName}.${task.testId}.results.md`);
    if (!fs.existsSync(resultsPath)) {
      log.warn(`Missing results file for ${task.testId}: ${resultsPath}`);
      missing++;
    }
  }

  if (missing > 0) {
    log.warn(`${missing} result file(s) missing`);
  } else {
    log.success("All result files written");
  }
}

// -- Exports ------------------------------------------------------------------

module.exports = { gradeSpecs };
