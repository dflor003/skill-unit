# Test Execution Architecture

## Overview

Test execution in Skill Unit is handled by a Node.js runner script (`skills/skill-unit/scripts/runner.js`) that spawns isolated CLI processes for each test prompt. This document explains the architecture and the decisions that led to it.

## How It Works

The evaluator skill (SKILL.md) writes a manifest JSON file describing the test cases, then invokes `runner.js` via `Bash`. The runner:

1. Reads the manifest (spec name, fixture path, skill path, runner config, test cases).
2. For each test case, creates an isolated workspace (see [workspaces.md](workspaces.md)).
3. Installs the skill under test as a plugin in a sibling directory.
4. Spawns the harness CLI (e.g., `claude`) with the prompt piped via stdin.
5. Captures the raw response from stdout (stream-json parsed).
6. Writes all responses to a JSON file for the evaluator to grade.

The evaluator then reads the responses, grades each one inline against the spec's expectations, writes results to disk, and presents a summary.

## Why a CLI Runner Instead of Subagents

The original design considered using the harness's subagent system (e.g., Claude Code's `Agent` tool) to execute test prompts. Three constraints made this approach unworkable:

### 1. Subagents Cannot Spawn Sub-Subagents

Skills run inside a subagent context. Many skills under test need to spawn their own subagents to do their work (e.g., a skill that delegates research to an exploration agent, or a skill that dispatches parallel workers). Subagent-based execution would fail for any skill that relies on this capability, because the test executor subagent cannot spawn further subagents. This is a fundamental constraint across all harnesses, not a temporary limitation.

### 2. Weaker Anti-Bias Guarantees

A subagent shares the same process and potentially the same context window as the evaluator. Even with careful prompt construction, there is a risk of information leaking — the subagent could infer it is being tested from the conversation structure, tool restrictions, or other environmental signals. A CLI process is a completely separate session with its own context, tools, and working directory. The agent has no way to know it is being evaluated.

### 3. No Harness Agnosticism

Subagent APIs are harness-specific. Claude Code uses the `Agent` tool, Copilot and Codex have their own mechanisms. A CLI runner works with any harness that has a CLI entry point — the runner configuration in `.skill-unit.yml` specifies the command and arguments, making the same test suite portable across harnesses.

## What the Runner Controls

The runner is not a thin shell wrapper. It controls the full CLI invocation to ensure proper isolation:

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

The runner uses tool profiles — functions that build the CLI argument array for a given harness. Currently only `claude` is implemented. Adding a new harness means adding a new profile function that maps the same parameters (model, max turns, plugin dir, allowed/disallowed tools, workspace path) to that harness's CLI flags.

```js
const TOOL_PROFILES = {
  claude: (
    model,
    maxTurns,
    pluginDir,
    allowedTools,
    disallowedTools,
    workspacePath
  ) => [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    // ... full argument list
  ],
  // Future: copilot, codex profiles
};
```

## Removed: test-executor Agent

The original design spec and plan included a `test-executor` agent (`agents/test-executor.md`) — a subagent that would receive a prompt and execute it in a clean context. This agent was never used in the implementation and has been removed from the repository. The reasons:

1. **Sub-subagent constraint** — Skills that spawn their own subagents would fail under a subagent executor.
2. **Anti-bias weakness** — A subagent shares process context with the evaluator, making information leakage possible.
3. **Harness lock-in** — Subagent APIs are harness-specific; a CLI runner is portable.
4. **Architectural simplicity** — The runner script handles workspace creation, CLI invocation, output parsing, and cleanup in a single, testable unit. Adding a subagent layer would split this responsibility without adding value.

The `grader` agent (`agents/grader.md`) is now actively used — the evaluator dispatches it once per test case for transcript-based grading. See the "Grader Delegation" section above.

## Grader Delegation

After the runner completes, the evaluator dispatches the `grader` agent (`agents/grader.md`) once per test case. Each grader reads the full conversation transcript (`.transcript.md`) and writes a per-test-case results file (`.results.md`). Graders are dispatched in configurable batches (default 5 concurrent) to manage API costs.

The grader agent prompt is self-contained — all grading logic, transcript format understanding, and output format are baked into the agent definition. The evaluator's dispatch is lightweight: test metadata inline, plus paths to the transcript and output files.

A deterministic Node.js script (`scripts/report.js`) then assembles a consolidated `report.md` from all grader outputs. This separation means:

- **Grading** is AI-powered (nuanced evaluation of behavioral trajectories)
- **Reporting** is deterministic (pure parsing and template assembly)
- **The evaluator** stays lean (no transcript data in its context)

See `docs/specs/2026-04-04-grader-delegation-design.md` for the full design rationale.

## Relationship to Other Architecture Docs

- [workspaces.md](workspaces.md) — Workspace directory structure, lifecycle, and isolation design decisions.
