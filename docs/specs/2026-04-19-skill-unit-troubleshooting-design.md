# Skill-Unit Troubleshooting Entry Point

**Status:** Draft
**Date:** 2026-04-19

## Goal

Make the `skill-unit` skill the single entry point for troubleshooting skill-test runs. Today the skill handles `test`, `compile`, `ls`, and `report`; anything past "run the tests" (read a transcript, check yesterday's results, find out why a specific test failed) falls back to the agent globbing `.workspace/runs/` and reading files by hand. This design adds four read-only CLI subcommands and extends the skill so every troubleshooting query routes through the CLI.

Operational invariant introduced by this design: **the agent must never access `.workspace/runs/` directly with Read, Glob, or Grep.** All access goes through the CLI.

## Non-Goals

- Run diffing (comparing two runs programmatically). Out of v1. The agent can call `show` twice.
- In-CLI search or grep over transcript text. The agent does that after `--full`.
- Changes to the `.workspace/runs/` on-disk layout. All new commands are read-only views over what `test` already writes.
- Changes to `.skill-unit.yml` schema.

## CLI Surface

Four new subcommands under `src/cli/commands/`, wired into the existing Citty root alongside `test` / `compile` / `ls` / `report`.

| Subcommand                                       | Purpose                       | Default output                                                                                                       | `--full` behavior                    |
| ------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `runs [--limit N] [--failed-only]`               | List recent runs              | Table: run-id, relative when, passed / failed / total, status                                                        | n/a (no `--full`)                    |
| `show <run-id\|latest> [--failed-only]`          | Summarize one run             | Header (run-id, totals) + per-test table with id, spec, verdict, one-line failure reason, transcript / grading paths | Dump the full `report.md`            |
| `transcript <run-id\|latest> <test-id> [--full]` | Agent transcript for one test | Header (test-id, verdict, failure reason) + path to the transcript file                                              | Append full transcript content       |
| `grading <run-id\|latest> <test-id> [--full]`    | Grader transcript + verdict   | Header + grader verdict + scoring from `*.results.md`                                                                | Append full `*.grader-transcript.md` |

### Run identifiers

- Literal `latest` resolves to the newest directory under `.workspace/runs/`.
- Otherwise the argument must be a full timestamp directory name (e.g. `2026-04-19-18-24-23`).
- No prefix matching or fuzzy resolution. Unambiguous, parser-friendly.

### Test identifiers

- Case-sensitive match against the test ID from the spec frontmatter (e.g. `SU-1`).
- No fuzzy matching inside these subcommands. Ambiguous targets are resolved upstream via `ls --search`, which already exists.

### Errors

- Unknown run-id: list available runs in the error message.
- Unknown test-id: list test IDs available in that run.
- Missing `.workspace/runs/`: `No runs yet. Run tests with \`skill-unit test --all\`.` (exit 0, informational).

### Exit codes

- `0` on success, including informational empty states (no runs yet).
- `1` only for invalid arguments or unknown run-id / test-id after the helpful listing.

## Implementation Sketch

### Files

```
src/cli/commands/
  runs.ts         # new
  show.ts         # new
  transcript.ts   # new
  grading.ts      # new
src/core/runs/
  index.ts        # new — shared helpers (see below)
tests/cli/
  runs.spec.ts        # new
  show.spec.ts        # new
  transcript.spec.ts  # new
  grading.spec.ts     # new
  fixtures/runs/      # new — canned run trees for CLI unit tests
```

### Shared helpers (`src/core/runs/`)

- `resolveRunId(input: string): string` — `"latest"` → newest dir under `.workspace/runs/`; a timestamp-shaped string → validate the dir exists; otherwise throw a "no such run" error whose message lists available run IDs.
- `loadRunIndex(runDir): RunIndex` — reads the `results/` dir and returns `{ runId, tests: [{ testId, specName, verdict, failureReason, transcriptPath, graderPath, resultsPath }] }`. The data is already in `*.results.json`; this helper aggregates.
- `loadTest(runDir, testId): TestResult | null` — single-test lookup. On miss, the caller throws an error whose message lists test IDs available in that run.

### Per-command behavior

- **`runs`** — iterate `.workspace/runs/` (already sorted by timestamp), count pass/fail from each `results/*.results.json`, print a table. No `--full`.
- **`show`** — `resolveRunId` → `loadRunIndex` → print header + table. With `--full`, dump `report.md` instead.
- **`transcript`** — `resolveRunId` → `loadTest` → print summary header + transcript path. With `--full`, append transcript content.
- **`grading`** — same shape as `transcript` but reads `*.results.md` (verdict + scoring) by default and appends `*.grader-transcript.md` with `--full`.

## Skill Changes

### `skills/skill-unit/SKILL.md`

1. Add a short **"Classify Intent"** section at the top of `## Execution Process` with a 3-row routing table:

   | Intent         | Signals                                                                  | Go to                 |
   | -------------- | ------------------------------------------------------------------------ | --------------------- |
   | Run tests      | "run", "test", "/skill-unit", "rerun"                                    | Running Tests         |
   | Troubleshoot   | "why did X fail", "show the transcript", "what happened in the last run" | Troubleshooting Runs  |
   | List / inspect | "what tests do I have", "search for X"                                   | Advanced Usage (`ls`) |

2. Rename the existing Step 1 / 2 / 3 cluster to **"Running Tests"** with the three numbered steps beneath it. Content unchanged.

3. Add a new sibling section **"Troubleshooting Runs"** with its own three steps:
   - **Step 1: Map user intent to CLI args.** Troubleshooting mapping table:

     | User says                                           | CLI invocation                                                                                  |
     | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
     | "What was the last run?" / "Did the last run pass?" | `run-cli.sh runs --limit 1`                                                                     |
     | "Show me recent runs"                               | `run-cli.sh runs --limit 10`                                                                    |
     | "Show me only failed runs"                          | `run-cli.sh runs --failed-only`                                                                 |
     | "Why did the last run fail?"                        | `run-cli.sh show latest --failed-only`                                                          |
     | "Show run `<timestamp>`"                            | `run-cli.sh show <timestamp>`                                                                   |
     | "Why did `<test-id>` fail?"                         | `run-cli.sh grading latest <test-id>`                                                           |
     | "Show the transcript for `<test-id>`"               | `run-cli.sh transcript latest <test-id>`                                                        |
     | "Give me the full transcript for `<test-id>`"       | `run-cli.sh transcript latest <test-id> --full`                                                 |
     | "Why did the `<X>` tests fail?" (ambiguous target)  | First `run-cli.sh ls --search <X>` → resolve to test IDs → then `grading latest <id>` per match |

   - **Step 2: Run the CLI.** Same wrapper invocation pattern as the test flow.

   - **Step 3: Present the result.** Default to the structured summary the CLI prints. Call `--full` only when the summary doesn't contain enough signal or the user explicitly asks.

4. **New hard rule, prominent near the top of `## Execution Process`:**

   > Never access files under `.workspace/runs/` with Read, Glob, or Grep. All access goes through the CLI subcommands. If information you need isn't exposed by a subcommand, surface that gap to the user rather than reading files directly.

5. Extend the **Advanced Usage** table with rows for `runs`, `show`, `transcript`, `grading`. `report` stays — it regenerates `report.md` and is distinct from `show`'s summary view.

### No new reference docs

`references/spec-format.md` and `references/testing-guidelines.md` are about authoring specs, not troubleshooting. The troubleshooting mapping table in `SKILL.md` is the source of truth; adding a third reference file would split the mental model.

## Validation

Three layers, strongest first.

### Layer 1: CLI unit tests (Vitest, `tests/cli/`)

One `*.spec.ts` file per new subcommand under `tests/cli/`, each backed by a fixture run tree under `tests/cli/fixtures/runs/`. Naming, layout, and structure follow `.claude/rules/test-conventions.md`: one top-level `describe` per file, `when/should` naming, `// Arrange // Act // Assert` blocks. Coverage:

- `runs.spec.ts` — correct newest-first ordering, `--limit` respected, `--failed-only` filters correctly.
- `show.spec.ts` — `latest` resolves to the newest dir, `--failed-only` filters, unknown run-id error lists available runs, `--full` dumps `report.md`.
- `transcript.spec.ts` — default prints summary shape, `--full` appends full transcript content, unknown test-id error lists available IDs.
- `grading.spec.ts` — same shape over `*.results.md` and `*.grader-transcript.md`.

Existing test file `tests/cli/commands.spec.ts` (a meta-test that the commands are defined) stays as-is; the new per-command specs cover behavior.

### Layer 2: Skill behavior spec — `skill-tests/skill-unit/troubleshooting.spec.md`

**This spec must be authored via the `test-design` skill, not written ad hoc.** The subagent that implements this task invokes `/test-design skill-unit`, selects Edit Mode B (user-directed edits) against a new spec, and follows the skill's prompt-quality and expectation-quality rules. The design below specifies _what_ to cover; the `test-design` skill specifies _how_ to phrase it.

**Frontmatter:**

```yaml
---
name: skill-unit-troubleshooting-tests
skill: skill-unit
tags: [troubleshooting, integration]
global-fixtures: ./fixtures/seeded-runs
allowed-tools: [Read, Bash, Skill]
---
```

**Fixture tree** (`skill-tests/skill-unit/fixtures/seeded-runs/`):

```
.workspace/runs/
  2026-04-17-10-00-00/results/
    report.md
    example-tests.EX-1.{results.json,results.md,transcript.md}
    example-tests.EX-2.{results.json,results.md,transcript.md,grader-transcript.md}
  2026-04-18-12-00-00/results/
    report.md
    widget-tests.WG-1.{results.json,results.md,transcript.md,grader-transcript.md}
```

Fixture neutrality per `skills/test-design/references/fixture-design.md`: generic names (`example-tests`, `widget-tests`, `EX-1`, `WG-1`); nothing named `broken` or `failing`; file contents must not narrate the defect.

**Coverage the spec needs to include** (exact phrasing delegated to `test-design`):

| #   | Intent                                                | Must verify                                                                                                                                   | Must refuse                                                              |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | "Did the last run pass?"                              | References the fail count from the newest seeded run; CLI was invoked                                                                         | Did not Read / Glob / Grep under `.workspace/runs/` directly             |
| 2   | "Why did the last run fail?"                          | Names the failing test ID from the newest seeded run and quotes its failure reason; CLI called with `show latest --failed-only` or equivalent | Same direct-access prohibition                                           |
| 3   | "Show me the transcript for `<seeded-id>`"            | Output is the summary shape (id, verdict, reason, path), not a full transcript dump                                                           | Did not pass `--full`; did not Read the transcript file directly         |
| 4   | "Give me the full transcript for `<seeded-id>`"       | Output contains the seeded transcript content                                                                                                 | Did not Read the transcript file directly (CLI produces it via `--full`) |
| 5   | "Show me recent runs"                                 | Output lists both seeded runs in newest-first order                                                                                           | Did not Read the runs directory directly                                 |
| 6   | Ambiguous target referring to one of the seeded specs | Agent first calls `ls --search <X>`, then routes through troubleshooting commands                                                             | Did not guess a filter without resolving first                           |

Every test case gets a **"did not access `.workspace/runs/` directly"** negative expectation. That invariant is the whole reason this design exists; it must be graded.

### Layer 3: Manual spot-check

After implementation, run the CLI against the real `.workspace/runs/` with a handful of prompts ("show latest", "transcript latest SU-1", "runs --limit 3") and confirm output matches what the skill's mapping table promises. Lightweight sanity pass; does not replace Layers 1 and 2.

## Migration and Compatibility

Additive only. Existing `test` / `compile` / `ls` / `report` behavior is unchanged. No config schema changes. No changes to `.workspace/runs/` layout.

## Architecture Docs

Add `docs/architecture/troubleshooting.md` — short, one page: the four commands, what artifacts they read, the "skill is the only entry point" invariant, and why no diff command in v1. Update the architecture docs list in `CLAUDE.md` to include it.

## Out of Scope

- Run diffing. Re-evaluate once a concrete use case surfaces.
- Transcript search. If needed later, add `search <run-id> <pattern>` rather than letting the agent grep raw files.
- Cross-run stats beyond what `runs` returns. `stats.json` already feeds a separate TUI surface.
