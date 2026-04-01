# Skill Unit — Skill Unit Testing Framework Design Spec

## Overview

Skill Unit is a Claude Code plugin that provides a structured, reproducible testing framework for AI agent skills. It follows the conventions of traditional unit testing frameworks (Jest, JUnit, NUnit) — well-defined test files, a test runner, structured pass/fail results — applied to the problem of evaluating skill behavior.

The framework uses a three-role agent architecture to ensure unbiased evaluation: an evaluator orchestrates test discovery and reporting, a test-executor runs prompts without knowledge of expected outcomes, and a grader assesses results and writes them to disk.

## Goals

- **Reproducibility:** Testing is as easy as installing a unit testing framework. Well-defined folders, well-defined file format, familiar mental model for anyone who has written a unit test.
- **Quick Feedback:** Fast feedback loop during skill development. CI/CD support out of the box via `claude --task` with the plugin loaded.
- **Prompt as Source of Truth:** Test cases are prompts with expected outcomes. The prompt is what gets tested — no mocking, no simulation.
- **Anti-Bias Evaluation:** The agent executing the prompt has no access to expected outcomes or any indication it is being tested. Evaluation accuracy reflects real-world skill performance.
- **Checked-In Results:** Timestamped results files are committed to the repo, enabling regression tracking and cross-run comparison via git history and PR diffs.

## Architecture

### Three-Role Agent Model

```
User invokes /skill-unit or asks to test a skill
        │
        ▼
┌─────────────────────────────────────┐
│  SKILL.md (main-thread evaluator)   │
│  - Discovers *.spec.md files        │
│  - Parses frontmatter + test cases  │
│  - Runs setup scripts/fixtures      │
│  - Dispatches test-executor agents  │
│  - Dispatches grader agents         │
│  - Reads result files               │
│  - Formats & presents summary       │
│  - Runs teardown scripts            │
└──────┬──────────────┬───────────────┘
       │              │
       ▼              ▼
┌──────────────┐  ┌──────────────┐
│ TEST-EXECUTOR│  │    GRADER    │
│ (subagent)   │  │  (subagent)  │
│              │  │              │
│ Receives:    │  │ Receives:    │
│ - Prompt     │  │ - Subagent   │
│   only       │  │   response   │
│              │  │ - Expected   │
│ Cannot:      │  │   outcomes   │
│ - Read       │  │ - Negative   │
│   *.spec.md  │  │   outcomes   │
│ - Access     │  │ - Results    │
│   test dir   │  │   file path  │
│              │  │              │
│ Returns:     │  │ Writes:      │
│ - Raw        │  │ - Results    │
│   response   │  │   to disk    │
└──────────────┘  └──────────────┘
```

### Execution Flow (Phase 1 — Sequential)

1. Skill activates via `/skill-unit` or natural language ("test my skill", "run skill tests").
2. Evaluator captures suite start timestamp.
3. Evaluator reads `.skill-unit.yml` (if present) for configuration.
4. Evaluator discovers all `*.spec.md` files under the configured test directory.
5. For each spec file (sequential):
   a. Parse YAML frontmatter and test case sections.
   b. Copy fixture folder (if configured) into the working directory.
   c. Run setup script (if configured).
   d. For each test case (sequential):
      - Spawn test-executor subagent with only the prompt.
      - Collect raw response.
   e. Once all test cases for this spec file have been executed, spawn grader subagent with the collected responses + expectations for the entire spec file.
      - Grader evaluates each test case: binary pass/fail per expectation.
      - Grader writes timestamped results file to `results/` subfolder.
   f. Run teardown script (if configured).
6. Evaluator reads all results files for this run and presents the summary.

### Why Three Roles?

- **Test-executor isolation:** Never sees expectations, never knows it is being tested. This is the anti-bias guarantee.
- **Grader writes to disk:** Offloads result accumulation from the evaluator's context. The evaluator stays lean — it hands off responses and reads final result files.
- **Evaluator orchestrates:** Owns the overall flow, fixture management, and summary presentation. Does not hold all test responses in context simultaneously.

## Anti-Bias Layer

Four layers of protection ensure the test-executor cannot access test metadata:

### Layer 1: Prompt Isolation

The evaluator passes only the raw prompt text to the test-executor. No test ID, no expectations, no mention of "testing" or "evaluation." The subagent believes it is handling a normal user request.

### Layer 2: Tool Restrictions

`test-executor.md` frontmatter restricts available tools. No Agent tool (cannot spawn sub-subagents).

### Layer 3: PreToolUse Hook

`block-test-access.sh` intercepts Read, Glob, and Grep calls targeting `*.spec.md` files or the configured test directory. Returns exit code 2 to block the operation.

### Layer 4: Convention

The test directory (`tests/`) lives at repo root, separate from skill source. Combined with the hook, the subagent cannot access test data even if it tries.

## Plugin Structure

