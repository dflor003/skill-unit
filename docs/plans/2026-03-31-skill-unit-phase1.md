# Skill Unit Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that provides reproducible, anti-bias skill testing via a three-role agent architecture (evaluator, test-executor, grader) with sequential execution, fixture support, and checked-in results.

**Architecture:** SKILL.md acts as the main-thread evaluator/orchestrator. It discovers `*.spec.md` test files, dispatches locked-down test-executor subagents with only the prompt, then dispatches grader subagents that write timestamped results to disk. A PreToolUse hook enforces anti-bias by blocking test-executor access to spec files.

**Tech Stack:** Claude Code plugin system (markdown agents, skills, hooks), Bash scripts, YAML configuration.

**Spec:** `docs/specs/2026-03-31-skill-unit-design.md`

---

## File Structure

```
skill-unit/
├── .claude-plugin/
│   └── plugin.json                          # Plugin manifest
├── agents/
│   ├── test-executor.md                     # Subagent — runs prompts, locked down
│   └── grader.md                            # Subagent — grades responses, writes results
├── skills/
│   └── skill-unit/
│       ├── SKILL.md                         # Evaluator/orchestrator (largest file)
│       ├── references/
│       │   ├── spec-format.md               # Spec file format documentation
│       │   └── testing-guidelines.md        # Skill testing best practices
│       ├── templates/
│       │   ├── example.spec.md              # Starter template for new spec files
│       │   └── .skill-unit.yml              # Default configuration template
│       └── scripts/
│           └── setup-tests.sh               # Scaffolds test directory in a project
├── hooks/
│   ├── hooks.json                           # Hook configuration
│   └── scripts/
│       └── block-test-access.sh             # PreToolUse hook — blocks *.spec.md access
└── tests/
    └── skill-unit/
        ├── spec-parsing.spec.md             # Self-tests: activation, parsing, discovery
        └── results/                         # Results written here by grader
```

---

### Task 1: Plugin Scaffold

**Files:**
- Create: `.claude-plugin/plugin.json`

This is the foundation — the manifest that makes this a valid Claude Code plugin.

- [ ] **Step 1: Create plugin manifest**

```json
{
  "name": "skill-unit",
  "version": "0.1.0",
  "description": "Reproducible unit testing framework for AI agent skills",
  "author": {
    "name": "skill-unit contributors"
  },
  "license": "MIT",
  "keywords": ["testing", "skills", "evaluation", "ci-cd"]
}
```

- [ ] **Step 2: Verify directory structure**

Run: `ls -la .claude-plugin/`
Expected: `plugin.json` exists

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: add plugin manifest for skill-unit"
```

---

### Task 2: Anti-Bias Hook

**Files:**
- Create: `hooks/scripts/block-test-access.sh`
- Create: `hooks/hooks.json`

The PreToolUse hook is the hard enforcement layer that prevents the test-executor subagent from reading spec files or the test directory. This must be in place before we build the agents.

- [ ] **Step 1: Create the hook script**

Create `hooks/scripts/block-test-access.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Read hook input from stdin
input=$(cat)

# Extract the tool name and relevant file path
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# Determine the file path based on the tool being used
file_path=""
case "$tool_name" in
  Read|Write|Edit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  Glob)
    file_path=$(echo "$input" | jq -r '.tool_input.path // empty')
    ;;
  Grep)
    file_path=$(echo "$input" | jq -r '.tool_input.path // empty')
    ;;
  *)
    # Tool not relevant for file access blocking
    exit 0
    ;;
esac

# If no file path, allow (nothing to block)
if [ -z "$file_path" ]; then
  exit 0
fi

# Block access to spec files anywhere in the filesystem
if echo "$file_path" | grep -qiE '\.spec\.md$'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to test spec files is not permitted."}' >&2
  exit 2
fi

# Block access to results files
if echo "$file_path" | grep -qiE '\.results\.md$'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to test results files is not permitted."}' >&2
  exit 2
fi

# Block access to the tests directory
# Normalize path separators to forward slashes for consistent matching
normalized_path=$(echo "$file_path" | sed 's|\\|/|g')
if echo "$normalized_path" | grep -qiE '(^|/)tests(/|$)'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to the tests directory is not permitted."}' >&2
  exit 2
fi

