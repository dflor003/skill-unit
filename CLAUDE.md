# Skill Unit Repo - AI Instructions

## Overview

Skill Unit is a plugin that brings structured, reproducible unit testing to AI agent skills. It uses `*.spec.md` files with a familiar unit-testing mental model: define prompts, declare expected outcomes, and get pass/fail results. Each test prompt runs in an isolated CLI session with no access to expectations, ensuring unbiased evaluation.

## Distribution Channels (read before touching `package.json` or `.claude-plugin/`)

This repo ships through **two independent channels**. Keep them separate.

1. **npm package (`skill-unit`)** — the CLI. Defined by `package.json`; `files: ["dist/"]` controls what the tarball contains. Installed via `npm install skill-unit` and exposes the `skill-unit` binary. Users who only want the CLI get just `dist/`.
2. **Claude Code plugin** — the skills and their supporting subagents. Defined by `.claude-plugin/plugin.json` and includes `skills/`, `agents/`, etc. Installed via the plugin marketplace; the CLI is a peer dependency the plugin's scripts call out to.

Concretely: `agents/grader.md` is a **plugin** artifact, not an npm artifact. Do **not** add `agents/` to `package.json`'s `files` field — that smuggles a plugin file into the npm tarball and conflates the two channels. When a project that installs the npm CLI also wants the grader, it gets it via the plugin (or by providing its own `agents/grader.md` at the project root, which `resolveAgentPath` checks first).

The hand-off between the two channels: the skill's `scripts/run-cli.sh` resolves `skill-unit` from `PATH` (or `npx`), so the plugin invokes the npm-installed CLI as a subprocess. The CLI never assumes the plugin exists.

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
  skill-unit/                 # The test runner skill
  skill-test-design/          # The test case designer skill
  skill-test-troubleshooting/ # Diagnoses failing or flaky skill tests
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
- **Designing test cases**: Run `/skill-test-design` or ask to "design test cases." The skill guides you through writing spec files.
- **Troubleshooting failing tests**: Run `/skill-test-troubleshooting` or ask "why does this test keep failing?" to diagnose flaky or broken specs.
- Test cases live in the `skill-tests/` directory as `*.spec.md` files.
- All skills are registered in `.claude/settings.json`.

## Architecture Documentation

When making a significant architecture decision (new directory structures, isolation strategies, data flow changes, new subsystems), you MUST prompt the user to either create a new doc under `docs/architecture/` or update any existing relevant architecture docs. Do not let architecture decisions go undocumented.

Current docs. You MUST update this list any time you add, delete, or rename architecture documents:

- `docs/architecture/per-test-fixtures.md` -- per-test fixture isolation strategy
- `docs/architecture/skill-test-design.md` -- skill-test-design skill architecture
- `docs/architecture/test-execution.md` -- test execution pipeline
- `docs/architecture/troubleshooting.md` -- troubleshooting entry point (read-only CLI subcommands)
- `docs/architecture/tui-design.md` -- TUI/CLI architecture, screens, data flow, keyboard navigation
- `docs/architecture/workspaces.md` -- workspace isolation
- `docs/architecture/worktrees.md` -- git worktree workflow via worktrunk

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

- **Bare `git push` is denied everywhere**, including inside a worktree. Push with `git -C .worktrees/<folder> push -u origin <branch>`, forward slashes only.
- `git -C .worktrees/<folder> ...` is allow-listed for `push`, `add`, `commit`, `status`, `log`, `diff`, `fetch`, `rebase`, `branch`. Other `git -C` targets prompt.
- **Never push from the main checkout.** The deny list cannot enforce this; you must.
- Startup warnings about the `git -C *.worktrees/*` rules are known and accepted. Never add a `Bash(git -C *)` deny to silence them, which disables every worktree rule.
- Otherwise prefer plain relative paths so the rules match.

## Worktrees