```
skill-unit/
├── .claude-plugin/
│   └── plugin.json
├── agents/
│   ├── test-executor.md
│   └── grader.md
├── skills/
│   └── skill-unit/
│       ├── SKILL.md              # Evaluator/orchestrator
│       ├── references/
│       │   ├── spec-format.md
│       │   └── testing-guidelines.md
│       ├── templates/
│       │   ├── example.spec.md
│       │   └── .skill-unit.yml
│       └── scripts/
│           └── setup-tests.sh
└── hooks/
    ├── hooks.json
    └── scripts/
        └── block-test-access.sh
```

## Spec File Format

Each `*.spec.md` file contains multiple test cases for a skill or skill mode. YAML frontmatter holds shared configuration; repeated `###` sections define individual test cases.

### Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name for this test suite |
| `skill` | No | Skill being tested (informational) |
| `tags` | No | For filtering test runs |
| `timeout` | No | Per-test timeout, overrides global default |
| `fixtures` | No | Path to fixture folder, copied before tests run |
| `setup` | No | Script to run before tests |
| `teardown` | No | Script to run after tests |

### Test Case Structure

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

### Parsing Rules

- Test cases are delimited by `###` headings.
- ID is everything before the colon in the heading; name is everything after.
- Prompt is the content of the blockquote under `**Prompt:**`.
- Expectations and Negative Expectations are parsed as bullet lists.
- `---` horizontal rules between test cases are optional (cosmetic).
- File extension is always `*.spec.md` — not configurable.

## Filesystem State Management

Test cases can declare required filesystem state via two mechanisms:

### Fixture Folders

A companion folder (referenced in frontmatter as `fixtures: ./fixtures/basic-repo`) containing the exact file tree to copy into the working directory before tests run. Declarative, version-controlled, easy to review.

#### Fixture Placement Strategy