# Allow everything else
exit 0
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x hooks/scripts/block-test-access.sh`

- [ ] **Step 3: Test the hook script locally**

Test that it blocks a spec file path:

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"tests/commit/commit-basics.spec.md"}}' | bash hooks/scripts/block-test-access.sh
echo "Exit code: $?"
```

Expected: Exit code `2`, stderr contains `permissionDecision":"deny"`

Test that it allows a normal file path:

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"src/index.ts"}}' | bash hooks/scripts/block-test-access.sh
echo "Exit code: $?"
```

Expected: Exit code `0`, no output

Test that it blocks the tests directory:

```bash
echo '{"tool_name":"Glob","tool_input":{"path":"tests/commit/"}}' | bash hooks/scripts/block-test-access.sh
echo "Exit code: $?"
```

Expected: Exit code `2`

Test with backslash paths (Windows):

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"tests\\commit\\basics.spec.md"}}' | bash hooks/scripts/block-test-access.sh
echo "Exit code: $?"
```

Expected: Exit code `2`

- [ ] **Step 4: Create hooks.json**

Create `hooks/hooks.json`:

```json
{
  "description": "Anti-bias hooks for skill-unit test execution. Blocks test-executor subagents from accessing test spec files and the tests directory.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read|Write|Edit|Glob|Grep",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/block-test-access.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add hooks/
git commit -m "feat: add anti-bias PreToolUse hook to block test file access"
```

---

### Task 3: Test-Executor Agent

**Files:**
- Create: `agents/test-executor.md`

The test-executor receives only a raw prompt and executes it as if it were a normal user request. It has restricted tools and the PreToolUse hook blocks access to test files.

- [ ] **Step 1: Create the test-executor agent**

Create `agents/test-executor.md`:

```markdown
---
name: test-executor
description: |
  Use this agent to execute a user prompt in a clean context for skill evaluation purposes. This agent should only be spawned by the skill-unit evaluator.

  <example>
  Context: The skill-unit evaluator needs to run a test prompt against a skill
  user: "The evaluator dispatches a prompt to test a skill's behavior"
  assistant: "I'll spawn the test-executor agent with the prompt to get an unbiased response"
  <commentary>
  The test-executor runs prompts without any knowledge of expected outcomes or that it is being evaluated.
  </commentary>
  </example>
model: inherit
color: cyan
tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Skill"]
---

You are a helpful AI assistant. The user has given you a task. Complete it to the best of your ability using the tools available to you.

Focus on:
- Understanding what the user is asking
- Using appropriate tools to accomplish the task
- Providing clear, helpful responses
- Following any project conventions you discover

Do your best work. Be thorough but concise.
```

