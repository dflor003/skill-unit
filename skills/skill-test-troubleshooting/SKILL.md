---
name: skill-test-troubleshooting
description: Use when the user wants a failing or flaky skill test fixed, not just inspected. Triggers on "why does X keep failing", "make X pass reliably", "fix the flaky test", "this test keeps timing out", "diagnose the failures from the last run", "fix any failed tests", "/skill-test-troubleshooting", or any request that names a test/skill/run and asks to repair, stabilize, or make-green. Does NOT activate on "run the tests" (that is the skill-unit skill) or on read-only inspection requests like "show the transcript" / "what happened in the last run" (also skill-unit). Does NOT activate on requests to write or add a new test case (that is the skill-test-design skill).
argument-hint: '[test-id | skill-name | spec-name | tag | "all failing" ...]'
---

# Skill Test Troubleshooting

Diagnoses why a skill test is failing or flaky and applies the fix autonomously. The skill is designed to be safe to invoke from another agent in a loop, so it does not pause for confirmation between diagnosis and edit.

## Core Principle

**Test cases are the source of truth for the behavior the skill should exhibit.** When a test fails, the skill is to be brought in line with the test, not the other way around. The one exception is when the test itself is malformed (vague prompt, leading expectation, ambiguous assertion); in that case the test is the right thing to fix.

Order of preference when choosing what to edit:

1. **The test prompt** in the spec file. Tighten or front-load context.
2. **The test fixture**. Adjust starting filesystem state, fixture neutrality, or layered fixtures.
3. **The skill under test** (`SKILL.md`). Adjust the description, instructions, or examples.

Try the cheapest, most reversible fix first. Only move down the list when the diagnosis genuinely points there.

## When to Use

Use when the user wants something **repaired**:

- "Why does SU-1 keep failing?"
- "SU-1 keeps failing sometimes and passing other times. Figure out what's going on."
- "Fix the flaky report-card test."
- "Make the inventory test pass reliably."
- "Fix any failed tests from the last run."
- `/skill-test-troubleshooting SU-1`
- `/skill-test-troubleshooting --skill report-card`

## When NOT to Use

Hand off to another skill when the intent is something else:

| User intent                                        | Skill that owns it  |
| -------------------------------------------------- | ------------------- |
| "Run the tests" / "run the X tests"                | `skill-unit`        |
| "Show me the transcript" / "what was the verdict?" | `skill-unit`        |
| "Did the last run pass?" / "show recent runs"      | `skill-unit`        |
| "Write a test case for X" / "add tests"            | `skill-test-design` |
| "Design tests for X" / "create a spec file"        | `skill-test-design` |

If the user is asking to **look at** run data without asking for a fix, do not activate. Read-only inspection belongs to `skill-unit`.

## Process

The wrapper `${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh` resolves the `skill-unit` CLI from PATH or via `npx`. For brevity below, it is shortened to `run-cli.sh`.

### Step 1: Resolve the target

The user's target may be a specific test ID, a skill name, a spec name, a tag, a natural-language phrase ("all the failed ones", "any failed tests in the last run", "all the skill-test-design tests"), or no argument at all (treat as "everything failing in the latest run").

Use the skill-unit CLI for resolution. Never read `.workspace/runs/` files directly.

- A literal, well-formed test ID (e.g. `SU-1`) needs no lookup. Use it as-is.
- A literal full run timestamp (e.g. `2026-05-19-23-34-37`) needs no lookup.
- An ambiguous name (`report-card`, `csv`) → resolve with `run-cli.sh ls --search <term>`. The output lists matching specs and test IDs.
- Group-shaped phrases ("all failing in last run", "the failed ones") → use `run-cli.sh runs --limit 1 --failed-only` to find the latest failed run, then `run-cli.sh show <run-id> --failed-only` to enumerate failing test IDs in that run.

If nothing resolves, stop and tell the user. Do not pick a similar-sounding test and start editing it.

