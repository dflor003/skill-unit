# Test Execution Architecture

## Overview

Test execution in Skill Unit is owned by the `skill-unit` CLI (`src/cli/` + `src/core/`). A single command — `skill-unit test` — runs the full pipeline: discover spec files, compile manifests, execute prompts in isolated workspaces, grade responses with independent agents, generate a report, and record run stats.

The `skill-unit` skill (`skills/skill-unit/SKILL.md`) delegates to the CLI via a thin wrapper script (`skills/skill-unit/scripts/run-cli.sh`). It does not orchestrate the pipeline itself.

## How It Works

The `test` command (`src/cli/commands/test.ts`) performs seven phases in order:

1. **Load config** — read `.skill-unit.yml` from the repo root via `src/config/loader.ts`, applying defaults for missing fields.
2. **Discover & filter** — walk `test-dir` for `*.spec.md` files (`src/core/discovery.ts`), parse each into a `Spec` (`src/core/compiler.ts`), apply CLI filters (`--name`, `--tag`, `--file`, `--test`, or positional args).
3. **Compile** — produce a `Manifest` per spec (`buildManifest`), containing resolved fixture paths, test cases, runner config, and resolved tool permissions. Manifests are written to `.workspace/runs/{timestamp}/manifests/` for inspection/debugging.
4. **Run** — for each test case, spawn the harness CLI via `src/core/runner.ts` in an isolated workspace (see [workspaces.md](workspaces.md)). A `Semaphore` limits concurrency to `runner.concurrency` (default 5). Each run writes a `.transcript.md` and `.log.jsonl`.
5. **Grade** — dispatch a `grader` agent per test case (`src/core/grader.ts`), up to `execution.grader-concurrency` in parallel. Each grader reads one transcript and writes one `.results.md`.
6. **Report** — assemble `report.md` deterministically from all `.results.md` files (`src/core/reporter.ts`). Emit a terminal summary, append to `$GITHUB_STEP_SUMMARY` in CI mode, and optionally write JUnit XML (`src/core/junit.ts`).
7. **Record stats** — append a `RunResult` to `.skill-unit/stats.json` (`src/core/stats.ts`) for trend tracking in the TUI.

The CLI exits 0 if all tests passed, 1 otherwise.

## Why a CLI Runner Instead of Subagents

The original design considered using the harness's subagent system (e.g., Claude Code's `Agent` tool) to execute test prompts. Three constraints made this approach unworkable:

### 1. Subagents Cannot Spawn Sub-Subagents

Skills run inside a subagent context. Many skills under test need to spawn their own subagents to do their work (e.g., a skill that delegates research to an exploration agent, or a skill that dispatches parallel workers). Subagent-based execution would fail for any skill that relies on this capability, because the test executor subagent cannot spawn further subagents. This is a fundamental constraint across all harnesses, not a temporary limitation.

### 2. Weaker Anti-Bias Guarantees

A subagent shares the same process and potentially the same context window as the evaluator. Even with careful prompt construction, there is a risk of information leaking — the subagent could infer it is being tested from the conversation structure, tool restrictions, or other environmental signals. A CLI process is a completely separate session with its own context, tools, and working directory. The agent has no way to know it is being evaluated.

### 3. No Harness Agnosticism

Subagent APIs are harness-specific. Claude Code uses the `Agent` tool, Copilot and Codex have their own mechanisms. A CLI runner works with any harness that has a CLI entry point — the runner configuration in `.skill-unit.yml` specifies the command and arguments, making the same test suite portable across harnesses.

## What the Runner Controls

`src/core/runner.ts` builds the full harness-CLI invocation to ensure proper isolation:

| Concern                    | How the runner handles it                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Isolation**              | Each test case gets its own workspace with a UUID-named directory. The agent's cwd is the `work/` subdirectory containing only fixture files.                    |
| **Skill loading**          | The skill under test is installed as a plugin in a sibling `plugin/` directory, passed via `--plugin-dir`. The agent cannot browse this directory.               |
| **File tool scoping**      | Bare file tool names (Read, Write, Edit, Glob, Grep) are rewritten to include workspace path restrictions (e.g., `Read(/path/to/work/**)`).                      |
| **System prompt boundary** | A system prompt instructs the agent to stay within its working directory — a soft guardrail complementing the hard tool scoping.                                 |
| **External influence**     | `--setting-sources local` prevents the harness from discovering project-level settings outside the workspace. `--strict-mcp-config` blocks external MCP servers. |
| **Permission mode**        | `--permission-mode dontAsk` ensures the agent runs without interactive prompts.                                                                                  |
| **Output capture**         | `--output-format stream-json` with `--include-partial-messages` gives the runner structured events to parse, log, and extract the final response from.           |
| **Timeouts**               | Configurable per-spec or globally, enforced via process-level SIGTERM.                                                                                           |

## Tool Profiles

The runner uses tool profiles — functions that build the CLI argument array for a given harness. Currently only `claude` is implemented. Adding a new harness means adding a new profile function that maps the same parameters (model, max turns, plugin dir, allowed/disallowed tools, workspace path) to that harness's CLI flags. See `TOOL_PROFILES` in `src/core/runner.ts`.

## Grader Delegation

The `grader` agent (`agents/grader.md`) is dispatched once per test case by `gradeSpecs` in `src/core/grader.ts`. Each grader reads the full `.transcript.md` and writes a `.results.md` with pass/fail per expectation. Graders are dispatched in batches (default 5 concurrent) to manage API costs.

The grader prompt is self-contained — all grading logic, transcript format understanding, and output format live in the agent definition. The orchestrator's dispatch is lightweight: test metadata inline plus paths to the transcript and output files.

Report assembly (`src/core/reporter.ts`) is deterministic — no AI involved, pure parsing and template assembly. This separation gives us:

- **Grading**: AI-powered (nuanced evaluation of behavioral trajectories)
- **Reporting**: deterministic (trivially reproducible)
- **The CLI**: thin orchestration (no transcript data in its context)

See `docs/specs/2026-04-04-grader-delegation-design.md` for the full design rationale. Note: the spec was written when this logic lived in `scripts/report.js`; the current implementation is in `src/core/reporter.ts` and is called inline by `test.ts` rather than as a separate script invocation.

## Relationship to the Skill

The `skill-unit` skill (`skills/skill-unit/SKILL.md`) is a thin layer over the CLI:

1. The agent reads the user's request.
2. It maps intent to CLI filter flags (table in SKILL.md Step 1).
3. It invokes `skills/skill-unit/scripts/run-cli.sh` — a bash wrapper that resolves `skill-unit` from PATH or `npx --no-install skill-unit`.
4. It streams CLI output to the user.
5. When the CLI exits, it reads `report.md` from the run directory and presents the summary.

The skill never builds manifests, polls progress, or dispatches graders. The CLI owns the pipeline; the skill is a UX shell.

## Relationship to Other Architecture Docs

- [workspaces.md](workspaces.md) — Workspace directory structure, lifecycle, and isolation design decisions.
- [per-test-fixtures.md](per-test-fixtures.md) — Fixture layering (global + per-test) inside workspaces.
