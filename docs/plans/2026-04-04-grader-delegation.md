# Grader Delegation & Transcript-Based Evaluation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline grading with per-test-case grader agent delegation using full conversation transcripts, and add a deterministic report generation script.

**Architecture:** The evaluator dispatches the `grader` agent once per test case (batched at configurable concurrency). The grader reads the `.transcript.md` conversation history and writes a per-test-case results file. A Node.js report script assembles a consolidated `report.md` from all grader outputs. The runner is updated to write transcripts to the `results/` directory.

**Tech Stack:** Plugin system (markdown skills/agents), Node.js scripts, Bash.

**Spec:** `docs/specs/2026-04-04-grader-delegation-design.md`

---

## File Structure

```
skill-unit/
├── agents/
│   └── grader.md                            # MODIFY: rewrite with self-contained grading logic
├── skills/
│   └── skill-unit/
│       ├── SKILL.md                         # MODIFY: replace inline grading with grader dispatch
│       ├── templates/
│       │   └── .skill-unit.yml              # MODIFY: add grader-concurrency field
│       └── scripts/
│           ├── runner.js                    # MODIFY: write .transcript.md to results/
│           └── report.js                    # CREATE: consolidated report generation
├── docs/
│   └── architecture/
│       ├── workspaces.md                    # MODIFY: update structure and artifact descriptions
│       └── test-execution.md                # MODIFY: reference grader delegation
```

---

### Task 1: Runner — Write Transcripts to Results Directory

**Files:**
- Modify: `skills/skill-unit/scripts/runner.js:244-256` (log path setup)
- Modify: `skills/skill-unit/scripts/runner.js:498-506` (log path variables)

The runner currently writes `.log.md` files to the `logs/` directory. Change it to write `.transcript.md` files to `results/` instead, and update the internal heading.

- [ ] **Step 1: Update the run directory setup to include results dir**

In `runner.js`, the runner already creates `logsDir` and `responsesDir`. Add `resultsDir`:

```js
// Around line 418-426, replace:
const runDir = path.join(workspaceRoot, "runs", timestamp);
const manifestsDir = path.join(runDir, "manifests");
const logsDir = path.join(runDir, "logs");
const responsesDir = path.join(runDir, "responses");
const workspacesDir = path.join(workspaceRoot, "workspaces");

fs.mkdirSync(manifestsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(responsesDir, { recursive: true });
fs.mkdirSync(workspacesDir, { recursive: true });

// With:
const runDir = path.join(workspaceRoot, "runs", timestamp);
const manifestsDir = path.join(runDir, "manifests");
const logsDir = path.join(runDir, "logs");
const responsesDir = path.join(runDir, "responses");
const resultsDir = path.join(runDir, "results");
const workspacesDir = path.join(workspaceRoot, "workspaces");

fs.mkdirSync(manifestsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(responsesDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });
fs.mkdirSync(workspacesDir, { recursive: true });
```

- [ ] **Step 2: Update the per-test-case log path to write transcript to results**

In the per-test-case loop (around line 499-501), change the `.log.md` path to `.transcript.md` in `resultsDir`:

```js
// Replace:
const logPath = path.join(logsDir, `${specName}.${testId}.log.jsonl`);
const mdLogPath = path.join(logsDir, `${specName}.${testId}.log.md`);

// With:
const logPath = path.join(logsDir, `${specName}.${testId}.log.jsonl`);
const mdLogPath = path.join(resultsDir, `${specName}.${testId}.transcript.md`);
```

- [ ] **Step 3: Update the transcript heading**

In the `runAsync` function (around line 253), change the heading written to the markdown log:

```js
// Replace:
mdLogStream.write(`# Test Log: ${options.testId || "unknown"}\n\n`);

