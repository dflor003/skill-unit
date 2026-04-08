---
name: skill-unit
description: This skill should be used when the user asks to "test my skill", "run skill tests", "evaluate a skill", "run the test suite", "check skill quality", "/skill-unit", or mentions skill testing, skill evaluation, or running spec files. It provides a structured unit testing framework for AI agent skills with anti-bias evaluation.
---

# Skill Unit - Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. Discover test cases, delegate execution to an isolated CLI runner, dispatch grader agents for evaluation, and present a clear pass/fail report.

## Invocation

- **Slash command:** `/skill-unit`, `/skill-unit <path>`, `/skill-unit <skill-name>`
- **Natural language:** "test my skill", "run the skill tests", "evaluate the brainstorming skill"

## Execution Process

Follow these steps in exact order:

### Step 1: Capture Timestamp

Record the current time as the suite start timestamp in `YYYY-MM-DD-HH-MM-SS` format:

```bash
date +%Y-%m-%d-%H-%M-%S
```

All results files from this run share this timestamp.

### Step 2: Load Configuration

Read `.skill-unit.yml` from the repository root if it exists. Apply these defaults for any missing fields:

```yaml
test-dir: skill-tests
runner:
  tool: claude # The harness CLI to use (claude, copilot, codex)
  model: sonnet # Model to use for test execution (optional)
  max-turns: 10 # Max turns per test case
  runner-concurrency: 5 # Max spec files to run in parallel
output:
  format: interactive
  show-passing-details: false
execution:
  timeout: 120s
  grader-concurrency: 5
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

The `runner` section configures test execution. The `tool` selects the harness CLI (claude, copilot, codex). The runner script controls all CLI parameters internally to ensure proper isolation: no external skills leak in, no MCPs, and tool permissions are explicitly allowlisted. Users configure the tool, model, max turns, and optionally which tools the test agent may use.

The `runner.runner-concurrency` field controls how many spec files run their test runners in parallel (default 5). Each spec file launches its own runner process.

The `execution.grader-concurrency` field controls how many grader agents run in parallel (default 5). Each test case is graded by a separate agent; this limits concurrent dispatches to manage API costs.

#### Tool Permission Defaults

The runner uses `--permission-mode dontAsk` with explicit tool allowlists instead of `--dangerously-skip-permissions`. Built-in defaults (used when `.skill-unit.yml` omits these fields):

```yaml
runner:
  allowed-tools:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
    - Agent
    - Skill
  disallowed-tools:
    - AskUserQuestion
```

If `.skill-unit.yml` specifies `runner.allowed-tools`, it fully replaces the built-in allowed list. Same for `runner.disallowed-tools`. Each field is independent.

### Step 3: Discover Test Files

Use the Glob tool to find all `*.spec.md` files under the configured test directory.

- If the user specified a path or skill name, filter to only matching spec files.
- If no spec files are found, inform the user and suggest running the setup script.
- Sort discovered files by directory path for consistent ordering.

### Step 4: Process Spec Files

Parse all spec files and write their manifests sequentially (Steps 4a–4b). Then launch all runners in parallel, up to `runner-concurrency` at a time (default 5). Poll all running progress files concurrently using parallel `sleep && cat` calls. As runners complete, dispatch graders for their test cases. If there are more spec files than `runner-concurrency`, wait for a runner to finish before launching the next.

For each spec file:

#### 4a: Parse the Spec File

Read the spec file and parse it into:

1. **Frontmatter:** Extract YAML frontmatter fields (name, skill, tags, timeout, global-fixtures, setup, teardown).
2. **Test cases:** Split on `###` headings. For each test case extract:
   - **ID:** Everything before the first colon in the heading.
   - **Name:** Everything after the first colon, trimmed.
   - **Fixtures:** Bullet list under `**Fixtures:**` (may be absent). Each bullet is a relative path to a fixture folder.
   - **Prompt:** Content of the blockquote under `**Prompt:**`.
   - **Expectations:** Bullet list under `**Expectations:**`.
   - **Negative Expectations:** Bullet list under `**Negative Expectations:**` (may be absent).

#### 4b: Write Manifest and Execute via Runner CLI

After parsing, write a manifest JSON file and invoke the runner CLI to handle all test execution.

**Step 0: Resolve tool permissions.**

Apply the three-level resolution chain to produce the final `allowed-tools` and `disallowed-tools` lists:

