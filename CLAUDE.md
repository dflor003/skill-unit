# Skill Unit Repo - AI Instructions

## Overview

Skill Unit is a plugin that brings structured, reproducible unit testing to AI agent skills. It uses `*.spec.md` files with a familiar unit-testing mental model: define prompts, declare expected outcomes, and get pass/fail results. Each test prompt runs in an isolated CLI session with no access to expectations, ensuring unbiased evaluation.

## Project Structure

```
src/              # TypeScript source (strict mode)
  cli/            # CLI entry point and Citty command definitions
    commands/     # test, compile, ls, report commands
  tui/            # Ink TUI application
    screens/      # Dashboard, Runner, Runs, Stats, Options
    components/   # Shared UI components (bottom-bar, progress-tree, etc.)
    hooks/        # React hooks (use-test-run)
  core/           # Business logic (no UI dependencies)
  config/         # Config loader and YAML parser
  types/          # Shared TypeScript type definitions
tests/            # Vitest unit and component tests
  core/           # Core logic tests
  cli/            # CLI command tests
  tui/            # Ink component tests
skills/           # Plugin skills (companion role, not in npm package)
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

## Working with the User

- Do not make assumptions about the user's intentions. Always ask clarifying questions if the task is ambiguous.

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
- `docs/architecture/tui-design.md` -- TUI/CLI architecture, screens, data flow, keyboard navigation
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

## Git Commands

Never use `git -C <path>`. Always use relative paths so that the auto-approve rules in `settings.json` match correctly.

## Dev Setup

After cloning, run:

```bash
npm install
npm run build
npm link
```

The `npm link` step is required for the skill-unit skill's own self-tests. The `skill-unit` skill invokes the CLI as `skill-unit <subcommand>` (or `npx skill-unit <subcommand>`). For external users, `npm install skill-unit` creates `node_modules/.bin/skill-unit` automatically; `npm install` in this repo does NOT self-install the bin, so `npm link` is needed to expose it on PATH. CI does the same thing automatically.

If the link gets stale (e.g., after pulling changes that modified `src/cli/`), re-run `npm run build` so the linked shim resolves to fresh code. The link target (`dist/cli/index.js`) is the same file on disk; only the content of `dist/` changes.

## Build, Lint, and Test Commands

Always use `npm run` (or `npm.cmd run` in Git Bash) to run project commands. Do NOT call the underlying tools directly (e.g., do not run `npx vitest`, `npx tsc`, or `npx eslint`). The npm scripts are whitelisted for auto-approval; direct tool invocations are not.

To pass additional arguments to any npm script, use `--` to forward them. For example: `npm run su -- ls --tag e2e`.

When introducing a new build, lint, or test tool, add an npm script for it in `package.json` rather than calling the tool directly. This keeps the auto-approval whitelist working and gives all agents a consistent interface.

Available scripts:

| Command                 | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `npm run su`            | Run the skill-unit CLI via tsx (e.g., `npm run su -- ls`)      |
| `npm run dev`           | Alias for `npm run su`                                         |
| `npm run build`         | Compile TypeScript to `dist/` via tsc                          |
| `npm run test`          | Run unit tests via Vitest                                      |
| `npm run test:watch`    | Run Vitest in watch mode                                       |
| `npm run test:coverage` | Run tests with V8 coverage report                              |
| `npm run test:skills`   | Run skill-unit spec tests (requires CLI harness, costs tokens) |
| `npm run lint`          | Lint `src/` with ESLint                                        |
| `npm run typecheck`     | Type-check without emitting (tsc --noEmit)                     |

## Validation Commands

After editing any `.js` file, validate syntax with `node -c <relative-path>`. Always use relative paths so auto-approve rules match. For `.ts` and `.tsx` files, use `npm run typecheck` instead.

## Writing Style

Never use em-dashes. Use commas, periods, or semicolons instead.

## Git Workflow

Do NOT commit changes as you go. Let the user review and commit. Never run `git add` or `git commit` unless the user explicitly asks you to.
