---
name: Skill Unit
description: This skill should be used when the user asks to "test my skill", "run skill tests", "evaluate a skill", "run the test suite", "check skill quality", "/skill-unit", or mentions skill testing, skill evaluation, or running spec files. It provides a structured unit testing framework for AI agent skills with anti-bias evaluation.
version: 0.1.0
---

# Skill Unit — Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. Discover test cases, execute prompts through isolated subagents, grade results, and present a clear pass/fail summary.

## Invocation

- **Slash command:** `/skill-unit`, `/skill-unit <path>`, `/skill-unit <skill-name>`
- **Natural language:** "test my skill", "run the skill tests", "evaluate the brainstorming skill"

## Execution Process

Follow these steps in exact order:

### Step 1: Capture Timestamp

Record the current time as the suite start timestamp in `YYYY-MM-DD-HH-MM-SS` format. All results files from this run share this timestamp.

### Step 2: Load Configuration

Read `.skill-unit.yml` from the repository root if it exists. Apply these defaults for any missing fields:

```yaml
test-dir: tests
output:
  format: interactive
  show-passing-details: false
execution:
  timeout: 60s
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

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

#### 4b: Set Up Fixtures (if configured)

If the spec frontmatter includes a `fixtures` field:

1. Resolve the fixture path relative to the spec file's directory.
2. List all files in the fixture folder.
3. Copy the entire fixture folder contents into the repository root working directory.
4. Record the list of copied files for cleanup later.

**Important:** The fixture path in frontmatter is relative to the spec file location, not the repo root.

#### 4c: Run Setup Script (if configured)

If the spec frontmatter includes a `setup` field, or if a default setup script exists in the spec file's directory:

1. Look for the script in the spec file's directory first, then the test directory root's `.setup/` folder.
2. Execute the script using the appropriate runtime based on file extension:
   - `.sh` → `bash`
   - `.js` → `node`
   - `.ts` → `npx tsx`
   - `.py` → `python3`

#### 4d: Execute Test Cases (Sequential)

For each test case in the spec file:

1. Spawn a `test-executor` subagent using the Agent tool:
   - Set `subagent_type` to `test-executor`.
   - Pass ONLY the prompt text as the agent's prompt. Do not include the test ID, expectations, or any mention of testing.
   - Do not mention that this is a test or evaluation.
2. Collect the test-executor's complete response.
3. Store the response paired with its test case ID for grading.

**Critical anti-bias rules:**
- NEVER include expectations, test IDs, or test metadata in the prompt sent to the test-executor.
- NEVER mention "test", "evaluation", "expected", or "spec" in the prompt.
- Pass the prompt EXACTLY as written in the blockquote — do not modify, rephrase, or add context.

#### 4e: Grade Results

Once all test cases for this spec file have been executed:

1. Determine the results file path: `{spec-dir}/results/{timestamp}.{spec-name}.results.md`
   - `{spec-dir}` is the directory containing the spec file.
   - `{timestamp}` is the suite start timestamp from Step 1.
   - `{spec-name}` is the spec file name without the `.spec.md` extension.
2. Spawn a `grader` subagent using the Agent tool:
   - Set `subagent_type` to `grader`.
   - Pass the results file path, the spec file name, the suite timestamp, and for each test case: the ID, name, prompt, response, expectations, and negative expectations.
3. The grader writes the results file to disk.

#### 4f: Run Teardown (if configured)

If the spec frontmatter includes a `teardown` field, execute it using the same runtime resolution as setup scripts.

#### 4g: Clean Up Fixtures

If fixtures were copied in Step 4b:

1. Remove all files that were copied from the fixture folder.
2. Remove any empty directories left behind.
3. Verify cleanup by checking that none of the recorded fixture files remain.

If cleanup fails, warn the user but continue processing remaining spec files.

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

## Reference Material

For detailed documentation, consult these files as needed:

- **`references/spec-format.md`** — Complete spec file format reference with examples
- **`references/testing-guidelines.md`** — Best practices for writing test cases

## Setup Script

To scaffold a test directory in a new project:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/setup-tests.sh [skill-name]
```

## Configuration

The framework reads `.skill-unit.yml` from the repository root. See `templates/.skill-unit.yml` for all available options with documentation. A template can be copied with:

```bash
cp ${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/templates/.skill-unit.yml .skill-unit.yml
```
