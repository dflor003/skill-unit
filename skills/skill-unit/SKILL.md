---
name: skill-unit
description: This skill should be used when the user asks to "run skill tests", "test my skill", "evaluate a skill", "check skill quality", "run the test suite", "/skill-unit", "did the last run pass", "why did my skill test fail", "show the transcript for a skill test", "print the conversation for a test", "what did the X test do", "what runs do I have", or mentions skill testing, spec files, test case IDs (e.g. SU-1, EX-2, WG-1), failing tests, test transcripts, or inspecting test-run artifacts. Anything involving a named test case, a past test run, a transcript, or a grader verdict belongs to this skill.
argument-hint: '[name-or-tag ...]'
---

# Skill Unit - Skill Testing Framework

A structured, reproducible testing framework for AI agent skills. This skill delegates to the `skill-unit` CLI, which runs the full pipeline: discover spec files, execute prompts in isolated workspaces, grade responses with independent agents, and produce a consolidated report.

## Execution Process

### Hard rule: never read `.workspace/runs/` directly

Troubleshooting queries route through this skill's subcommands, not direct file reads. **Never** use Read, Glob, or Grep against anything under `.workspace/runs/`. This applies even when a CLI command mentions or prints a path to a file under `.workspace/runs/`: do not follow that path with Read. To get the full content of a transcript or grader transcript, re-invoke the relevant subcommand with `--full` instead. If the information you need is not exposed by a subcommand, surface that gap to the user rather than scraping files. This rule exists so the skill remains the single, predictable entry point for run history, transcripts, and grading.

### Classify intent

Pick one of three flows from the user's request, then follow that flow's steps.

| Intent       | Signals                                                                                           | Go to                 |
| ------------ | ------------------------------------------------------------------------------------------------- | --------------------- |
| Run tests    | "run", "test", "/skill-unit", "rerun"                                                             | Running Tests         |
| Troubleshoot | "why did X fail", "show the transcript", "what happened in the last run", "did the last run pass" | Troubleshooting Runs  |
| List/inspect | "what tests do I have", "search for X", "list tests"                                              | Advanced Usage (`ls`) |

### Running Tests

Follow these steps in order.

#### Step 0: Run `init` First (Once Per Chat Session)

