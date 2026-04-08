# Test Design Skill Architecture

## Overview

The test-design skill guides incremental creation and refinement of `*.spec.md` test files for AI agent skills. It reads a target skill's SKILL.md, asks targeted questions about gaps, and generates test cases by category with refinement loops.

## Skill Activation

The skill's `description` field in its SKILL.md frontmatter controls when the AI agent invokes it. This is the single most important factor in whether the skill works correctly.

### Descriptions are agent-facing, not human-facing

The description exists so the AI agent knows exactly when to invoke the skill and in what context. It is not documentation for humans. A good description:

- Front-loads trigger conditions ("ALWAYS use this skill when...")
- Lists specific phrases and natural variations the user might say
- States ownership clearly ("This skill handles ALL X for Y")
- Disambiguates from similar tasks ("not the skill being tested")

A bad description reads like a feature summary. The agent does not need to know what the skill does internally; it needs to know when to reach for it.

### Activation failures

The most common test failure mode is the skill not activating. The agent receives the prompt but never invokes the test-design skill, instead trying to handle the task on its own. Symptoms: the transcript shows no `Skill` tool call, and the agent spends turns exploring the codebase or writing tests from scratch.

The fix is always to rephrase the description. See `skills/test-design/references/troubleshooting.md` for details.

## Fixture Neutrality

Fixture content must not leak test intent to the agent under test. The agent runs in an isolated workspace and sees only the files inside it.

- **Fixture folder names** (e.g., `malformed-skill/`) are for the test author's benefit. The agent never sees these because the runner copies the contents into the workspace, not the folder itself.
- **File and directory names inside fixtures** must be plausible and neutral. Avoid names like `broken`, `invalid`, `bad-input`, or `should-fail`.
- **File content inside fixtures** must not describe the defect being tested. Write content as if it were real, with the structural issue present but no comments explaining it.

The principle: if the agent could read a fixture file and guess what the test expects, the fixture is leaking intent.

This is documented in `skills/test-design/references/fixture-design.md` and enforced by test cases in the test-design suite (TD-4).

## Prompt Design for Single-Turn Tests

Many test-design behaviors involve multi-step interactive flows (approval gates, one question at a time, incremental category generation). In single-turn tests, we can only verify the first response.

### Providing context to skip discovery

The skill's normal flow involves scanning for skills, checking for existing specs, reading SKILL.md files, and asking targeted questions. In a single-turn test, the agent can burn all its turns on discovery before reaching the behavior under test.

The fix is to front-load context in the prompt so the agent can skip past discovery steps. For example:

- Bad: "write tests for csv" (agent spends turns finding the skill)
- Good: "There's a csv skill in this project but no tests yet. Write me a single test case that covers X."

### Prompt vs. expectation boundaries in grading

When testing that generated test cases follow quality rules, be precise about which part of the generated output is being checked. The grader evaluates the full transcript, so ambiguous expectations like "does not mention Col1" can cause false negatives when Col1 appears in the expectations section (which is allowed) rather than the prompt section (which is not).

Prefix expectations with the specific section being checked: "Inside the generated test case, the **Prompt** section does not contain..."

## Test Suite Structure

The test-design tests are organized across multiple spec files by concern:

| File                      | Prefix | Concern                                                                                              |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| `test-design.spec.md`     | `TD`   | Core functionality: test case quality, existing spec detection, malformed skills, fixture neutrality |
| `test-design-pdd.spec.md` | `PDD`  | Prompt-driven development: nonexistent skills, capability mismatches, redundant questions            |

All files use `global-fixtures: ./fixtures/csv-skill` or no fixture as the base, with per-test fixtures layered for specific scenarios.

### Fixtures

| Fixture             | Purpose                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `csv-skill`         | A minimal skill with one SKILL.md. Base state for most tests.                                                                           |
| `csv-existing-spec` | Adds a pre-existing spec file for the csv skill. Layered on top of csv-skill for edit-mode tests.                                       |
| `malformed-skill`   | A skill with broken YAML frontmatter. Uses a neutral name ("inventory") so the agent does not know the file is intentionally malformed. |
