# Skill Unit — Skill Unit Testing Framework Design Spec

## Overview

Skill Unit is a plugin that provides a structured, reproducible testing framework for AI agent skills. It follows the conventions of traditional unit testing frameworks (Jest, JUnit, NUnit) — well-defined test files, a test runner, structured pass/fail results — applied to the problem of evaluating skill behavior.

The framework is **harness-agnostic** — it works with any AI agent harness that supports the skill/plugin format (Claude Code, Copilot, Codex, etc.). Test execution is performed via a configurable CLI runner, allowing the same test suite to run against any harness.

The architecture uses two roles: an evaluator skill that orchestrates test discovery, execution dispatch, inline grading, and reporting; and an isolated CLI session per test prompt that ensures anti-bias execution.

## Goals

- **Reproducibility:** Testing is as easy as installing a unit testing framework. Well-defined folders, well-defined file format, familiar mental model for anyone who has written a unit test.
- **Quick Feedback:** Fast feedback loop during skill development. CI/CD support out of the box via any harness's CLI task runner.
- **Prompt as Source of Truth:** Test cases are prompts with expected outcomes. The prompt is what gets tested — no mocking, no simulation.
- **Anti-Bias Evaluation:** The agent executing the prompt has no access to expected outcomes or any indication it is being tested. Evaluation accuracy reflects real-world skill performance.
- **Checked-In Results:** Timestamped results files are committed to the repo, enabling regression tracking and cross-run comparison via git history and PR diffs.
- **Harness-Agnostic:** The framework MUST work across multiple agentic harnesses — Claude Code, GitHub Copilot, OpenAI Codex, and any future tool that adopts the industry-standard skill/plugin format. Test execution uses a configurable CLI runner, not harness-specific subagent APIs. A test suite written once should run identically regardless of which harness executes it.

## Architecture

### Two-Role Model

```
User invokes /skill-unit or asks to test a skill
        │
        ▼
┌─────────────────────────────────────────┐
│  SKILL.md (evaluator + inline grader)   │
│  - Discovers *.spec.md files            │
│  - Parses frontmatter + test cases      │
│  - Runs setup scripts/fixtures          │
│  - Dispatches CLI runner per prompt     │
│  - Grades responses inline              │
│  - Writes timestamped results to disk   │
│  - Formats & presents summary           │
│  - Runs teardown scripts                │
└──────────────┬──────────────────────────┘
               │
               ▼ (one per test case)
┌──────────────────────────────────┐
│  ISOLATED CLI SESSION            │
│  (configurable runner command)   │
│                                  │
│  Receives: prompt only           │
│  Has no access to:               │
│  - Expectations                  │
│  - Test metadata                 │
│  - Other test cases              │
│                                  │
│  Returns: raw response (stdout)  │
└──────────────────────────────────┘
```

### Why CLI Runner Instead of Subagents?

Skills run inside a subagent context, and subagents cannot spawn sub-subagents. This is a constraint across all harnesses (Claude Code, Copilot, Codex, etc.). The CLI runner approach solves this by shelling out to the harness's CLI for each test prompt, which provides:

- **Process-level isolation** — stronger anti-bias than subagents (completely separate context)
- **Harness-agnostic** — any harness with a CLI entry point works
- **No shared state** — each test case runs in a fresh session

### Why Inline Grading?

Grading does not require anti-bias isolation — it only needs the response text and the expectations. By grading inline in the evaluator, we avoid the overhead of spawning a separate process for grading and keep the evaluator's context manageable by grading each test case immediately after execution.

A separate grader agent (`agents/grader.md`) is included in the plugin for future Phase 2 enhancement (persistent grader consumer pattern) but is not used in Phase 1.

### Execution Flow (Phase 1 — Sequential)

