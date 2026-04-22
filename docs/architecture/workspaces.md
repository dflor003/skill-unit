# Workspace Architecture

## Overview

The `.workspace/` directory at the repository root is the single location for all ephemeral test artifacts — isolated workspaces, run outputs, logs, and plugin installations. It is gitignored entirely.

## Directory Structure

```
.workspace/                                       # repo root, gitignored
  runs/{timestamp}/                               # one folder per test run
    manifests/
      {spec-name}.manifest.json                   # input manifest for the runner
      {spec-name}.progress.json                   # real-time progress (polled by evaluator)
    logs/
      {spec-name}.{test-id}.log.jsonl             # raw CLI stream-json output (debug artifact)
    responses/
      {spec-name}.responses.json                  # abbreviated responses (used for progress)
    results/
      {spec-name}.{test-id}.transcript.md         # conversation transcript (from runner)
      {spec-name}.{test-id}.results.md            # grader evaluation (from grader agent)
      report.md                                   # consolidated report (from report script)
  workspaces/{timestamp}/{spec-name}.{test-id}/   # one per test case, per run
    work/                                         # agent's working directory (cwd)
    plugin/                                       # skill-under-test installed as plugin
      .claude-plugin/plugin.json
      skills/{skill-name}/SKILL.md
```

## How Workspaces Get Created

The runner module (`src/core/runner.ts`, invoked by the `skill-unit test` CLI command) manages the full workspace lifecycle:

1. **Setup phase** — The runner reads the manifest JSON and creates the `.workspace/` directory at the repo root if it doesn't exist. It idempotently adds `.workspace/` to the repo's `.gitignore`. It then creates the run-specific subdirectories under `runs/{timestamp}/`.

