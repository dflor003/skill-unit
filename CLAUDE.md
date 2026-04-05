# Skill Unit Repo - AI Instructions

## Overview

Skill Unit is a plugin that brings structured, reproducible unit testing to AI agent skills. It uses `*.spec.md` files with a familiar unit-testing mental model: define prompts, declare expected outcomes, and get pass/fail results. Each test prompt runs in an isolated CLI session with no access to expectations, ensuring unbiased evaluation.

## Project Structure

```
skills/           # Plugin skills (each has a SKILL.md entrypoint)
  skill-unit/     # The test runner skill
  test-design/    # The test case designer skill
agents/           # Subagent definitions (markdown with YAML frontmatter)
  grader.md       # Grading agent for evaluating test results
skill-tests/      # Test suites as *.spec.md files
docs/
  architecture/   # Architecture decision records
  specs/          # Specifications
  plans/          # Implementation plans
```

## Running and Writing Tests

- **Running tests**: Run `/skill-unit` or ask to "run skill tests." The skill handles execution, isolation, and reporting.
- **Designing test cases**: Run `/test-design` or ask to "design test cases." The skill guides you through writing spec files.
- Test cases live in the `skill-tests/` directory as `*.spec.md` files.
- Both skills are registered in `.claude/settings.json`.

## Architecture Documentation

When making a significant architecture decision (new directory structures, isolation strategies, data flow changes, new subsystems), you MUST prompt the user to either create a new doc under `docs/architecture/` or update any existing relevant architecture docs. Do not let architecture decisions go undocumented.

Current docs. You MUST update this list any time you add, delete, or rename architecture documents:

- `docs/architecture/per-test-fixtures.md` -- per-test fixture isolation strategy
- `docs/architecture/test-design.md` -- test design skill architecture
- `docs/architecture/test-execution.md` -- test execution pipeline
- `docs/architecture/workspaces.md` -- workspace isolation

## Rules Files

Files in `.claude/rules/` use `paths` frontmatter to scope rules to specific directories. The correct format is a quoted glob string, not a YAML list:

```yaml
# Correct (single pattern)
paths: "**/skills/**"

# Correct (multiple patterns, comma-separated)
paths: "foo/*, bar/*"

# Wrong (IDE may suggest this, but it is incorrect)
paths:
  - "**/skills/**"
```

IDE schema validation will flag the correct format as an error. Ignore it.

## Validation Commands

After editing any `.js` file, validate syntax with `node -c <relative-path>`. Always use relative paths so auto-approve rules match.

## Writing Style

Never use em-dashes. Use commas, periods, or semicolons instead.

## Git Workflow

Do NOT commit changes as you go. Let the user review and commit. Never run `git add` or `git commit` unless the user explicitly asks you to.