1. Skill activates via `/skill-unit` or natural language ("test my skill", "run skill tests").
2. Evaluator captures suite start timestamp.
3. Evaluator reads `.skill-unit.yml` (if present) for configuration, including the CLI runner command.
4. Evaluator discovers all `*.spec.md` files under the configured test directory.
5. For each spec file (sequential):
   a. Parse YAML frontmatter and test case sections.
   b. Create isolated workspace from fixture folder (if configured) using helper script.
   c. Run setup script (if configured) inside the workspace.
   d. For each test case (sequential):
   - Execute the prompt via the configured CLI runner from the workspace directory.
   - Collect the raw stdout response.
   - Grade the response inline: binary pass/fail per expectation.
     e. Write timestamped results file to `results/` subfolder.
     f. Run teardown script (if configured) inside the workspace.
     g. Clean up workspace using helper script.
6. Evaluator reads all results files for this run and presents the summary.

## Anti-Bias Layer

Two layers of protection ensure the isolated CLI session cannot access test metadata:

### Layer 1: Prompt Isolation

The evaluator passes only the raw prompt text to the CLI runner. No test ID, no expectations, no mention of "testing" or "evaluation." The isolated session believes it is handling a normal user request.

### Layer 2: Workspace Isolation

When fixtures are configured, the evaluator creates a temp directory (`/tmp/skill-unit-workspace-XXXXXX/`) containing only the fixture files. The CLI runner is invoked from this workspace directory. The spawned session sees only the fixture contents — no test specs, no results files, no test directory. This provides process-level anti-bias isolation without hooks or marker files.

Helper scripts manage the workspace lifecycle:

- `create-workspace.sh <fixture-path>` — creates the temp directory, copies fixture contents, returns the path
- `cleanup-workspace.sh <workspace-path>` — safely removes the temp directory (validates the naming pattern before deletion)

The fixture should be a self-contained project — including any skills, config files, and data the CLI session needs to discover and operate on.

## Plugin Structure

```
skill-unit/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── agents/
│   └── grader.md                # Available for future Phase 2 consumer pattern
├── skills/
│   └── skill-unit/
│       ├── SKILL.md             # Evaluator + inline grader (core of the plugin)
│       ├── references/
│       │   ├── spec-format.md
│       │   └── testing-guidelines.md
│       ├── templates/
│       │   ├── example.spec.md
│       │   └── .skill-unit.yml
│       └── scripts/
│           ├── setup-tests.sh       # Scaffolds test directory in a project
│           ├── create-workspace.sh  # Creates isolated temp workspace from fixture
│           └── cleanup-workspace.sh # Safely removes workspace temp directory
```

## Spec File Format

Each `*.spec.md` file contains multiple test cases for a skill or skill mode. YAML frontmatter holds shared configuration; repeated `###` sections define individual test cases.

### Frontmatter

| Field      | Required | Description                                     |
| ---------- | -------- | ----------------------------------------------- |
| `name`     | Yes      | Human-readable name for this test suite         |
| `skill`    | No       | Skill being tested (informational)              |
| `tags`     | No       | For filtering test runs                         |
| `timeout`  | No       | Per-test timeout, overrides global default      |
| `fixtures` | No       | Path to fixture folder, copied before tests run |
| `setup`    | No       | Script to run before tests                      |
| `teardown` | No       | Script to run after tests                       |

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

The isolated CLI session must operate in an environment that looks like a real project. Fixtures are copied into a temporary workspace directory (`/tmp/skill-unit-workspace-XXXXXX/`) using the `create-workspace.sh` helper script. The CLI runner is invoked from this workspace.

This approach provides:

- **Complete isolation** — the CLI session sees only the fixture files, no test specs or results
- **No repo pollution** — fixtures never touch the real working directory
- **Clean teardown** — `cleanup-workspace.sh` removes the entire temp directory
- **Self-contained projects** — fixtures should include everything the CLI session needs (skills, config, data files)

Future experiments may explore git worktrees or other isolation mechanisms for artifact-producing tests (Phase 3).

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
skill-tests/
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

📁 skill-tests/commit/
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

📁 skill-tests/brainstorming/
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
test-dir: skill-tests

# Runner configuration — how test prompts are executed in isolated sessions.
# Change this to match your AI agent harness.
runner:
  # The CLI executable to invoke for each test prompt.
  command: claude
  # Default arguments passed to the CLI. The prompt is piped via stdin.
  args: ['--print', '--output-format', 'text', '--max-turns', '10']