**Key design decisions:**
- `tools` explicitly lists allowed tools — no `Agent` (cannot spawn sub-subagents)
- `Skill` is included so skills can activate naturally (this is what we're testing)
- The system prompt is deliberately generic — no mention of testing, evaluation, or expected behavior
- The PreToolUse hook from Task 2 provides the hard file-access enforcement

- [ ] **Step 2: Commit**

```bash
git add agents/test-executor.md
git commit -m "feat: add test-executor subagent with restricted tool access"
```

---

### Task 4: Grader Agent

**Files:**
- Create: `agents/grader.md`

The grader receives subagent responses + expectations for an entire spec file, evaluates each test case with binary pass/fail per expectation, and writes the results to a timestamped file on disk.

- [ ] **Step 1: Create the grader agent**

Create `agents/grader.md`:

```markdown
---
name: grader
description: |
  Use this agent to grade test-executor responses against expected outcomes and write results to disk. This agent should only be spawned by the skill-unit evaluator.

  <example>
  Context: The skill-unit evaluator has collected responses for all test cases in a spec file
  user: "The evaluator sends responses and expectations to the grader for evaluation"
  assistant: "I'll spawn the grader agent to evaluate each response and write the results file"
  <commentary>
  The grader evaluates responses against expectations and writes structured results to a file.
  </commentary>
  </example>
model: inherit
color: yellow
tools: ["Read", "Write", "Bash"]
---

You are a strict, objective test grader. You receive a set of test case results to evaluate and a file path to write the results to.

**Your input will contain:**
1. A results file path where you must write your evaluation
2. The spec file name being graded
3. A list of test cases, each containing:
   - Test ID and name
   - The prompt that was given to the test-executor
   - The test-executor's raw response
   - A list of expected outcomes (Expectations)
   - A list of things that should NOT have happened (Negative Expectations)

**Grading Process:**

For each test case:
1. Read the test-executor's response carefully.
2. For each Expectation, determine if the response satisfies it. An expectation is MET if the response clearly demonstrates the described behavior or outcome. An expectation is NOT MET if the response does not demonstrate it or contradicts it.
3. For each Negative Expectation, determine if the response violates it. A negative expectation PASSES if the described behavior did NOT occur. It FAILS if the response demonstrates the prohibited behavior.
4. A test case PASSES only if ALL expectations are met AND ALL negative expectations pass.

**Grading Standards:**
- Be strict and literal. Do not give credit for partial matches unless the expectation explicitly allows it.
- Base your evaluation only on what is observable in the response. Do not infer or assume behavior that is not evident.
- When an expectation is not met, provide a brief, specific reason explaining what was expected vs. what actually happened.

**Results File Format:**

Write the results file in this exact markdown format:

```
# Results: {spec file name}

**Timestamp:** {timestamp provided by evaluator}
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

## {Next test case...}
```

**Rules:**
- Write the results file using the Write tool to the exact path provided.
- Include ALL test cases in the results, not just failures.
- Use ✓ for passing checks and ✗ for failing checks.
- Failure reasons must be specific and reference what the response actually contained.
- Do not modify, summarize, or editorialize on the test-executor's response beyond grading it.
- Do not skip any expectations or negative expectations.
```

- [ ] **Step 2: Commit**

```bash
git add agents/grader.md
git commit -m "feat: add grader subagent for evaluating responses and writing results"
```

---

### Task 5: Reference Documents

**Files:**
- Create: `skills/skill-unit/references/spec-format.md`
- Create: `skills/skill-unit/references/testing-guidelines.md`

These reference files are loaded by SKILL.md on demand (progressive disclosure). They document the spec format and testing best practices.

- [ ] **Step 1: Create spec-format.md**

Create `skills/skill-unit/references/spec-format.md`:

```markdown
# Spec File Format Reference

## Overview

Each `*.spec.md` file contains multiple test cases for a skill or skill mode. YAML frontmatter holds shared configuration; repeated `###` sections define individual test cases.

## Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name for this test suite |
| `skill` | No | Skill being tested (informational, not used for routing) |
| `tags` | No | Array of tags for filtering test runs |
| `timeout` | No | Per-test timeout (e.g., `60s`, `120s`), overrides global default |
| `fixtures` | No | Relative path to fixture folder, copied into working directory before tests |
| `setup` | No | Script filename to run before tests (e.g., `setup.sh`, `setup.js`) |
| `teardown` | No | Script filename to run after tests |

## Test Case Structure

Each test case is a `###` headed section with this structure:

### Heading Format

```
### {ID}: {descriptive-name}
```

- **ID**: Unique identifier within the spec file (e.g., `COM-1`, `BRN-3`). Used in results output.
- **Name**: Human-readable description in kebab-case or natural language.

### Required Sections

**Prompt** (required): The exact text passed to the test-executor subagent. Must be in a blockquote.

```markdown
**Prompt:**
> The user's request goes here. This is passed verbatim.
> Multi-line prompts are supported.
```

**Expectations** (required): Bulleted list of positive assertions. Each bullet is graded independently as pass/fail.

```markdown
**Expectations:**
- Observable outcome 1
- Observable outcome 2
- Observable outcome 3
```

**Negative Expectations** (optional): Bulleted list of things that should NOT happen.

```markdown
**Negative Expectations:**
- Thing that should not have happened
- Another prohibited behavior
```

### Separators

Horizontal rules (`---`) between test cases are optional and cosmetic. Test cases are delimited by `###` headings.

## Parsing Rules

1. Test cases are delimited by `###` headings.
2. ID is everything before the first colon in the heading; name is everything after, trimmed.
3. Prompt is the content of the blockquote under `**Prompt:**`.
4. Expectations and Negative Expectations are parsed as bullet lists (lines starting with `- `).
5. File extension is always `*.spec.md` — not configurable.

## Complete Example

```markdown
---
name: commit-skill-tests
skill: commit
tags: [slash-command, git]
timeout: 60s
fixtures: ./fixtures/basic-repo
setup: setup.sh
teardown: teardown.sh
---

### COM-1: basic-commit

**Prompt:**
> Create a commit for the staged changes

**Expectations:**
- Ran `git commit`
- Commit message references the nature of the changes
- No files left in dirty state after the commit

**Negative Expectations:**
- Did not run `git push`
- Did not amend an existing commit

---

### COM-2: nothing-to-commit

**Prompt:**
> Commit my changes

**Expectations:**
- Agent detected there was nothing to commit
- Informed the user clearly

**Negative Expectations:**
- Did not create an empty commit
```

## Writing Good Expectations

- Describe observable outcomes, not implementation details.
- Each expectation should be independently verifiable.
- Prefer "commit message references the nature of changes" over "used `git commit -m`."
- Do not combine multiple checks into one bullet.

## Writing Good Prompts

- Write from the human perspective — vague, incomplete, natural language.
- Do NOT include skill names, tool names, or implementation hints.
- Do NOT lead the subagent toward the expected answer.
- Simulate what a real user would actually type.
```

- [ ] **Step 2: Create testing-guidelines.md**

Create `skills/skill-unit/references/testing-guidelines.md`:

```markdown
# Skill Testing Guidelines

Best practices for writing comprehensive, realistic test cases for AI agent skills. These guidelines inform both manual test writing and AI-assisted test case generation.

## Activation Testing

- Skills with auto-activation MUST have at least one test verifying the skill activates on a realistic prompt.
- MUST include at least one negative test — a prompt adjacent to the skill's domain that should NOT trigger activation.
- Test activation with varied phrasing. Users don't use consistent language.

## Prompt Realism

- Prompts must be written from the human perspective — vague, incomplete, natural language.
- MUST NOT include skill names, tool names, or implementation hints a real user would not say.
- MUST NOT lead the subagent toward the expected answer.
- Include typos, casual phrasing, and ambiguity where realistic.
- Vary prompt length — some users write one-liners, others write paragraphs.

## Slash Command Coverage

For skills invokable via slash command:
- Test the bare command with no arguments.
- Test with typical arguments.
- Test with edge-case inputs (empty string, very long input, special characters).
- Test with arguments in unexpected order or format.

## Behavioral Coverage

- Test both happy paths and failure modes (missing files, bad input, conflicting state).
- Test boundary conditions — what happens at the edges of the skill's scope?
- Include at least one "graceful decline" test — a request adjacent to but outside the skill's purpose.
- Test with minimal context (empty repo, no config files) and rich context (large codebase, existing config).

## Expectation Quality

- Expectations describe observable outcomes, not implementation details.
- Each expectation is independently verifiable — do not combine multiple checks into one bullet.
- Prefer behavioral descriptions over tool-call assertions.
- Negative expectations should cover dangerous or destructive actions the skill must avoid.

## Idempotency

- Running the same prompt twice should produce consistent results.
- If a skill modifies state, test that running it again doesn't cause errors or duplication.

## Interaction Style

- Test that the skill maintains the right tone and format.
- Skills that should ask clarifying questions: verify they do.
- Skills that should be concise: verify they don't over-explain.
- Skills with specific output formats: verify format compliance.

## Context Sensitivity

- Test that the skill adapts to different project states.
- Empty repo vs. large codebase.
- Different languages or frameworks.
- Missing dependencies or configuration.

## Test Suite Organization

- Group test cases by skill or skill mode in a single `*.spec.md` file.
- Use consistent ID prefixes within a spec file (e.g., `COM-` for commit, `BRN-` for brainstorming).
- Place spec files in `tests/{skill-name}/` directories.
- Use fixtures for filesystem state; use setup scripts for dynamic state.

## Minimum Coverage Requirements

For any skill, the test suite should include at minimum:
1. At least one happy-path test per core feature.
2. At least one failure-mode test.
3. At least one activation test (if auto-activated).
4. At least one negative activation test (if auto-activated).
5. At least one graceful-decline test for out-of-scope requests.
```

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/references/
git commit -m "feat: add spec format and testing guidelines reference docs"
```

---

### Task 6: Templates

**Files:**
- Create: `skills/skill-unit/templates/example.spec.md`
- Create: `skills/skill-unit/templates/.skill-unit.yml`

Templates that users copy into their projects as starting points.

- [ ] **Step 1: Create the example spec template**

Create `skills/skill-unit/templates/example.spec.md`:

```markdown
---
name: my-skill-tests
skill: my-skill
tags: [happy-path]
# timeout: 60s
# fixtures: ./fixtures/my-fixture
# setup: setup.sh
# teardown: teardown.sh
---

### TEST-1: basic-usage

**Prompt:**
> Describe what a typical user would say to invoke this skill.

**Expectations:**
- Describe what the skill should do in response
- Each bullet is graded independently as pass or fail

**Negative Expectations:**
- Describe something the skill should NOT do

---

### TEST-2: activation-test

**Prompt:**
> A realistic, vague prompt that should trigger the skill naturally.

**Expectations:**
- The skill activated and handled the request
- The response addresses the user's intent

---

### TEST-3: negative-activation-test

**Prompt:**
> A prompt that is adjacent to the skill's domain but should NOT trigger it.

**Expectations:**
- The skill did not activate
- The response was handled by general-purpose behavior

**Negative Expectations:**
- The skill did not activate for this unrelated request
```

- [ ] **Step 2: Create the default config template**

Create `skills/skill-unit/templates/.skill-unit.yml`:

```yaml
# .skill-unit.yml — Skill Unit configuration
# Place this file at your repository root.
# All fields are optional — sensible defaults are built in.

# Where test spec files live (relative to repo root)
test-dir: tests

# Output settings
output:
  # "interactive" for human-readable, "json" for CI/CD
  format: interactive
  # Show full details for passing tests (default: collapsed to one line)
  show-passing-details: false

# Execution settings
execution:
  # Default timeout per test case (can be overridden in spec frontmatter)
  timeout: 60s

# Setup/teardown defaults
# These are the default script names the framework looks for
# when a spec file doesn't specify its own setup/teardown
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/templates/
git commit -m "feat: add spec file and config templates for new projects"
```

---

### Task 7: Setup Script

**Files:**
- Create: `skills/skill-unit/scripts/setup-tests.sh`

A helper script that scaffolds the test directory structure in a user's project.

- [ ] **Step 1: Create the setup script**

Create `skills/skill-unit/scripts/setup-tests.sh`:

```bash
#!/bin/bash
set -euo pipefail

# Scaffolds a test directory structure for skill-unit in the current project.
# Usage: bash setup-tests.sh [skill-name]
#
# If skill-name is provided, creates a test directory for that skill.
# Otherwise, creates the base test directory structure.

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TEST_DIR="tests"
SKILL_NAME="${1:-}"

# Read test-dir from .skill-unit.yml if it exists
if [ -f ".skill-unit.yml" ]; then
  custom_dir=$(grep -E '^test-dir:' .skill-unit.yml | sed 's/test-dir:\s*//' | tr -d '[:space:]' || true)
  if [ -n "$custom_dir" ]; then
    TEST_DIR="$custom_dir"
  fi
fi

# Create base test directory
mkdir -p "$TEST_DIR"

# If a skill name was provided, scaffold that skill's test directory
if [ -n "$SKILL_NAME" ]; then
  SKILL_TEST_DIR="$TEST_DIR/$SKILL_NAME"
  mkdir -p "$SKILL_TEST_DIR/results"
  mkdir -p "$SKILL_TEST_DIR/fixtures"

  # Copy example spec if none exists
  if [ ! -f "$SKILL_TEST_DIR/$SKILL_NAME.spec.md" ]; then
    cp "$PLUGIN_ROOT/templates/example.spec.md" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    # Replace placeholder name with actual skill name
    sed -i "s/my-skill-tests/$SKILL_NAME-tests/" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    sed -i "s/skill: my-skill/skill: $SKILL_NAME/" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    echo "Created $SKILL_TEST_DIR/$SKILL_NAME.spec.md"
  else
    echo "Spec file already exists: $SKILL_TEST_DIR/$SKILL_NAME.spec.md"
  fi
else
  echo "Created $TEST_DIR/"
  echo ""
  echo "To scaffold tests for a specific skill:"
  echo "  bash $0 <skill-name>"
fi

# Copy default config if none exists at repo root
if [ ! -f ".skill-unit.yml" ]; then
  cp "$PLUGIN_ROOT/templates/.skill-unit.yml" ".skill-unit.yml"
  echo "Created .skill-unit.yml"
fi

echo "Done."
```

- [ ] **Step 2: Make executable**

Run: `chmod +x skills/skill-unit/scripts/setup-tests.sh`

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/scripts/
git commit -m "feat: add test directory scaffolding script"
```

---

### Task 8: SKILL.md — The Evaluator

**Files:**
- Create: `skills/skill-unit/SKILL.md`

This is the core of the plugin — the evaluator/orchestrator that runs as the main thread. It handles test discovery, spec parsing, fixture management, subagent dispatch, and results presentation.

- [ ] **Step 1: Create SKILL.md**

Create `skills/skill-unit/SKILL.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skills/skill-unit/SKILL.md
git commit -m "feat: add SKILL.md evaluator/orchestrator — core of the plugin"
```

---

### Task 9: Self-Test Spec Files

**Files:**
- Create: `tests/skill-unit/spec-parsing.spec.md`
- Create: `tests/skill-unit/results/` (directory)

Skill Unit tests itself. These spec files exercise the plugin's own test discovery and execution flow.

- [ ] **Step 1: Create the spec-parsing self-test**

Create `tests/skill-unit/spec-parsing.spec.md`:

```markdown
---
name: skill-unit-spec-parsing
skill: skill-unit
tags: [self-test, parsing]
---

### SU-1: activation-via-slash-command

**Prompt:**
> /skill-unit

**Expectations:**
- The skill-unit skill activated
- The agent attempted to discover and run test spec files
- The agent presented results or indicated no tests were found

---

### SU-2: activation-via-natural-language

**Prompt:**
> Can you test my skills for me?

**Expectations:**
- The skill-unit skill activated
- The agent attempted to discover test spec files

**Negative Expectations:**
- The agent did not ask what programming language to use
- The agent did not try to write unit tests in a programming language

---

### SU-3: negative-activation

**Prompt:**
> Write a unit test for my login function in Jest

**Expectations:**
- The agent treated this as a standard coding request
- The agent attempted to write JavaScript/TypeScript tests

**Negative Expectations:**
- The skill-unit skill did not activate
- The agent did not look for spec.md files

---

### SU-4: handles-no-tests-found

**Prompt:**
> Run the skill tests in the empty-project directory

**Expectations:**
- The agent reported that no test spec files were found
- The agent suggested how to create test spec files or run the setup script

**Negative Expectations:**
- The agent did not crash or error out
- The agent did not fabricate test results
```

- [ ] **Step 2: Create the results directory**

Run: `mkdir -p tests/skill-unit/results`

Create a `.gitkeep` file to ensure the directory is tracked:

Run: `touch tests/skill-unit/results/.gitkeep`

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "feat: add self-test spec files for skill-unit"
```

---

### Task 10: Fixture Placement Experiments

**Files:**
- Create: `docs/experiments/fixture-placement.md`

Document the three fixture placement approaches (C, B, D) with specific test procedures so they can be evaluated during manual testing.

- [ ] **Step 1: Create experiment plan**

Create `docs/experiments/fixture-placement.md`:

```markdown
# Fixture Placement Experiment Plan

## Background

Test fixtures need to be placed somewhere the test-executor subagent can operate on them naturally, without revealing it's being tested. Three approaches to evaluate.

## Approach C: Copy to Repo Root (Phase 1 Default)

**How it works:**
1. Evaluator records current working directory state (list of files or `git status`).
2. Copies fixture folder contents to repo root.
3. Runs test-executor.
4. Removes all fixture files, restoring original state.

**Test procedure:**
1. Create a fixture folder with 3-5 files (e.g., `package.json`, `src/index.ts`, `README.md`).
2. Run a spec file that uses this fixture.
3. Verify: test-executor can read/write fixture files normally.
4. Verify: after test run, all fixture files are removed.
5. Verify: if test is interrupted (Ctrl+C), are fixture files left behind?
6. Verify: if fixture file conflicts with an existing repo file, what happens?

**Metrics:** Cleanup reliability, conflict handling, subagent behavior naturalness.

## Approach B: Git Worktree

**How it works:**
1. Evaluator creates a git worktree.
2. Copies fixtures into the worktree.
3. Spawns test-executor with `isolation: "worktree"`.
4. Worktree is cleaned up after the test.

**Test procedure:**
1. Same fixture folder as Approach C.
2. Run a spec file using worktree isolation.
3. Verify: test-executor operates in the worktree naturally.
4. Verify: no files left in main working directory.
5. Verify: worktree and temporary branch are cleaned up.
6. Measure: time overhead of worktree creation/cleanup vs. Approach C.

**Metrics:** Isolation quality, performance overhead, branch cleanup reliability.

## Approach D: Neutral Workspace Directory

**How it works:**
1. Evaluator creates `.workspace/` at repo root (`.gitignore`'d).
2. Copies fixtures into `.workspace/`.
3. Tells test-executor to operate in `.workspace/` as project root.
4. Cleans up `.workspace/` after the test.

**Test procedure:**
1. Same fixture folder as Approach C.
2. Run a spec file with workspace directory.
3. Verify: test-executor operates in `.workspace/` without confusion.
4. Verify: test-executor doesn't try to navigate to the actual repo root.
5. Verify: cleanup removes `.workspace/` contents.
6. Verify: `.workspace/` path doesn't leak "testing" context.

**Metrics:** Subagent behavior naturalness, path confusion incidents, cleanup reliability.

## Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Subagent realism | High | Does the subagent behave as it would in a real session? |
| Cleanup reliability | High | Are all fixture files removed consistently? |
| Performance | Medium | How much overhead does the approach add? |
| Conflict safety | Medium | What happens if fixtures overlap with real files? |
| Simplicity | Low | How complex is the implementation? |
```

- [ ] **Step 2: Commit**

```bash
git add docs/experiments/
git commit -m "docs: add fixture placement experiment plan for approaches B, C, D"
```

---

### Task 11: End-to-End Validation

This is manual testing to verify the plugin works as a whole.

- [ ] **Step 1: Install the plugin locally**

Run Claude Code with the plugin directory:

```bash
claude --plugin-dir /c/Projects/skill-unit
```

- [ ] **Step 2: Test slash command activation**

In the Claude Code session, type:

```
/skill-unit
```

Expected: The skill activates, discovers `tests/skill-unit/spec-parsing.spec.md`, and attempts to run the test cases.

- [ ] **Step 3: Test natural language activation**

In a new Claude Code session with the plugin loaded, type:

```
Can you run the skill tests?
```

Expected: The skill-unit skill activates.

- [ ] **Step 4: Verify anti-bias hook**

While a test-executor subagent is running, check that it cannot read spec files. The hook should block any attempt to access `*.spec.md` files or the `tests/` directory.

- [ ] **Step 5: Verify grader writes results**

After a test run completes, check that:

```bash
ls tests/skill-unit/results/
```

Expected: A timestamped results file exists (e.g., `2026-03-31-15-00-00.spec-parsing.results.md`).

- [ ] **Step 6: Verify results format**

Read the results file and verify it matches the expected format:
- Has a header with spec file name and timestamp.
- Each test case has a PASS/FAIL verdict.
- Expectations are listed with ✓/✗ markers.
- Failure reasons are specific.

- [ ] **Step 7: Verify summary output**

The evaluator should present an interactive summary after all tests complete, showing the folder tree structure, per-file pass/fail counts, and expanded failure details.

- [ ] **Step 8: Run self-tests with skill-unit**

The ultimate validation — use skill-unit to test itself:

```
/skill-unit tests/skill-unit
```

Expected: Skill-unit runs its own spec files and reports results.

- [ ] **Step 9: Document any issues found**

Create issues or notes for anything that doesn't work as expected. These inform Phase 2 priorities.

- [ ] **Step 10: Commit any fixes from validation**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end validation"
```

---

## Phase 2 Preview (Not Implemented Here)

The following items are deferred to Phase 2 and later. They are documented here for context:

- **Parallel test execution** — dispatch multiple test-executors concurrently within a spec file
- **Persistent grader consumer pattern** — spawn grader once, stream results via SendMessage as executors complete
- **JSON output format** — machine-readable output for CI/CD pipelines
- **Tag-based filtering** — `/skill-unit --tag happy-path` to run a subset of tests
- **Rubric-style scoring** — graduated pass/fail instead of binary (future grading model)
- **Worktree isolation** — for artifact-producing tests (Phase 3)
- **AI-assisted test generation** — generate spec files from skill descriptions (Phase 4)
- **Skill coverage analysis** — identify gaps in test suites (Phase 4)