// With:
mdLogStream.write(`# Transcript: ${options.testId || "unknown"}\n\n`);
```

- [ ] **Step 4: Verify runner still works**

Run a quick sanity check. From the repo root:

```bash
ls .workspace/runs/
```

Pick the most recent timestamp and confirm the directory structure exists. Then verify the runner script parses without errors:

```bash
node -c skills/skill-unit/scripts/runner.js
```

Expected: No syntax errors.

- [ ] **Step 5: Commit**

```bash
git add skills/skill-unit/scripts/runner.js
git commit -m "refactor(runner): write .transcript.md to results/ instead of .log.md to logs/"
```

---

### Task 2: Rewrite Grader Agent

**Files:**
- Modify: `agents/grader.md`

Rewrite the grader agent to be fully self-contained. It reads a `.transcript.md` file, grades against expectations, and writes a `.results.md` file. All grading logic, transcript format understanding, and output format are baked into the agent prompt.

- [ ] **Step 1: Rewrite `agents/grader.md`**

Replace the entire contents of `agents/grader.md` with:

````markdown
---
name: grader
description: |
  Use this agent to grade test responses against expected outcomes and write results to disk. This agent should only be spawned by the skill-unit evaluator.
model: sonnet
color: green
tools: ["Read", "Write"]
---

You are a strict, objective test grader for the skill-unit testing framework. You grade a single test case by reading the full conversation transcript and evaluating it against expected outcomes.

## Input

You will receive:

1. **Test metadata** (inline in your prompt):
   - Test ID and name
   - The original prompt that was given to the agent
   - A list of Expectations (behaviors that SHOULD have occurred)
   - A list of Negative Expectations (behaviors that should NOT have occurred)
2. **Transcript path** — path to a `.transcript.md` file to Read
3. **Output path** — path to a `.results.md` file to Write

## Step 1: Read the Transcript

Use the Read tool to read the transcript file at the path provided. The transcript is a markdown file with this structure:

```
# Transcript: {test-id}

**Prompt:** {the original prompt}

---

**Model:** {model name}
**Skills:** {discovered skills}
**CWD:** {workspace path}

---

## Turn N — Assistant

