---
name: skill-unit
description: This skill should be used when the user asks to "test my skill", "run skill tests", "evaluate a skill", "run the test suite", "check skill quality", "/skill-unit", or mentions skill testing, skill evaluation, or running spec files. It provides a structured unit testing framework for AI agent skills with anti-bias evaluation.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/runner.js *) Bash(date *) Bash(mkdir -p .workspace/*)
---

# Skill Unit — Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. Discover test cases, delegate execution to an isolated CLI runner, grade results inline, and present a clear pass/fail summary.

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
test-dir: tests
runner:
  tool: claude        # The harness CLI to use (claude, copilot, codex)
  model: sonnet       # Model to use for test execution (optional)
  max-turns: 10       # Max turns per test case
output:
  format: interactive
  show-passing-details: false
execution:
  timeout: 120s
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

The `runner` section configures test execution. The `tool` selects the harness CLI (claude, copilot, codex). The runner script controls all CLI parameters internally to ensure proper isolation — no external skills leak in, no MCPs, and tool permissions are explicitly allowlisted. Users configure the tool, model, max turns, and optionally which tools the test agent may use.

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

### Step 4: Process Each Spec File (Sequential)

For each discovered spec file, in order:

#### 4a: Parse the Spec File

Read the spec file and parse it into:

1. **Frontmatter:** Extract YAML frontmatter fields (name, skill, tags, timeout, fixtures, setup, teardown).
2. **Test cases:** Split on `###` headings. For each test case extract:
   - **ID:** Everything before the first colon in the heading.
   - **Name:** Everything after the first colon, trimmed.
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
  "fixture-path": "{resolved fixture path relative to repo root, or null}",
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
    {"id": "{test-id}", "prompt": "{prompt text from blockquote}"},
    {"id": "{test-id}", "prompt": "{prompt text from blockquote}"}
  ]
}
```

**Resolving skill-path:** If the spec frontmatter has a `skill` field, search for the skill directory:
1. Check `.claude/skills/{skill-name}/SKILL.md` (repo-level skills)
2. Check `skills/{skill-name}/SKILL.md` (plugin skills)
3. If found, use the directory path (e.g., `.claude/skills/report-card`). If not found, set to null.

The runner installs the skill as a plugin in a sibling directory alongside each workspace's work directory. The agent cannot see the plugin files — only the harness loads them via `--plugin-dir`.

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

Read it periodically using the Read tool. It contains:

```json
{
  "status": "running",
  "spec-name": "report-card-tests",
  "total": 4,
  "completed": 2,
  "current": "RC-3",
  "results": [
    {"id": "RC-1", "status": "OK", "duration-ms": 5200},
    {"id": "RC-2", "status": "OK", "duration-ms": 3100}
  ]
}
```

Report progress to the user as test cases complete:

```
Running report-card-tests (4 test cases)...
  ✓ RC-1: OK (5.2s)
  ✓ RC-2: OK (3.1s)
  ⏳ RC-3: running...
```

When `status` changes to `"complete"`, the progress file includes the `responses-path` field.

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
- The manifest contains ONLY test IDs and prompts — no expectations or test metadata.
- Each test case runs in a completely isolated CLI session from its own workspace.
- The workspace contains only fixture files — no spec files, no results, no test metadata.

#### 4c: Run Setup Script (if configured)

If the spec frontmatter includes a `setup` field, or if a default setup script exists in the spec file's directory:

1. Look for the script in the spec file's directory first, then the test directory root's `.setup/` folder.
2. Execute the script using the appropriate runtime based on file extension:
   - `.sh` → `bash`
   - `.js` → `node`
   - `.ts` → `npx tsx`
   - `.py` → `python3`

Note: setup scripts run before the runner CLI is invoked.

#### 4d: Grade Results (Inline)

For each test case, read its response from the responses JSON and grade it against expectations.

**Grading process:**

1. For each **Expectation**, determine if the response satisfies it:
   - **MET** if the response clearly demonstrates the described behavior or outcome.
   - **NOT MET** if the response does not demonstrate it or contradicts it.
2. For each **Negative Expectation**, determine if the response violates it:
   - **PASSES** if the described behavior did NOT occur.
   - **FAILS** if the response demonstrates the prohibited behavior.
3. A test case **PASSES** only if ALL expectations are met AND ALL negative expectations pass.

**Grading standards:**
- Be strict and literal. Do not give credit for partial matches.
- Base evaluation only on what is observable in the response.
- When an expectation is not met, note a brief, specific reason.

#### 4e: Write Results File

Once all test cases for this spec file have been graded:

1. Determine the results file path: `.workspace/runs/{timestamp}/results/{spec-name}.results.md`
2. Ensure the `results/` directory exists (create it if not).
3. Write the results file using the Write tool in this format:

```
# Results: {spec file name}

**Timestamp:** {timestamp}
**Total:** {X passed}, {Y failed} of {Z total}

## {Test ID}: {Test Name} — {PASS|FAIL}

**Prompt:**
> {the original prompt}

**Expectations:**
- ✓ {expectation text}
- ✗ {expectation text}
  → {brief reason for failure}

**Negative Expectations:**
- ✓ {negative expectation text}
- ✗ {negative expectation text}
  → {brief reason for failure}

---
```

Include ALL test cases in the results, not just failures.

#### 4f: Run Teardown (if configured)

If the spec frontmatter includes a `teardown` field, execute it using the same runtime resolution as setup scripts.

### Step 5: Present Summary

After all spec files have been processed:

1. Read all results files for this run from `.workspace/runs/{timestamp}/results/`.
2. Aggregate pass/fail counts.
3. Present the summary in the configured output format.

**Interactive format (default):**

```
## Test Run: {YYYY-MM-DD HH:MM}
⏱ {duration} | {passed} passed | {failed} failed

📁 {test-dir}/{folder}/
  📄 {spec-file}.spec.md ({X} passed, {Y} failed)
    ✅ {ID}: {name} ({expectations-passed}/{expectations-total}, {negatives-passed}/{negatives-total})
    ❌ {ID}: {name}
       ✗ {failed expectation text}
         → {reason for failure}
       ✓ {passing expectation text}
```

**Rules for the summary:**
- Group results by directory path, then by spec file.
- Passing tests show on one line with expectation counts.
- Failing tests expand to show each expectation with ✓/✗ and failure reasons.
- Include the folder path as a breadcrumb for tracing back to source files.
- Show total duration, total passed, and total failed at the top.

## Helper Scripts

- **`scripts/runner.js`** — The test execution CLI. Reads a manifest JSON, creates isolated workspaces, invokes the configured CLI runner per prompt, captures responses, writes a responses JSON file. Usage: `node ${CLAUDE_SKILL_DIR}/runner.js <manifest-path> [--keep-workspaces]`
- **`${CLAUDE_SKILL_DIR}/scripts/setup-tests.sh [skill-name]`** — Scaffolds a test directory structure in a user's project.

## Reference Material

For detailed documentation, consult these files as needed:

- **`references/spec-format.md`** — Complete spec file format reference with examples
- **`references/testing-guidelines.md`** — Best practices for writing test cases

## Configuration

The framework reads `.skill-unit.yml` from the repository root. See `templates/.skill-unit.yml` for all available options with documentation. A template can be copied with:

```bash
cp ${CLAUDE_SKILL_DIR}/templates/.skill-unit.yml .skill-unit.yml
```