The subagent must operate in an environment that looks like a real project — it cannot work inside the test directory (the PreToolUse hook blocks access, and a `tests/` path would reveal it's being tested). Three approaches to explore:

**Approach C (Phase 1 default): Copy to repo root.** Fixtures are copied directly into the repo's working directory. This is the most realistic — it matches where a real user's skill would operate. The evaluator tracks which files were added (via `git status` or explicit file list) and removes them during cleanup, regardless of whether the teardown script succeeds. Risk: a failed or interrupted cleanup leaves fixture files in the repo.

**Approach B (Experiment): Git worktree.** The evaluator creates a worktree for the test run and copies fixtures into it. The Agent tool's `isolation: "worktree"` parameter runs the subagent there. The subagent sees a clean repo checkout with fixtures in place. Cleanest isolation, but adds worktree creation overhead and requires cleanup of temporary branches.

**Approach D (Experiment): Neutral workspace directory.** A `.gitignore`'d directory at repo root (e.g., `.workspace/`) receives the fixtures. The evaluator instructs the subagent to treat it as the project root. Generic enough to not leak "testing," but the subagent's working directory differs from a real user scenario.

Phase 1 implements Approach C. The implementation plan includes experiments with B and D to compare cleanup reliability, subagent behavior realism, and performance overhead.

### Setup/Teardown Scripts

Polyglot script support — the framework looks for the script name specified in frontmatter and executes it with the appropriate runtime:

- `.sh` — Bash
- `.js` — Node.js
- `.ts` — Node.js (via ts-node or tsx)
- `.py` — Python

Scripts run before (setup) and after (teardown) all test cases in a spec file. A global setup/teardown can also be placed in a `.setup/` folder at the test directory root.

## Results Output

### Results File Location

Results are written alongside test cases in a `results/` subfolder, with the suite start timestamp prefixed:

```
tests/
  commit/
    commit-basics.spec.md
    commit-amend.spec.md
    results/
      2026-03-31-14-30-05.commit-basics.results.md
      2026-03-31-14-30-05.commit-amend.results.md
      2026-03-28-09-15-22.commit-basics.results.md
      2026-03-28-09-15-22.commit-amend.results.md
```

All results from the same run share a timestamp. Results are checked into the repo for regression tracking.

### Interactive Format (Default)

```
## Test Run: 2026-03-31 14:30
⏱ 92s | 48 passed | 3 failed

📁 tests/commit/
  📄 commit-basics.spec.md (5 passed, 1 failed)
    ✅ COM-1: basic-commit (3/3, 2/2)
    ✅ COM-2: vague-commit-request (3/3, 1/1)
    ❌ COM-3: nothing-to-commit
       ✗ Agent detected there was nothing to commit
         → Agent attempted to run git commit and got an error
       ✓ Did not create an empty commit
       ✓ Did not fabricate changes
    ✅ COM-4: multifile-commit (4/4, 1/1)
    ✅ COM-5: merge-conflict-staged (2/2, 2/2)

📁 tests/brainstorming/
  📄 brainstorming-activation.spec.md (2 passed, 2 failed)
    ✅ BRN-1: triggers-on-feature-request (2/2, 0/0)
    ❌ BRN-2: triggers-on-build-me (2/2, 1/1)
       ✗ Asked clarifying question before proposing approaches
         → Agent jumped straight to implementation
```

Passing tests are collapsed to one line. Failing tests expand to show which expectations missed and why.

### Grading Model

Phase 1 uses binary pass/fail per expectation. A test case passes only if ALL expectations pass and ALL negative expectations pass. Future phases will support rubric-style graduated scoring.

## Configuration (`.skill-unit.yml`)

Placed at repo root. All fields optional — sensible defaults built in.

```yaml
# .skill-unit.yml

# Where test spec files live
test-dir: tests

# Output settings
output:
  format: interactive  # or "json"
  show-passing-details: false

# Execution settings
execution:
  timeout: 60s

# Setup/teardown defaults
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

### Resolution Order

1. Spec file frontmatter (highest priority)
2. `.skill-unit.yml` at repo root
3. Built-in defaults from the plugin

## Skill Testing Guidelines

Baked into the plugin at `references/testing-guidelines.md`. Used by AI-assisted test generation and as documentation for manual test writing.

### Activation Testing

- Skills with auto-activation MUST have at least one test verifying the skill activates on a realistic prompt.
- MUST include at least one negative test — a prompt adjacent to the skill's domain that should NOT trigger activation.

### Prompt Realism

- Prompts must be written from the human perspective — vague, incomplete, natural language.
- MUST NOT include skill names, tool names, or implementation hints a real user would not say.
- MUST NOT lead the subagent toward the expected answer.

### Slash Command Coverage

- Skills invokable via slash command MUST have test cases for the bare command, with arguments, and with edge-case inputs.

### Behavioral Coverage

- Test both happy paths and failure modes (missing files, bad input, conflicting state).
- Test boundary conditions — what happens at the edges of the skill's scope?
- Include at least one "does the skill gracefully decline?" test for requests adjacent to but outside the skill's purpose.

### Expectation Quality

- Expectations describe observable outcomes, not implementation details.
- Prefer "commit message references the nature of changes" over "used `git commit -m`."
- Each expectation is independently verifiable — do not combine multiple checks into one bullet.

### Idempotency

- Running the same prompt twice should produce consistent results.

### Interaction Style

- Test that the skill maintains the right tone and format (e.g., a skill that should ask clarifying questions actually does).

### Context Sensitivity

- Test that the skill adapts to different project states (empty repo vs. large codebase, different languages, etc.).

## Self-Testing

Skill Unit tests itself. The repo includes `tests/skill-unit/` containing spec files that exercise the plugin's own functionality. Each phase adds tests for its new features before the phase is considered complete.

## Phasing

### Phase 1 — MVP

- Plugin structure: SKILL.md (evaluator), test-executor agent, grader agent
- Spec file format (`*.spec.md`) with repeated section headings
- Sequential execution: one spec file at a time, one test case at a time
- Grader writes timestamped results files to disk (checked in)
- Binary pass/fail grading per expectation
- Fixture folder support (copy verbatim)
- Polyglot setup/teardown scripts
- PreToolUse hook for anti-bias enforcement
- `.skill-unit.yml` configuration
- Interactive results output
- `/skill-unit` slash command + natural-language activation
- Skill testing guidelines in `references/`
- Self-test suite for skill-unit itself

### Phase 2 — Performance & Parallelism

- Parallel test execution within a spec file
- Persistent grader consumer pattern (SendMessage-based streaming of results as executors complete)
- JSON output format for CI/CD
- Tag-based test filtering (`/skill-unit --tag happy-path`)

### Phase 3 — Worktrees & Artifacts

- Worktree isolation for artifact-producing tests
- Worktree cleanup to prevent branch bloat
- Artifact validation expectations in spec files
- Expected file/artifact assertions

### Phase 4 — AI-Assisted

- AI-assisted test case generation from skill descriptions
- Skill coverage analysis — identify gaps in test suites
- Suggested prompts for untested activation patterns

### Future Considerations

- Rubric-style graduated scoring
- JUnit XML output for GitHub Actions test annotations
- Results diffing between runs
- PR comments showing regressions (Braintrust-style)

## Landscape Context

No existing framework combines Claude Code skill-aware test execution, anti-bias evaluator/executor separation, artifact validation, a traditional CLI-style test runner with structured output, and CI/CD integration. The closest existing tools:

- **Anthropic Skill Creator** — eval mode with JSON test cases and blind A/B, but no standalone CLI or CI/CD support
- **Promptfoo** — YAML config + CLI with JUnit output and GitHub Actions, but single-turn focused with no agent trajectory or artifact validation
- **DeepEval** — pytest-style unit testing for LLMs, but Python-only with no Claude Code skill awareness
- **Evalite / vitest-evals** — TypeScript-native eval runners, but scoring-focused rather than pass/fail with no agent support
- **Google ADK Eval** — tool trajectory matching and user simulation, but tied to Google's ecosystem

Skill Unit fills the gap as a plugin-native testing framework purpose-built for the skill format that has become the industry standard across Claude Code, Copilot, and Codex.