2. **Per test case** — For each test case in the manifest:
   - A deterministic workspace id is derived as `{safeSpecName}.{safeTestId}` (non-alphanumeric characters replaced with `_`). Deterministic naming lets the grader reconstruct the path from `(timestamp, specName, testId)` without a side channel.
   - A workspace base directory is created at `.workspace/workspaces/{timestamp}/{workspaceId}/`.
   - **`work/`** — The global fixture folder (from `global-fixtures` in spec frontmatter) is copied into `{workspaceId}/work/` first. Then any per-test fixtures (from the test case's `**Fixtures:**` section) are layered on top in list order, allowing per-test fixtures to add or override files from the global fixture. If no fixtures are configured, an empty directory is created. This becomes the agent's `cwd`.
   - **`plugin/`** — If the spec declares a `skill` field, the skill directory is copied into `{workspaceId}/plugin/skills/{skill-name}/` and a bare `plugin.json` is generated at `{workspaceId}/plugin/.claude-plugin/plugin.json`. The `--plugin-dir` flag points here.

3. **Execution** — The CLI harness is spawned with `cwd` set to the `work/` directory. The `--plugin-dir` flag points to the sibling `plugin/` directory. File tool permissions are scoped to `work/`.

4. **Grading** — The grader agent (one per test case) receives the workspace path in its prompt and may Read/Glob inside `work/` to verify filesystem expectations (e.g. "`.skill-unit.yml` was created"). This is the reason workspaces survive past the run and up to grading completion.

5. **Cleanup** — After all graders finish, the orchestrator calls `cleanupRunWorkspaces(timestamp)` which removes the entire `workspaces/{timestamp}/` directory. Both the CLI `test` command and the TUI hook trigger this.

## Design Decisions

### Why a single `.workspace/` at the repo root?

Earlier designs placed a `.workspaces/` directory inside each spec's directory (e.g., `skill-tests/test-design/.workspaces/`). This had problems:

- **Path leakage** — The workspace path included the spec directory name and test ID (e.g., `skill-tests/test-design/.workspaces/2026-04-03-22-11-16-TDD-7/`), telling the agent what was being tested.
- **Multiple gitignore entries** — Each spec directory needed its own `.gitignore` entry for `.workspaces/`.
- **Scattered artifacts** — Results, logs, and progress files were spread across multiple directories.

A single `.workspace/` at the repo root solves all three: one gitignore entry, one location for all artifacts, and no spec-specific information in the path.

### Why `{timestamp}/{spec-name}.{test-id}` workspace paths?

Earlier the workspace was named with a random UUID (e.g., `a1b2c3d4-...`) to keep the path opaque from the agent. That was valuable, but it had two follow-on costs:

- **No reconstruction from outside** — anything that needs to find a workspace after the fact (notably the grader) required a side-channel lookup; there was no way to derive the path from stable identifiers.
- **Flat directory** — all runs shared one `workspaces/` directory, so cleanup had to be per-test and couldn't be scoped to a single run.

The current layout nests workspaces under `workspaces/{timestamp}/{spec-name}.{test-id}/`:

- The grader reconstructs the path from the inputs it already has (`timestamp`, `specName`, `testId`).
- A whole run's workspaces can be cleaned up with one `rm -rf workspaces/{timestamp}/`.
- Leakage to the agent is still avoided: the agent's `cwd` is the inner `work/` directory. The parent `{spec-name}.{test-id}/` is not mentioned in the system prompt, and Glob/Read scoping prevents the agent from traversing up.

### Why `work/` and `plugin/` as siblings?

The skill under test needs to be loaded by the CLI harness via `--plugin-dir`, but the agent must not be able to browse the plugin files. Three approaches were considered:

1. **Plugin inside the workspace** — The agent's `cwd` contains the plugin. The agent can read the plugin files, discovering what skill is under test. Rejected.
2. **Plugin in a shared directory** — All test cases share a plugin at `.workspace/plugins/{spec-name}/`. The path leaks the spec name. Rejected.
3. **Plugin as a sibling** — Each workspace has `work/` (agent's cwd) and `plugin/` as siblings under the same UUID directory. The `--plugin-dir` points to `plugin/`, but the agent's file tools are scoped to `work/**` and cannot traverse to the sibling. **Chosen.**

The sibling approach is self-contained (each workspace carries its own copy of the skill), reveals no information (the UUID parent is opaque), and leverages the existing file tool scoping to enforce isolation.

### Why not checked-in results?

The original design spec called for results files to be committed to the repo for regression tracking. In practice, each test run produces multiple files (graded results, raw logs, formatted transcripts, response JSON), making the committed artifacts noisy. The `.workspace/` directory is gitignored entirely. Prior run results persist locally across runs for comparison but don't pollute the git history.

### Why `--setting-sources local`?

The runner passes `--setting-sources local` to the CLI harness, restricting it to settings found in the workspace directory itself. Without this, the harness walks up the directory tree from the workspace's `work/` directory, potentially discovering project-level settings, CLAUDE.md files, or other configuration that could influence the agent's behavior and break test isolation.

### Why `--system-prompt` for workspace boundaries?

In addition to file tool scoping via `--allowedTools`, the runner injects a system prompt telling the agent its working directory and instructing it not to access files outside. This is a soft guardrail — the agent generally complies with system prompt instructions. It complements the hard `--allowedTools` scoping (which only restricts dedicated file tools, not `Bash` commands like `cat` or `ls`).

## Lifecycle Summary

```
Evaluator (SKILL.md)
  │
  ├─ writes manifest to .workspace/runs/{ts}/manifests/{spec}.manifest.json
  ├─ invokes runner.js with manifest path
  │
  │  Runner (runner.ts)
  │    ├─ creates .workspace/ at repo root (idempotent)
  │    ├─ creates run dirs: manifests/, logs/, responses/, results/
  │    │
  │    ├─ for each test case:
  │    │   ├─ derives workspaceId = {spec}.{id} (sanitized)
  │    │   ├─ creates .workspace/workspaces/{ts}/{spec}.{id}/work/ (copies global + per-test fixtures)
  │    │   ├─ creates .workspace/workspaces/{ts}/{spec}.{id}/plugin/ (installs skill)
  │    │   ├─ spawns CLI: cwd=work/, --plugin-dir=plugin/
  │    │   ├─ writes transcript to .workspace/runs/{ts}/results/{spec}.{id}.transcript.md
  │    │   ├─ writes raw log to .workspace/runs/{ts}/logs/{spec}.{id}.log.jsonl
  │    │   ├─ leaves workspace on disk (cleanup deferred until after grading)
  │    │   └─ updates progress file
  │    │
  │    └─ writes responses to .workspace/runs/{ts}/responses/
  │
  ├─ polls progress file for status updates
  ├─ reads responses file (for completion confirmation)
  ├─ dispatches grader agent per test case (batched at grader-concurrency)
  │
  │  Grader (agents/grader.md) — one per test case
  │    ├─ reads .workspace/runs/{ts}/results/{spec}.{id}.transcript.md
  │    ├─ may Read/Glob inside .workspace/workspaces/{ts}/{spec}.{id}/work/
  │    │   to verify filesystem expectations
  │    └─ writes .workspace/runs/{ts}/results/{spec}.{id}.results.md
  │
  ├─ calls cleanupRunWorkspaces(timestamp) to remove workspaces/{ts}/
  ├─ invokes report.js to generate consolidated report
  │
  │  Report Script (report.js)
  │    ├─ reads all .workspace/runs/{ts}/results/*.results.md
  │    └─ writes .workspace/runs/{ts}/results/report.md
  │
  ├─ reads report.md
  └─ presents summary to user
```