Lifecycle goes through [worktrunk](https://worktrunk.dev). **The binary is `git-wt`, not `wt`** (Windows Terminal owns `wt`). Raw `git worktree add|remove|move|prune` is denied.

| Task   | Command                           |
| ------ | --------------------------------- |
| Create | `git-wt switch --create <branch>` |
| List   | `git-wt list`                     |
| Remove | `git-wt remove <branch>`          |
| Config | `git-wt config show`              |
| Hooks  | `git-wt hook show`                |

Worktrees land in `.worktrees/<branch>` (gitignored). `.config/wt.toml` runs `npm ci` then `npm run build` on create.

- **Verify every removal.** `git-wt remove` runs in the background and reports success regardless. Check `git worktree list`, `ls .worktrees/`, and `git branch --list`. The real error is in `.git/wt/logs/<folder>-<id>/internal/remove.log`. Re-running will not finish it; use `rm -rf .worktrees/<folder>` then `git branch -d <branch>`.
- **Never pass `--yes` to hook approvals.** That is the user's security decision; ask them to run `git-wt config approvals add`.

Machine setup, placement config, and Windows troubleshooting: `docs/architecture/worktrees.md`.

## CI Workflows

Workflows live in `.github/workflows/`. Read the YAML to see what each one does — do not ask the user.

The `gh` CLI is allow-listed (`Bash(gh *)`). When CI is red, pull the logs yourself with `gh run view <id> --log-failed` instead of asking the user to paste. If `--log-failed` is empty (e.g. a cancelled job), fall back to `--log`.

**The `Skill-Unit Tests` job costs Anthropic API tokens** and is opt-in only: a PR must have the `run-skill-tests` label, or the workflow must be manually dispatched. Do not enable it casually.

## Dev Setup

After cloning, run:

```bash
npm install
npm run build
npm link
```

The `npm link` step exposes the CLI on your PATH for use from other projects. It is no longer what makes this repo's own self-tests work: `skills/skill-unit/scripts/run-cli.sh` resolves this checkout's `dist/cli/index.js` before consulting PATH whenever it runs inside the skill-unit repo or one of its worktrees. `npm run build` is therefore the step that actually matters, since that resolution targets `dist/`.

That ordering exists because `npm link` is global. It points the PATH binary at exactly one checkout, so without it a worktree's `/skill-unit` run would silently exercise the main checkout's build instead of the code under test. For external users, `npm install skill-unit` creates `node_modules/.bin/skill-unit` automatically; `npm install` in this repo does NOT self-install the bin. CI does the same thing automatically.

### Cross-platform optional deps

A committed `.npmrc` at the repo root sets `include=optional`. The `package-lock.json` is generated cross-platform (Linux, Windows, macOS — x64 and arm64) so that Linux CI and Windows/macOS contributors all resolve cleanly from the same lockfile.

**Daily workflow:** run `npm ci` (matches CI exactly — installs from the lockfile, doesn't modify it, picks up only your host's binaries). Plain `npm install` also works on a clean checkout but will gradually strip cross-platform optional entries if the lockfile is touched.

**When you need to refresh the lockfile** — after editing `package.json`, after `npm install <pkg>` or `npm install -D <pkg>` (both of which strip cross-platform entries), or after CI fails with `npm error Missing: <pkg> from lock file` — run:

```bash
npm run lockfile:refresh
```

This wipes `node_modules` and `package-lock.json`, regenerates the lockfile with all platforms, then installs your host binaries on top without touching the lockfile. Commit the refreshed `package-lock.json`. CI will fail loudly on `npm ci` with the exact missing package if anyone forgets.

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
| `npm run format`        | Format the repo with Prettier (writes)                         |
| `npm run format:check`  | Prettier check without writing (the CI gate)                   |

## Validation Commands

After editing any `.js` file, validate syntax with `node -c <relative-path>`. Always use relative paths so auto-approve rules match. For `.ts` and `.tsx` files, use `npm run typecheck` instead.

## Writing Style

Never use em-dashes. Use commas, periods, or semicolons instead.

## Before Committing

A `simple-git-hooks` + `pretty-quick` pre-commit hook formats staged files automatically at `git commit` time, so you do not need to run `npm run format` manually. Lint, typecheck, and tests are NOT in the hook (too slow / too much noise) and remain your responsibility.

Standard pre-commit sequence when you have been authorized to commit (either directly by the user or as a subagent executing a plan task):

```bash
npm run typecheck
npm run lint
npm test
git add <specific-paths>
git commit -m "..."
```

If the pre-commit hook reformats files outside your task scope, include those changes in your commit. Do not revert them. Prettier is the source of truth for style.

## Git Workflow

**In the main checkout:** do NOT commit changes as you go. Let the user review and commit. Never run `git add` or `git commit` unless the user explicitly asks you to.

**In a worktree under `.worktrees/`:** commit, push, and open a Draft PR without being asked. Marking a PR Ready for Review and merging it stay the user's call. Push with the worktree form from "Git Commands" above; a bare `git push` is denied even from inside the worktree.
