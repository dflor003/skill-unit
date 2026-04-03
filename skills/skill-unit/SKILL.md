---
name: skill-unit
description: This skill should be used when the user asks to "test my skill", "run skill tests", "evaluate a skill", "run the test suite", "check skill quality", "/skill-unit", or mentions skill testing, skill evaluation, or running spec files. It provides a structured unit testing framework for AI agent skills with anti-bias evaluation.
---

# Skill Unit — Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. Discover test cases, execute prompts in isolated workspaces via a configurable CLI runner, grade results inline, and present a clear pass/fail summary.

## Invocation

- **Slash command:** `/skill-unit`, `/skill-unit <path>`, `/skill-unit <skill-name>`
- **Natural language:** "test my skill", "run the skill tests", "evaluate the brainstorming skill"

## Execution Process

Follow these steps in exact order:

### Step 1: Capture Timestamp

Record the current time as the suite start timestamp in `YYYY-MM-DD-HH-MM-SS` format. Use the Bash tool to run `date +%Y-%m-%d-%H-%M-%S`. All results files from this run share this timestamp.

### Step 2: Load Configuration

Read `.skill-unit.yml` from the repository root if it exists. Apply these defaults for any missing fields:

```yaml
test-dir: tests
runner:
  command: claude
  args: ["--print", "--output-format", "text", "--max-turns", "10"]
output:
  format: interactive
  show-passing-details: false
execution:
  timeout: 120s
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

The `runner` section configures how test prompts are executed in isolated sessions. The `command` is the CLI executable and `args` are the default arguments. This allows the framework to work with any AI agent harness (Claude, Copilot, Codex, etc.).

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

#### 4b: Create Workspace (if fixtures configured)

If the spec frontmatter includes a `fixtures` field:

1. Resolve the fixture path relative to the spec file's directory.
2. Create an isolated workspace using the helper script:

```bash
WORKSPACE=$(bash ${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/create-workspace.sh "<absolute-fixture-path>")
```

3. Store the workspace path — all CLI runner invocations for this spec file will use this directory.

The workspace is a temp directory containing a complete copy of the fixture. The CLI runner session launched from it sees ONLY the fixture files, providing process-level anti-bias isolation. No hooks or marker files needed.

**If no fixtures are configured**, the CLI runner executes from the current working directory.

#### 4c: Run Setup Script (if configured)

If the spec frontmatter includes a `setup` field, or if a default setup script exists in the spec file's directory:

1. Look for the script in the spec file's directory first, then the test directory root's `.setup/` folder.
2. Execute the script using the appropriate runtime based on file extension:
   - `.sh` → `bash`
   - `.js` → `node`
   - `.ts` → `npx tsx`
   - `.py` → `python3`
3. If a workspace was created in Step 4b, run the setup script inside the workspace directory.

#### 4d: Execute Test Cases (Sequential)

For each test case in the spec file, execute the prompt in an **isolated CLI session** using the configured runner.

**How to execute a test prompt:**

1. Build the runner command from `.skill-unit.yml` config (or defaults).
2. Use the Bash tool to run the command from the workspace directory (if created) or the current directory:

```bash
cd "$WORKSPACE" && echo "PROMPT_TEXT_HERE" | claude --print --output-format text --max-turns 10
```

Or without a workspace:

```bash
echo "PROMPT_TEXT_HERE" | claude --print --output-format text --max-turns 10
```

Replace `claude` and the args with whatever is configured in the `runner` section. The prompt text comes from the blockquote in the test case.

3. Capture the full stdout as the test-executor's response.
4. Store the response paired with its test case ID for grading.

**Critical anti-bias rules:**
- NEVER include expectations, test IDs, or test metadata in the prompt.
- NEVER mention "test", "evaluation", "expected", or "spec" in the prompt.
- Pass the prompt EXACTLY as written in the blockquote — do not modify, rephrase, or add context.
- Each test case runs in a completely isolated CLI session with no shared context.
- The workspace directory scoping ensures the CLI session has no visibility into the test suite.

#### 4e: Grade Results (Inline)

After each test case is executed, grade the response immediately. Do NOT spawn a separate agent or CLI session for grading.

**Grading process:**

For each test case, compare the test-executor's response against the expectations:

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

#### 4f: Write Results File

Once all test cases for this spec file have been graded:

1. Determine the results file path: `{spec-dir}/results/{timestamp}.{spec-name}.results.md`
   - `{spec-dir}` is the directory containing the spec file.
   - `{timestamp}` is the suite start timestamp from Step 1.
   - `{spec-name}` is the spec file name without the `.spec.md` extension.
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

#### 4g: Run Teardown (if configured)

If the spec frontmatter includes a `teardown` field, execute it using the same runtime resolution as setup scripts. If a workspace exists, run teardown inside it.

#### 4h: Clean Up Workspace

If a workspace was created in Step 4b, remove it:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/cleanup-workspace.sh "$WORKSPACE"
```

This safely removes the temp directory. If cleanup fails, warn the user but continue processing remaining spec files.

### Step 5: Present Summary

After all spec files have been processed:

1. Read all results files for this run (matching the suite timestamp) from across all `results/` subdirectories.
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

- **`scripts/create-workspace.sh <fixture-path>`** — Creates a temp directory, copies fixture contents into it, prints the workspace path to stdout.
- **`scripts/cleanup-workspace.sh <workspace-path>`** — Safely removes a workspace directory (validates the path matches the naming pattern before deleting).
- **`scripts/setup-tests.sh [skill-name]`** — Scaffolds a test directory structure in a user's project.

## Reference Material

For detailed documentation, consult these files as needed:

- **`references/spec-format.md`** — Complete spec file format reference with examples
- **`references/testing-guidelines.md`** — Best practices for writing test cases

## Configuration

The framework reads `.skill-unit.yml` from the repository root. See `templates/.skill-unit.yml` for all available options with documentation. A template can be copied with:

```bash
cp ${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/templates/.skill-unit.yml .skill-unit.yml
```