# Output settings
output:
  format: interactive # or "json"
  show-passing-details: false

# Execution settings
execution:
  timeout: 120s

# Setup/teardown defaults
defaults:
  setup: setup.sh
  teardown: teardown.sh
```

### Resolution Order

1. Spec file frontmatter (highest priority)
2. `.skill-unit.yml` at repo root
3. Built-in defaults from the plugin

## Self-Testing

Skill Unit tests itself using a dummy **report-card skill** — a simple, deterministic skill that reads a `students.json` fixture file and produces a formatted grade summary. The report-card skill lives as a repo-level skill at `.claude/skills/report-card/SKILL.md`.

The self-test structure:

```
skill-tests/skill-unit/
  spec-parsing.spec.md                  # Self-tests exercising skill-unit's behavior
  fixtures/
    report-card/                        # Fixture: a self-contained project
      .claude/skills/report-card/
        SKILL.md                        # Dummy skill — reads students.json, outputs grades
      skill-tests/report-card/
        report-card.spec.md             # Spec targeting the report-card skill
        fixtures/basic-class/
          students.json                 # Test data (3 students with known grades)
  results/                              # Results written here by skill-unit
```

When skill-unit's self-tests run, the fixture is copied into a temp workspace via `create-workspace.sh`. The CLI runner is invoked from that workspace, where it sees a complete project with the report-card skill, test specs, and test data. The self-test expectations then verify that skill-unit discovered the specs, executed prompts, graded correctly, wrote results files, and presented the summary.

This avoids infinite recursion (skill-unit testing itself) by pointing skill-unit at a simple, deterministic target skill instead. The workspace isolation ensures the CLI session has no visibility into skill-unit's own test suite.

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

## Phasing

### Phase 1 — MVP

- Plugin structure: SKILL.md (evaluator + inline grader), agent definitions kept for future use
- Configurable CLI runner for harness-agnostic test execution
- Spec file format (`*.spec.md`) with repeated section headings
- Sequential execution: one spec file at a time, one test case at a time
- Evaluator grades responses inline (binary pass/fail per expectation)
- Evaluator writes timestamped results files to disk (checked in)
- Workspace isolation: fixtures copied into temp directory, CLI runner invoked from there
- Helper scripts for workspace lifecycle (create-workspace.sh, cleanup-workspace.sh)
- Polyglot setup/teardown scripts
- `.skill-unit.yml` configuration with runner section
- Interactive results output
- `/skill-unit` slash command + natural-language activation
- Skill testing guidelines in `references/`
- Self-test suite using report-card dummy skill as self-contained fixture

### Phase 2 — Performance & Parallelism

- Parallel test execution within a spec file
- Persistent grader consumer pattern (SendMessage-based streaming of results as executors complete)
- JSON output format for CI/CD
- Tag-based test filtering (`/skill-unit --tag happy-path`)

### Phase 3 — Artifacts & Advanced Isolation

- Artifact validation expectations in spec files (expected files, file contents assertions)
- Git worktree experiment for artifact-producing tests (stronger isolation than temp directories)
- Worktree cleanup to prevent branch bloat
- Workspace persistence option (keep workspace after run for debugging)

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

No existing framework combines skill-aware test execution, anti-bias evaluator/executor separation, artifact validation, a traditional CLI-style test runner with structured output, and CI/CD integration. The closest existing tools:

- **Anthropic Skill Creator** — eval mode with JSON test cases and blind A/B, but no standalone CLI or CI/CD support
- **Promptfoo** — YAML config + CLI with JUnit output and GitHub Actions, but single-turn focused with no agent trajectory or artifact validation
- **DeepEval** — pytest-style unit testing for LLMs, but Python-only with no skill-format awareness
- **Evalite / vitest-evals** — TypeScript-native eval runners, but scoring-focused rather than pass/fail with no agent support
- **Google ADK Eval** — tool trajectory matching and user simulation, but tied to Google's ecosystem

Skill Unit fills the gap as a plugin-native, harness-agnostic testing framework purpose-built for the skill format that has become the industry standard across Claude Code, Copilot, and Codex.