### Step 2: Gather diagnostic evidence

For each test ID under consideration, pull both the transcript and the grader output from the most recent failing run:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" transcript latest <test-id> --full
bash "${CLAUDE_PLUGIN_ROOT}/skills/skill-unit/scripts/run-cli.sh" grading latest <test-id> --full
```

`--full` is appropriate here. Diagnosis needs the actual turn-by-turn detail, not the summary.

**Never change directories. Invoke the CLI from your starting working directory**, the directory you were launched in (the one containing `skill-tests/`). Run history resolution is relative to the CLI's working directory, so `cd`-ing anywhere else (a parent directory, a wrapper script's location, any other path that looks like a project root) makes this project's runs invisible or, worse, points the CLI at a different project's run history entirely. If a path in an instruction or error message tempts you to `cd`, reference the file by its path instead and stay where you are.

If the wrapper script path is not accessible from your working directory, do not spend turns hunting for it. Call the CLI directly instead: `skill-unit <subcommand>`, or `npx skill-unit <subcommand>` if the bare command is not on PATH. The wrapper only does this resolution for you.

If the test has no recorded runs, do not guess. Either run it once via `run-cli.sh test --test <id>` to produce a fresh transcript, or stop and report that there is no history to diagnose. Pick "run it" when the user clearly wants the test fixed; pick "stop and report" if running the test would be slow or expensive and the user has not authorized it.

If the test has run history and the recent runs are **passing**, there is no failure to diagnose. Report that the test has not been failing, citing the runs you checked, and stop. Do not modify any files. The user calling a test "flaky" or "failing" is a claim to verify against the run history, not a fact to take on faith; when the history contradicts the claim, the history wins. Inventing a plausible defect to fix anyway is the worst outcome this skill can produce.

**Evidence gathering ends when you have the transcript and the grading output.** Those two artifacts are the diagnosis input; everything else (the spec file, the skill's SKILL.md) is read only to confirm a specific hypothesis the evidence already suggests. Do not keep listing directories, re-running lookups, or re-reading files you have seen. Once the evidence is in hand, move directly to Step 3, classify the failure, and act on the classification. An incomplete diagnosis delivered decisively beats a perfect diagnosis that never arrives.

### Step 3: Classify the failure mode

For the catalog of known failure modes and their canonical fixes, load `${CLAUDE_PLUGIN_ROOT}/skills/skill-test-troubleshooting/references/troubleshooting.md`. Add new modes there as they are discovered; the file is the long-lived reference.

In the transcript and grading output, look for these signals first:

| Symptom in transcript / grading                                                         | Likely cause                    | Default fix surface                                                |
| --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| No `Skill` tool call for the skill under test                                           | Skill did not activate          | Tighten the test prompt; if still failing, the skill's description |
| Agent burns turns on Bash/Glob/Explore with no useful output                            | Prompt too vague                | Front-load context in the test prompt                              |
| Grader reason mentions a specific token the prompt contained that leaked the answer     | Prompt leaks intent             | Reword the prompt to be natural and neutral                        |
| Grader reason mentions a specific fixture filename or comment that telegraphed the case | Fixture leaks intent            | Rename or rewrite the fixture file                                 |
| Test passes sometimes, fails sometimes, with no transcript-side difference              | Flakiness from prompt ambiguity | Tighten prompt (most common) before touching the skill             |
| Skill clearly activates, runs the right tool, but produces wrong output per the grader  | Skill bug                       | Edit the skill under test                                          |
| Failure mentions code under `src/`, a CLI flag that does not exist, a build issue       | Out-of-scope failure            | Stop and report; do not edit                                       |

### Step 4: Apply the fix

Modify exactly the file(s) the diagnosis identified. Do not "improve" adjacent content, do not refactor unrelated test cases, do not edit the skill when the test is the right surface. Keep the change minimal.

Allowed surfaces:

- Spec files in the project's test directory (default `skill-tests/`)
- Fixture files referenced by the affected test case
- The `SKILL.md` of the skill under test, when the diagnosis genuinely points there

Forbidden surfaces:

- Anything under `src/` or other project source code
- The skill-unit, skill-test-design, or skill-test-troubleshooting skills themselves
- The `.workspace/` directory
- Settings, configuration, or build files

When the user request implies a forbidden surface (e.g. the diagnosis is "the CLI is broken"), stop, report the diagnosis, and name what would need to change. Do not edit.

### Step 5: Report what changed

After applying fixes, summarize for the user (and any parent agent):

- The test ID(s) processed
- For each: the diagnosed failure mode, the file(s) edited, and a one-line rationale tying the edit to the diagnosis
- For each test that could not be fixed: why (out-of-scope failure, no run history, unknown ID, etc.)

The summary is the contract with the calling agent. A parent agent in a loop reads this output to decide whether to re-run the test.

## Hard Rules

These are non-negotiable. They exist because every one of them is a known way the skill goes wrong under pressure.

### Tests are the source of truth

Do **not** edit a test's expectations or prompt to match what the skill currently produces. If the test asserts behavior X and the skill produces behavior Y, the fix is to bring the skill to X. The only edits to the test itself are quality fixes: making a vague prompt more specific, removing leading content, narrowing an ambiguous expectation. Never align the test with buggy skill output.

### Never delete or weaken a test to make the suite green

Removing a test case, commenting it out, dropping expectations, or relaxing assertions so a failing test starts passing is never the fix. If the user explicitly asks for that, decline and offer to diagnose-and-fix instead.

### Never confirm before acting

This skill runs autonomously, including when called by another agent. Do not insert "want me to apply this?" prompts between diagnosis and edit. If something is too risky to do without confirmation, it is too risky for this skill. Stop and report instead.

### Prefer the test prompt over the skill

When the diagnosis could go either way (the test could be tighter OR the skill could be tweaked), edit the test prompt. Tightening prompts is cheaper, more reversible, and the most common real cause of flakiness. Only move to the skill when the test is already well-formed and the transcript clearly shows the skill misbehaving.

### Never read `.workspace/runs/` directly

All transcript and run-history access goes through the skill-unit CLI subcommands (`runs`, `show`, `transcript`, `grading`). Direct file reads under `.workspace/runs/` are forbidden. Use `--full` if you need the entire content.

## Quick Reference

| User says                                       | First CLI call                                         |
| ----------------------------------------------- | ------------------------------------------------------ |
| "Fix `<test-id>`"                               | `transcript latest <test-id> --full`                   |
| "Fix the flaky `<name>` test"                   | `ls --search <name>` to resolve, then `transcript ...` |
| "Fix any failed tests in the last run"          | `runs --limit 1 --failed-only`, then `show <id>`       |
| "Make the `<skill>` tests pass"                 | `ls --search <skill>` to resolve, then per-test pulls  |
| `/skill-test-troubleshooting` with no arguments | `runs --limit 1 --failed-only`                         |

## Common Mistakes

- **Editing the skill before reading the transcript.** Always pull the transcript first. Without it, every diagnosis is a guess.
- **Both editing the prompt AND the skill "to be safe."** Pick one based on the diagnosis. Double-fixes hide which change actually mattered.
- **Asking the user to choose between two fixes.** This skill is autonomous; choose based on the rule of thumb and act.
- **Treating "show me the transcript" as a fix request.** That is pure inspection, owned by `skill-unit`. Do not activate.
- **Renaming or moving test cases as part of a fix.** Test IDs are stable references in other agents' memories and the run history. Do not rename test cases unless that is genuinely the bug.

## Reference Material

- `references/troubleshooting.md`: long-form failure-mode catalog (skill did not activate, vague prompt, agent explores instead of acting, and more as discovered). Load this when classifying a failure mode you have not seen before.
