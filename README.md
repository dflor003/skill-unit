# Skill Unit

A plugin that brings structured, reproducible unit testing to AI agent skills.

## What it does

Skill Unit lets you write test specs for AI agent skills using a familiar unit-testing mental model — define prompts, declare expected outcomes, and get pass/fail results. It uses a three-role agent architecture (evaluator, test-executor, grader) to ensure unbiased evaluation: the agent running your prompt never sees the expected outcomes.

## Key features

- **Spec files** (`*.spec.md`) — test cases written as prompts with expectations, grouped into suites with YAML frontmatter
- **Anti-bias execution** — the test-executor agent has no access to expectations or any indication it's being tested
- **Checked-in results** — timestamped results files commit to your repo for regression tracking via git history
- **Fixtures & setup/teardown** — declare filesystem state and run polyglot scripts before/after tests
- **CI/CD ready** — run headless with your agent harness of choice

## Quick start

1. Install the plugin in your project
2. Create a `tests/` directory with `*.spec.md` files (see `skills/skill-unit/templates/example.spec.md`)
3. Run `/skill-unit` or ask your agent to "run skill tests"

## Status

Phase 1 (MVP) — in development.