{assistant's text response}

**Tool call:** `{tool name}`
```json
{tool input JSON}
```

**Tool result:**
```
{tool output}
```

---

**Result:** {success|error}
```

The transcript captures the agent's complete behavioral trajectory: every turn of text, every tool call with its input, and every tool result. This is your primary evidence.

## Step 2: Grade Against Expectations

For each **Expectation**, determine if the transcript satisfies it:

- **MET** — The transcript clearly demonstrates the described behavior or outcome. Evidence can come from any part of the transcript: assistant text, tool calls attempted, tool inputs, tool results, or the combination of multiple turns.
- **NOT MET** — The transcript does not demonstrate the behavior, or contradicts it.

For each **Negative Expectation**, determine if the transcript violates it:

- **PASSES** — The described behavior did NOT occur anywhere in the transcript.
- **FAILS** — The transcript demonstrates the prohibited behavior.

A test case **PASSES** only if ALL expectations are MET and ALL negative expectations PASS.

### Grading Standards

- **Be strict and literal.** Do not give credit for partial matches unless the expectation explicitly allows it.
- **Evaluate the full trajectory.** A tool call that was attempted but failed (e.g., blocked by permissions) still counts as "the agent tried to do X." Consider the agent's intent as demonstrated by its actions, not just the final outcome.
- **Base evaluation on observable evidence.** Every MET/NOT MET judgment must be traceable to specific content in the transcript — a tool call, a tool result, or assistant text.
- **Do not infer unobserved behavior.** If the transcript does not show the agent doing something, do not assume it happened off-screen.
- **Failure reasons must be specific.** When an expectation is NOT MET, explain what was expected, what the transcript actually shows, and where (which turn or tool call).

## Step 3: Write the Results File

Use the Write tool to write the results to the output path in this exact format:

```markdown
# Results: {Test ID}: {Test Name}

**Verdict:** {PASS|FAIL}

**Prompt:**
> {the original prompt}

**Expectations:**
- ✓ {expectation text}
- ✗ {expectation text}
  → {specific reason with evidence from transcript}

**Negative Expectations:**
- ✓ {negative expectation text}
- ✗ {negative expectation text}
  → {specific reason with evidence from transcript}
```

### Output Rules

- Include ALL expectations and negative expectations, not just failures.
- Use ✓ for passing checks and ✗ for failing checks.
- Failure reasons MUST reference specific transcript evidence (e.g., "Turn 3 shows the agent called `Glob` to search for skills but never called `Read` on a SKILL.md file").
- Do not summarize or editorialize on the agent's response beyond grading it.
- Do not skip any expectations or negative expectations.
- Write the file and then stop. Do not output anything else.
````

- [ ] **Step 2: Verify the agent file parses correctly**

Check the frontmatter is valid YAML by eyeballing the `---` delimiters and ensuring the fields are correct:

```bash
head -8 agents/grader.md
```

Expected output:
```
---
name: grader
description: |
  Use this agent to grade test responses against expected outcomes and write results to disk. This agent should only be spawned by the skill-unit evaluator.
model: sonnet
color: green
tools: ["Read", "Write"]
---
```

- [ ] **Step 3: Commit**

```bash
git add agents/grader.md
git commit -m "feat(grader): rewrite agent with self-contained transcript-based grading logic"
```

---

### Task 3: Report Generation Script

**Files:**
- Create: `skills/skill-unit/scripts/report.js`

A deterministic Node.js script that globs all per-test-case `.results.md` files in a run directory, parses them, and generates a consolidated `report.md` with collapsible failure details and relative links.

- [ ] **Step 1: Create `skills/skill-unit/scripts/report.js`**

```js
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
```

- [ ] **Step 2: Verify the script parses without errors**

```bash
node -c skills/skill-unit/scripts/report.js
```

Expected: No output (no syntax errors).

- [ ] **Step 3: Test the script against existing results**

If there are any `.results.md` files from a prior run, run the script against them. Otherwise, create a minimal test fixture:

```bash
mkdir -p /tmp/skill-unit-report-test/results
```

Write a dummy results file to `/tmp/skill-unit-report-test/results/test-spec.TC-1.results.md`:

```markdown
# Results: TC-1: dummy-test

**Verdict:** PASS

**Prompt:**
> do something

**Expectations:**
- ✓ Did the thing
```

Write a failing dummy to `/tmp/skill-unit-report-test/results/test-spec.TC-2.results.md`:

```markdown
# Results: TC-2: failing-test

**Verdict:** FAIL

**Prompt:**
> do another thing

**Expectations:**
- ✓ Started correctly
- ✗ Completed the task
  → Turn 3 shows agent gave up after first tool call failed
```

Then run:

```bash
node skills/skill-unit/scripts/report.js /tmp/skill-unit-report-test
```

Expected: Prints a path ending in `results/report.md`. Read the file and verify it contains:
- A heading with the directory name as timestamp
- 1 passed, 1 failed summary
- TC-1 as a single line with ✅
- TC-2 with ❌ and a `<details>` block containing the failure reason

Clean up:

```bash
rm -rf /tmp/skill-unit-report-test
```

- [ ] **Step 4: Commit**

```bash
git add skills/skill-unit/scripts/report.js
git commit -m "feat: add deterministic report generation script"
```

---

### Task 4: Configuration — Add grader-concurrency

**Files:**
- Modify: `skills/skill-unit/templates/.skill-unit.yml`

Add the `grader-concurrency` field to the execution section of the config template.

- [ ] **Step 1: Add grader-concurrency to the template**

In `skills/skill-unit/templates/.skill-unit.yml`, add the new field to the `execution:` section. After the `timeout: 120s` line, add:

```yaml
  # Maximum number of grader agents to run in parallel. Each test case is
  # graded by a separate agent; this limits how many run concurrently.
  grader-concurrency: 5
```

The full `execution:` section should read:

```yaml
# Execution settings
execution:
  # Default per-test timeout. Can be overridden per spec file via frontmatter.
  timeout: 120s
  # Maximum number of grader agents to run in parallel. Each test case is
  # graded by a separate agent; this limits how many run concurrently.
  grader-concurrency: 5
```

- [ ] **Step 2: Commit**

```bash
git add skills/skill-unit/templates/.skill-unit.yml
git commit -m "feat(config): add grader-concurrency setting to template"
```

---

### Task 5: Update Evaluator Skill — Replace Inline Grading with Grader Dispatch

**Files:**
- Modify: `skills/skill-unit/SKILL.md`

This is the core change. Replace the inline grading step (4d), remove the results writing step (4e), and update the summary step (5) to use the report script. Also update the `allowed-tools` frontmatter.

- [ ] **Step 1: Update the allowed-tools frontmatter**

In `skills/skill-unit/SKILL.md`, line 4, replace:

```
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/runner.js *) Bash(date *) Bash(mkdir -p .workspace/*)
```

With:

```
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/runner.js *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/report.js *) Bash(date *) Bash(mkdir -p .workspace/*)
```

- [ ] **Step 2: Add grader-concurrency to the configuration defaults**

In the Step 2 (Load Configuration) section, add `grader-concurrency` to the defaults block. After the `timeout: 120s` line in the defaults YAML block (around line 44), add:

```yaml
  grader-concurrency: 5
```

Also add a note to the prose explaining the field. After the paragraph about the `runner` section (around line 50), add:

```markdown
The `execution.grader-concurrency` field controls how many grader agents run in parallel (default 5). Each test case is graded by a separate agent; this limits concurrent dispatches to manage API costs.
```

- [ ] **Step 3: Replace Step 4d (inline grading) with grader agent dispatch**

Replace the entire "4d: Grade Results (Inline)" section (lines 228-245) with:

````markdown
#### 4d: Dispatch Grader Agents

For each test case in this spec, dispatch a `grader` agent to evaluate the response against expectations. The grader reads the full conversation transcript and writes a per-test-case results file.

**Dispatch in batches** of up to `grader-concurrency` (from config, default 5). Wait for each batch to complete before dispatching the next.

For each test case, spawn the `grader` agent with the following prompt:

```
Grade this test case.

**Test ID:** {test-id}
**Test Name:** {test-name}

**Prompt:**
> {the original prompt from the spec}

**Expectations:**
{bullet list of expectations from the spec}

**Negative Expectations:**
{bullet list of negative expectations from the spec, or "None" if absent}

**Transcript path:** .workspace/runs/{timestamp}/results/{spec-name}.{test-id}.transcript.md
**Output path:** .workspace/runs/{timestamp}/results/{spec-name}.{test-id}.results.md
```

**Dispatch rules:**
- Use the Agent tool with `subagent_type` set to `grader`.
- Pass all test metadata (ID, name, prompt, expectations) inline in the prompt — the grader agent's own instructions tell it how to read the transcript and write the results.
- Do NOT include any information beyond what is listed above. The grader does not need spec-level metadata, other test cases, or configuration details.
- Dispatch up to `grader-concurrency` agents in parallel by including multiple Agent tool calls in a single message.
- After each batch completes, report progress to the user (e.g., "Graded 5/16 test cases...").
- After all graders complete, proceed to Step 4e.
````

- [ ] **Step 4: Replace Step 4e (write results file) with a progress note**

Replace the entire "4e: Write Results File" section (lines 247-279) with:

````markdown
#### 4e: Verify Grader Output

After all grader agents for this spec have completed, verify that a `.results.md` file exists for each test case:

```
.workspace/runs/{timestamp}/results/{spec-name}.{test-id}.results.md
```

If any results file is missing, report the missing test case IDs to the user as a warning.
````

- [ ] **Step 5: Replace Step 5 (present summary) with report script invocation**

Replace the entire "Step 5: Present Summary" section (lines 285-312) with:

````markdown
### Step 5: Generate and Present Report

After all spec files have been processed (all graders complete):

1. Run the report generation script:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/report.js .workspace/runs/{timestamp}
```

2. Read the generated report at `.workspace/runs/{timestamp}/results/report.md`.
3. Present the report content to the user.

The report groups results by spec, shows passing tests as single lines, and uses collapsible `<details>` blocks for failing tests with full expectation details and links to individual transcripts and grading files.
````

- [ ] **Step 6: Update the helper scripts section**

In the "Helper Scripts" section (around line 317), add the report script. After the `runner.js` entry, add:

```markdown
- **`scripts/report.js`** — Generates a consolidated `report.md` from individual grader results files. Deterministic — no AI involved. Usage: `node ${CLAUDE_SKILL_DIR}/scripts/report.js <run-dir>`
```

- [ ] **Step 7: Verify SKILL.md is well-formed**

Read through the modified file and check:
- The frontmatter `allowed-tools` line includes the report script
- Step 4d references the grader agent correctly
- Step 4e references the results files
- Step 5 invokes the report script
- No orphan references to "inline grading" remain

```bash
grep -n "inline" skills/skill-unit/SKILL.md
```

Expected: No matches (the term "inline grading" should no longer appear).

- [ ] **Step 8: Commit**

```bash
git add skills/skill-unit/SKILL.md
git commit -m "feat(evaluator): replace inline grading with grader agent dispatch and report script"
```

---

### Task 6: Update Architecture Documentation

**Files:**
- Modify: `docs/architecture/workspaces.md`
- Modify: `docs/architecture/test-execution.md`

Update both architecture docs to reflect the new workspace structure and grader delegation flow.

- [ ] **Step 1: Update workspaces.md directory structure**

In `docs/architecture/workspaces.md`, replace the directory structure block (lines 10-27) with:

```
.workspace/                                 # repo root, gitignored
  runs/{timestamp}/                         # one folder per test run
    manifests/
      {spec-name}.manifest.json             # input manifest for the runner
      {spec-name}.progress.json             # real-time progress (polled by evaluator)
    logs/
      {spec-name}.{test-id}.log.jsonl       # raw CLI stream-json output (debug artifact)
    responses/
      {spec-name}.responses.json            # abbreviated responses (used for progress)
    results/
      {spec-name}.{test-id}.transcript.md   # conversation transcript (from runner)
      {spec-name}.{test-id}.results.md      # grader evaluation (from grader agent)
      report.md                             # consolidated report (from report script)
  workspaces/{uuid}/                        # one per test case, ephemeral
    work/                                   # agent's working directory (cwd)
    plugin/                                 # skill-under-test installed as plugin
      .claude-plugin/plugin.json
      skills/{skill-name}/SKILL.md
```

- [ ] **Step 2: Update workspaces.md lifecycle summary**

Replace the lifecycle summary at the bottom of `workspaces.md` (lines 91-117) with:

```
Evaluator (SKILL.md)
  │
  ├─ writes manifest to .workspace/runs/{ts}/manifests/{spec}.manifest.json
  ├─ invokes runner.js with manifest path
  │
  │  Runner (runner.js)
  │    ├─ creates .workspace/ at repo root (idempotent)
  │    ├─ creates run dirs: manifests/, logs/, responses/, results/
  │    │
  │    ├─ for each test case:
  │    │   ├─ generates UUID
  │    │   ├─ creates .workspace/workspaces/{uuid}/work/ (copies fixtures)
  │    │   ├─ creates .workspace/workspaces/{uuid}/plugin/ (installs skill)
  │    │   ├─ spawns CLI: cwd=work/, --plugin-dir=plugin/
  │    │   ├─ writes transcript to .workspace/runs/{ts}/results/{spec}.{id}.transcript.md
  │    │   ├─ writes raw log to .workspace/runs/{ts}/logs/{spec}.{id}.log.jsonl
  │    │   └─ updates progress file
  │    │
  │    ├─ writes responses to .workspace/runs/{ts}/responses/
  │    ├─ cleans up workspaces/{uuid}/ directories
  │    └─ writes final progress with responses-path
  │
  ├─ polls progress file for status updates
  ├─ reads responses file (for completion confirmation)
  ├─ dispatches grader agent per test case (batched at grader-concurrency)
  │
  │  Grader (agents/grader.md) — one per test case
  │    ├─ reads .workspace/runs/{ts}/results/{spec}.{id}.transcript.md
  │    └─ writes .workspace/runs/{ts}/results/{spec}.{id}.results.md
  │
  ├─ invokes report.js to generate consolidated report
  │
  │  Report Script (report.js)
  │    ├─ reads all .workspace/runs/{ts}/results/*.results.md
  │    └─ writes .workspace/runs/{ts}/results/report.md
  │
  ├─ reads report.md
  └─ presents summary to user
```

- [ ] **Step 3: Update test-execution.md to reference grader delegation**

In `docs/architecture/test-execution.md`, add a new section before the "Relationship to Other Architecture Docs" section at the bottom. Add:

```markdown
## Grader Delegation

After the runner completes, the evaluator dispatches the `grader` agent (`agents/grader.md`) once per test case. Each grader reads the full conversation transcript (`.transcript.md`) and writes a per-test-case results file (`.results.md`). Graders are dispatched in configurable batches (default 5 concurrent) to manage API costs.

The grader agent prompt is self-contained — all grading logic, transcript format understanding, and output format are baked into the agent definition. The evaluator's dispatch is lightweight: test metadata inline, plus paths to the transcript and output files.

A deterministic Node.js script (`scripts/report.js`) then assembles a consolidated `report.md` from all grader outputs. This separation means:

- **Grading** is AI-powered (nuanced evaluation of behavioral trajectories)
- **Reporting** is deterministic (pure parsing and template assembly)
- **The evaluator** stays lean (no transcript data in its context)

See `docs/specs/2026-04-04-grader-delegation-design.md` for the full design rationale.
```

- [ ] **Step 4: Update test-execution.md "Removed" section**

In the "Removed: test-executor Agent" section, update the last paragraph to mention that grading was also extracted. Replace:

```markdown
The `grader` agent (`agents/grader.md`) is retained for potential Phase 2 use (persistent grader consumer pattern for parallel execution).
```

With:

```markdown
The `grader` agent (`agents/grader.md`) is now actively used — the evaluator dispatches it once per test case for transcript-based grading. See the "Grader Delegation" section above.
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/workspaces.md docs/architecture/test-execution.md
git commit -m "docs: update architecture docs for grader delegation and transcript-based evaluation"
```

---

### Task 7: End-to-End Verification

**Files:** None (verification only)

Run the full flow manually to verify everything works together.

- [ ] **Step 1: Verify runner writes transcripts to results/**

Run the skill-unit tests against any existing spec (or the self-test report-card fixture). After the runner completes, check:

```bash
ls .workspace/runs/*/results/*.transcript.md
```

Expected: `.transcript.md` files in `results/`, not in `logs/`.

- [ ] **Step 2: Verify no .log.md files in logs/**

```bash
ls .workspace/runs/*/logs/*.log.md 2>/dev/null
```

Expected: No `.log.md` files (only `.log.jsonl` files should be in `logs/`).

- [ ] **Step 3: Verify grader writes per-test-case results**

After grading completes, check:

```bash
ls .workspace/runs/*/results/*.results.md
```

Expected: One `.results.md` file per test case.

- [ ] **Step 4: Verify report generation**

```bash
cat .workspace/runs/*/results/report.md
```

Expected: A consolidated report with pass/fail summary, per-spec groupings, collapsible failure details, and relative links to transcripts and grading files.

- [ ] **Step 5: Verify evaluator context stayed lean**

Review the conversation output — the evaluator should NOT have read any transcript files or response data directly. It should only show: spec parsing, grader dispatch progress, and the final report.
