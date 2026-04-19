---
name: skill-unit
description: This skill should be used when the user asks to "test my skill", "run skill tests", "evaluate a skill", "run the test suite", "check skill quality", "/skill-unit", or mentions skill testing, skill evaluation, or running spec files. It provides a structured unit testing framework for AI agent skills with anti-bias evaluation.
argument-hint: '[name-or-tag ...]'
---

# Skill Unit - Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. This skill delegates to the `skill-unit` CLI, which runs the full pipeline: discover spec files, execute prompts in isolated workspaces, grade responses with independent agents, and produce a consolidated report.

## Execution Process

Follow these steps in order.

### Step 1: Map User Intent to CLI Args

Invoke the CLI through the plugin-provided wrapper `${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh`. The wrapper resolves `skill-unit` from PATH, falls back to a project-local install via `npx --no-install`, and errors out with install instructions if neither is available. Do not attempt discovery yourself; call the wrapper.

For brevity, the table below uses `run-cli.sh` as shorthand for the full path.

The `test` subcommand requires **at least one** filter (or `--all`).

| User says                               | CLI invocation                           |
| --------------------------------------- | ---------------------------------------- |
| "Run all the tests"                     | `run-cli.sh test --all`                  |
| "Run tests for `<name>`"                | `run-cli.sh test --name <name>`          |
| "Run the `<name1>` and `<name2>` tests" | `run-cli.sh test --name <name1>,<name2>` |
| "Run tests tagged `<tag>`"              | `run-cli.sh test --tag <tag>`            |
| "Run test case `<ID>`"                  | `run-cli.sh test --test <ID>`            |
| "Run the tests in `<path>`"             | `run-cli.sh test --file <path>`          |
| "/skill-unit `<name>`"                  | `run-cli.sh test --name <name>`          |
| "/skill-unit" (no args)                 | `run-cli.sh test --all`                  |

Pass-through overrides (apply only if the user asks):

- "Use `<model>`" → `--model <model>`
- "Give each test `<duration>`" → `--timeout <duration>` (e.g. `60s`, `2m`)
- "Up to `<N>` turns" → `--max-turns <N>`
- "Keep the workspaces so I can debug" → `--keep-workspaces`

### Step 2: Run the CLI

Invoke the wrapper in the foreground (not a background task). The CLI streams progress to stdout/stderr; surface it to the user as it arrives.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" test <filter-args>
```

The CLI performs the entire pipeline in one call:

1. Reads `.skill-unit.yml` (applies defaults if missing fields).
2. Discovers `*.spec.md` files under `test-dir` and applies filters.
3. Compiles spec files into manifests at `.workspace/runs/{timestamp}/manifests/`.
4. Runs every test case in an isolated workspace with the configured harness, up to `runner.concurrency` at a time.
5. Dispatches a grader agent per test case, up to `execution.grader-concurrency` at a time.
6. Writes per-test transcripts and results to `.workspace/runs/{timestamp}/results/`.
7. Generates `report.md` and prints a summary to stdout.
8. Records the run in `.skill-unit/stats.json`.
9. Exits 0 if all tests passed, 1 otherwise.

While the CLI runs, do not poll, do not call the grader agent yourself, do not regenerate the manifest. The CLI owns the whole pipeline.

If no spec files are discovered, the CLI logs `No spec files found matching filters`. Relay this to the user and suggest creating a test case with the `test-design` skill (`/test-design <skill-name>`).

### Step 3: Present the Report

After the CLI exits, read the generated report at:

```
.workspace/runs/{timestamp}/results/report.md
```

The exact path is printed in the CLI's final summary line. Present the report content, then append a brief summary in this format:

```
**{N} passed** | **{N} failed** | {N} total

Full report: [report.md](.workspace/runs/{timestamp}/results/report.md)
```

For failing tests, quote the one-phrase failure reason from the report (it already extracts these). Link to individual transcripts and grading files when helpful.

## Advanced Usage

The CLI has three other subcommands. Use them only when the user explicitly asks for one of these workflows. All go through the same wrapper:

| Subcommand                           | Purpose                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `run-cli.sh ls [filters]`            | List discovered spec files and their test cases. Useful for "what tests do I have?"                                     |
| `run-cli.sh compile [filters]`       | Parse spec files and write manifest JSON without running anything. Useful for inspecting what would run.                |
| `run-cli.sh report --run-dir <path>` | Re-generate `report.md` from an existing run directory. Useful when the report was lost or the user wants to diff runs. |

## Configuration

The CLI reads `.skill-unit.yml` at the repository root. Defaults apply when fields are missing:

```yaml
test-dir: skill-tests
runner:
  tool: claude # harness CLI (claude, copilot, codex)
  model: sonnet # model for the test agent (optional)
  max-turns: 10
  concurrency: 5 # max test cases running in parallel
output:
  format: interactive
  show-passing-details: false
execution:
  timeout: 120s
  grader-concurrency: 5
```

The skill does not need to read this file directly. The CLI resolves it.

### Tool permissions

The CLI enforces strict tool isolation inside test workspaces using `--permission-mode dontAsk`. Spec files can override the allowed/disallowed lists via `allowed-tools` / `allowed-tools-extra` / `disallowed-tools` / `disallowed-tools-extra` frontmatter. The skill never configures permissions itself; the CLI does.

## Reference Material

For detailed documentation, consult these files as needed:

- **`references/spec-format.md`** — complete spec file format reference with examples
- **`references/testing-guidelines.md`** — best practices for writing test cases
