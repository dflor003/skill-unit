# Troubleshooting entry point

Status: implemented 2026-04-19
Spec: [docs/specs/2026-04-19-skill-unit-troubleshooting-design.md](../specs/2026-04-19-skill-unit-troubleshooting-design.md)

## Invariant

The `skill-unit` skill is the **only** entry point for inspecting `.workspace/runs/`. Agents must not use Read, Glob, or Grep on anything under that directory. The skill enforces this in prose; the CLI makes it practical by exposing every question as a subcommand.

## Commands

| Command                                       | Reads                                                       | Notes                                         |
| --------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `skill-unit runs`                             | `.workspace/runs/*/results/*.results.json` (counts only)    | Summary table only. No `--full`.              |
| `skill-unit show <run-id\|latest>`            | `.workspace/runs/<run>/results/*.results.json`, `report.md` | `--full` dumps `report.md`.                   |
| `skill-unit transcript <run-id\|latest> <id>` | `*.transcript.md`                                           | `--full` appends the full transcript content. |
| `skill-unit grading <run-id\|latest> <id>`    | `*.results.md`, `*.grader-transcript.md`                    | `--full` appends the grader transcript.       |

## Shared helper

All four commands share [src/core/runs-index.ts](../../src/core/runs-index.ts), which owns run discovery and per-test aggregation. It is the only module that walks `.workspace/runs/` directly.

## Why no `diff` in v1

Comparing two runs is useful but adds surface area (what axis of comparison? what format? which deltas are interesting?) with no concrete use case yet. The agent can call `show` twice if it needs to compare. Re-evaluate once a real diff workflow surfaces.

## Why no transcript search in v1

Grepping inside transcripts is straightforward for the agent _after_ it has the transcript via `--full`. A dedicated `search` subcommand would be valuable later if transcripts get large enough that dumping the whole thing becomes costly, but adding it pre-emptively violates YAGNI.