1. Start with the built-in defaults: `allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, Skill]`, `disallowed = [AskUserQuestion]`.
2. If `.skill-unit.yml` has `runner.allowed-tools`, replace the allowed list entirely. If it has `runner.disallowed-tools`, replace the disallowed list entirely.
3. Apply spec frontmatter overrides:
   - If `allowed-tools` is present, it fully replaces the resolved allowed list (`allowed-tools-extra` is ignored).
   - If only `allowed-tools-extra` is present, union its entries with the resolved allowed list.
   - Same logic for `disallowed-tools` / `disallowed-tools-extra`.
4. Conflict resolution: if a tool appears in both final lists, remove it from allowed (disallow wins).

**Step 1: Create the manifest file.**

Write `.workspace/runs/{timestamp}/manifests/{spec-name}.manifest.json` using the Write tool:

```json
{
  "spec-name": "{name from frontmatter}",
  "global-fixture-path": "{resolved global-fixtures path relative to repo root, or null}",
  "skill-path": "{path to the skill directory being tested, or null}",
  "timestamp": "{timestamp from Step 1}",
  "timeout": "{timeout from spec frontmatter, or from config execution.timeout, e.g. '120s'}",
  "runner": {
    "tool": "{tool from config, e.g. 'claude'}",
    "model": "{model from config, or null}",
    "max-turns": 10,
    "allowed-tools": ["{resolved allowed tools list}"],
    "disallowed-tools": ["{resolved disallowed tools list}"]
  },
  "test-cases": [
    { "id": "{test-id}", "prompt": "{prompt text from blockquote}" },
    {
      "id": "{test-id}",
      "prompt": "{prompt text from blockquote}",
      "fixture-paths": ["{resolved path}", "{resolved path}"]
    }
  ]
}
```

Per-test `fixture-paths` is an array of resolved paths (relative to repo root). It is only present when the test case has a `**Fixtures:**` section. These are layered on top of the global fixture in copy order: global first, then per-test fixtures in list order.

**Resolving skill-path:** If the spec frontmatter has a `skill` field, search for the skill directory:

1. Check `.claude/skills/{skill-name}/SKILL.md` (repo-level skills)
2. Check `skills/{skill-name}/SKILL.md` (plugin skills)
3. If found, use the directory path (e.g., `.claude/skills/report-card`). If not found, set to null.

The runner installs the skill as a plugin in a sibling directory alongside each workspace's work directory. The agent cannot see the plugin files. Only the harness loads them via `--plugin-dir`.

Ensure the run directory exists:

```bash
mkdir -p .workspace/runs/{timestamp}/manifests
```

**Step 2: Invoke the runner CLI in the background.**

Use the Bash tool with `run_in_background: true`:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/runner.js .workspace/runs/{timestamp}/manifests/{spec-name}.manifest.json
```

To keep workspaces for debugging, add `--keep-workspaces`:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/runner.js .workspace/runs/{timestamp}/manifests/{spec-name}.manifest.json --keep-workspaces
```

**Step 3: Poll progress and report to user.**

While the runner executes in the background, poll the progress file to provide real-time feedback. The progress file is at `.workspace/runs/{timestamp}/manifests/{spec-name}.progress.json`.

**How to poll:** Use the Bash tool with `sleep` and `cat` to wait, then read the progress file in one call. This avoids redundant Read tool calls when the file hasn't changed:

```bash
sleep 45 && cat .workspace/runs/{timestamp}/manifests/{spec-name}.progress.json
```

**Timing guidance:**

- **First poll:** Wait ~45-55 seconds. Test cases typically take 15-60s each, and the runner needs startup time.
- **Subsequent polls:** Wait ~30-40 seconds between checks.
- **After a test completes:** If more tests remain, the next one is already running. Keep polling.

**Progress file format:**

```json
{
  "status": "running",
  "spec-name": "report-card-tests",
  "total": 4,
  "completed": 2,
  "current": "RC-3",
  "results": [
    { "id": "RC-1", "status": "OK", "duration-ms": 5200 },
    { "id": "RC-2", "status": "OK", "duration-ms": 3100 }
  ]
}
```

**How to report progress:** On each poll, present the full in-progress run status showing all test cases, including completed, current, and pending:

```
Running **report-card-tests** (4 test cases)...

- ✅ RC-1: OK (5.2s)
- ✅ RC-2: OK (3.1s)
- ⏳ RC-3: running...
- 🔜 RC-4: pending
```