Before the **first** "run tests" request in a chat session, invoke `init`. Skip this step on subsequent requests in the same session — if you have already invoked `init` in this conversation, go straight to Step 1.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" init
```

Do **not** try to detect the configured state yourself by reading `.skill-unit.yml` or similar. The `init` command owns that check. Never use absolute paths when looking for project files: the current working directory is the project root, and the skill must not reach outside it.

Read `init`'s output and branch on what it did:

- **If the final summary line says `Project already bootstrapped for skill-unit. No changes made.`** → proceed to Step 1 and run the tests.
- **Otherwise (any file was created or updated)** → the project was just bootstrapped. Relay init's output to the user, suggest `/test-design <skill-name>` to create the first test case, and STOP. Do not call `test` in the same turn; spec files do not exist yet.

The `init` command is idempotent. It creates `skill-tests/.gitkeep`, `.skill-unit.yml`, appends `.workspace` to `.gitignore`, and adds the skill's bootstrap permission to `.claude/settings.json`. Each step logs whether it was created, updated, or skipped.

#### Step 1: Map User Intent to CLI Args

Invoke the CLI through the plugin-provided wrapper `${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh`. The wrapper resolves `skill-unit` from PATH, falls back to a project-local install via `npx --no-install`, and errors out with install instructions if neither is available. Do not attempt discovery yourself; call the wrapper.

For brevity, the table below uses `run-cli.sh` as shorthand for the full path.

The `test` subcommand requires **at least one** filter (or `--all`).

| User says                               | CLI invocation                           |
| --------------------------------------- | ---------------------------------------- |
| "Run all the tests"                     | `run-cli.sh test --all`                  |
| "Run the tests for the `<X>` skill"     | `run-cli.sh test --skill <X>`            |
| "Run the `<name1>` and `<name2>` tests" | `run-cli.sh test --name <name1>,<name2>` |
| "Run tests tagged `<tag>`"              | `run-cli.sh test --tag <tag>`            |
| "Run test case `<ID>`"                  | `run-cli.sh test --test <ID>`            |
| "Run the tests in `<path>`"             | `run-cli.sh test --file <path>`          |
| "/skill-unit" (no args)                 | `run-cli.sh test --all`                  |

**Ambiguous targets**: when the user's request names a target that could be a skill, a spec, or a test (e.g. "run the tests for `<X>`", "/skill-unit `<X>`", "run the `<X>` tests"), do **not** guess a filter. First resolve the target with `run-cli.sh ls --search <X>`. The search does case-insensitive partial matching across spec name, frontmatter `skill:`, file basename, test case ID, and test case name, and prints each match with its skill and file path. Then pick the right `test` filter from the match:

- One spec matched via its `skill:` field → `test --skill <X>`
- One spec matched via its `name` field → `test --name <X>`
- Specific test cases matched → `test --test <ID1>,<ID2>`
- Multiple candidates with no clear winner → show the list to the user and ask which to run.

If `ls --search <X>` returns nothing, relay that to the user and suggest creating tests with `/test-design <X>` rather than trying other filters.

Pass-through overrides (apply only if the user asks):

- "Use `<model>`" → `--model <model>`
- "Give each test `<duration>`" → `--timeout <duration>` (e.g. `60s`, `2m`)
- "Up to `<N>` turns" → `--max-turns <N>`
- "Keep the workspaces so I can debug" → `--keep-workspaces`

#### Step 2: Run the CLI

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

#### Step 3: Present the Report

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

### Troubleshooting Runs

Follow these steps in order.

#### Step 1: Resolve ambiguous targets first

If the user's request names something that could be a skill, a spec, or a test case (e.g. "the widget tests", "why did report-card fail", "show me X"), **do not guess a filter or run id**. Resolve the target first with:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" ls --search <term>
```

`ls --search` does case-insensitive partial matching across spec name, frontmatter `skill:`, file basename, test case ID, and test case name. Use the matches to pick concrete test IDs (or confirm there are none) before calling `show`, `transcript`, or `grading`. Skipping this step relies on the target happening to be in the newest run — correct by accident, wrong in general. The only time you can skip disambiguation is when the user supplied an exact, unambiguous identifier like a literal test ID (`SU-T1`) or a full run timestamp.

If the user's request names a concrete test id or unambiguously names "the last run", proceed directly to Step 2.

#### Step 2: Map user intent to CLI args

All troubleshooting commands use the same wrapper (`run-cli.sh` shorthand for `${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh`).

| User says                                           | CLI invocation                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "Did the last run pass?" / "What was the last run?" | `run-cli.sh runs --limit 1`                                                                                |
| "Show me recent runs"                               | `run-cli.sh runs --limit 10`                                                                               |
| "Show me only failed runs"                          | `run-cli.sh runs --failed-only`                                                                            |
| "Why did the last run fail?"                        | `run-cli.sh show latest --failed-only`                                                                     |
| "Show run `<timestamp>`"                            | `run-cli.sh show <timestamp>`                                                                              |
| "Why did `<test-id>` fail?"                         | `run-cli.sh grading latest <test-id>`                                                                      |
| "Show the transcript for `<test-id>`"               | `run-cli.sh transcript latest <test-id>`                                                                   |
| "Give me the full transcript for `<test-id>`"       | `run-cli.sh transcript latest <test-id> --full`                                                            |
| "Why did the `<X>` tests fail?" (ambiguous target)  | First `run-cli.sh ls --search <X>` → resolve to test IDs → then `run-cli.sh grading latest <id>` per match |

**Run identifiers**: either the literal string `latest` (newest run) or a full timestamp directory name like `2026-04-19-18-24-23`. There is no prefix matching.

**Test identifiers**: exact, case-sensitive test IDs as they appear in spec files (e.g. `SU-1`). For ambiguous targets, always resolve via `ls --search <X>` before calling `transcript` or `grading`.

#### Step 3: Run the CLI

Invoke the wrapper in the foreground. All four subcommands are read-only.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" runs --limit 10
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" show latest --failed-only
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" transcript latest <test-id>
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" grading latest <test-id>
```

If the CLI says `No runs yet.`, relay that to the user and suggest `skill-unit test --all`. If it reports an unknown run or test id, the error lists available ids; pick one from that list.

#### Step 4: Present the result

Default to the structured summary the CLI prints. Only escalate to `--full` if the user **explicitly** asks for the full transcript or grader output (e.g. "show me the whole transcript", "give me the complete log", "what did it actually say line-by-line"). Phrases like "show me the transcript", "how did X go", "what happened with X" are summary-intent — answer from the default CLI output without `--full`. Never fall back to reading the referenced file with Read: the `--full` flag exists exactly for this purpose.

## Advanced Usage

The CLI has additional subcommands for discovery, compilation, and report inspection. All go through the same wrapper.

| Subcommand                                                  | Purpose                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `run-cli.sh ls [filters]`                                   | List discovered spec files and their test cases. Also the resolver for ambiguous targets via `--search`. |
| `run-cli.sh compile [filters]`                              | Parse spec files and write manifest JSON without running anything. Useful for inspecting what would run. |
| `run-cli.sh report --run-dir <path>`                        | Re-generate `report.md` from an existing run directory.                                                  |
| `run-cli.sh runs [--limit N] [--failed-only]`               | List recent runs with pass/fail counts.                                                                  |
| `run-cli.sh show <run-id\|latest> [--failed-only] [--full]` | Summarize one run. `--full` dumps the full `report.md`.                                                  |
| `run-cli.sh transcript <run-id\|latest> <test-id> [--full]` | Agent transcript for a test. `--full` appends the full transcript content.                               |
| `run-cli.sh grading <run-id\|latest> <test-id> [--full]`    | Grader verdict for a test. `--full` appends the full grader transcript.                                  |

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