Use `✅` for OK, `⏱️` for FAIL with timeout (exit 124), `❌` for other failures, `⏳` for the currently running test, and `🔜` for tests that haven't started yet.

Show the full list on every poll cycle so the user always sees the complete picture at a glance, not just incremental updates.

**Completion:** When `status` changes to `"complete"`, the progress file includes the `responses-path` field. Stop polling and proceed to Step 4.

**Step 4: Read the responses file.**

Once the runner completes, read the responses JSON file at the path indicated in the progress file's `responses-path` field. It contains:

```json
{
  "{test-id}": {
    "response": "the raw response text",
    "exit-code": 0,
    "duration-ms": 12340
  }
}
```

**Critical anti-bias notes:**

- The manifest contains ONLY test IDs and prompts, no expectations or test metadata.
- Each test case runs in a completely isolated CLI session from its own workspace.
- The workspace contains only fixture files, no spec files, no results, no test metadata.

#### 4c: Run Setup Script (if configured)

If the spec frontmatter includes a `setup` field, or if a default setup script exists in the spec file's directory:

1. Look for the script in the spec file's directory first, then the test directory root's `.setup/` folder.
2. Execute the script using the appropriate runtime based on file extension:
   - `.sh` → `bash`
   - `.js` → `node`
   - `.ts` → `npx tsx`
   - `.py` → `python3`

Note: setup scripts run before the runner CLI is invoked.

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
- Pass all test metadata (ID, name, prompt, expectations) inline in the prompt. The grader agent's own instructions tell it how to read the transcript and write the results.
- Do NOT include any information beyond what is listed above. The grader does not need spec-level metadata, other test cases, or configuration details.
- Dispatch up to `grader-concurrency` agents in parallel by including multiple Agent tool calls in a single message.
- After each batch completes, report progress to the user (e.g., "Graded 5/16 test cases...").
- After all graders complete, proceed to Step 4e.

#### 4e: Verify Grader Output

After all grader agents for this spec have completed, verify that a `.results.md` file exists for each test case:

```
.workspace/runs/{timestamp}/results/{spec-name}.{test-id}.results.md
```

If any results file is missing, report the missing test case IDs to the user as a warning.

#### 4f: Run Teardown (if configured)

If the spec frontmatter includes a `teardown` field, execute it using the same runtime resolution as setup scripts.

### Step 5: Generate and Present Report

After all spec files have been processed (all graders complete):

1. Run the report generation script:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/report.js .workspace/runs/{timestamp}
```

2. Read the generated report at `.workspace/runs/{timestamp}/results/report.md`.
3. Present the report content to the user, followed by a run summary.

The report groups results by spec, shows passing tests as single lines, and uses collapsible `<details>` blocks for failing tests with full expectation details and links to individual transcripts and grading files.

**After presenting the report, add a run summary** in this format:

```
## Results: {spec-name}

**{N} passed** | **{N} failed** | {N} total

- ✅ **{ID}: {Name}** ({score}) - {duration}
- ❌ **{ID}: {Name}** ({score}) - {brief failure reason}

Full report: [report.md](.workspace/runs/{timestamp}/results/report.md)
```

For multiple spec files, group results under each spec name. Include a brief failure reason for failing tests (one phrase summarizing why it failed). Link to the report file and optionally to individual transcripts and grading files for failures.

## Helper Scripts

- **`scripts/runner.js`** - The test execution CLI. Reads a manifest JSON, creates isolated workspaces, invokes the configured CLI runner per prompt, captures responses, writes a responses JSON file. Usage: `node ${CLAUDE_SKILL_DIR}/runner.js <manifest-path> [--keep-workspaces]`
- **`scripts/report.js`** - Generates a consolidated `report.md` from individual grader results files. Deterministic, no AI involved. Usage: `node ${CLAUDE_SKILL_DIR}/scripts/report.js <run-dir>`
- **`${CLAUDE_SKILL_DIR}/scripts/setup-tests.sh [skill-name]`** - Scaffolds a test directory structure in a user's project.

## Reference Material

For detailed documentation, consult these files as needed:

- **`references/spec-format.md`** - Complete spec file format reference with examples
- **`references/testing-guidelines.md`** - Best practices for writing test cases

## Configuration

The framework reads `.skill-unit.yml` from the repository root. See `templates/.skill-unit.yml` for all available options with documentation. A template can be copied with:

```bash
cp ${CLAUDE_SKILL_DIR}/templates/.skill-unit.yml .skill-unit.yml
```
