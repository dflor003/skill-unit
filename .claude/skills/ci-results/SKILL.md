---
name: ci-results
description: This skill should be used when looking up CI results for this repo, fetching workflow logs or artifacts, or investigating CI failures. Triggers include "did CI pass", "check the latest run", "why did CI fail", "show me the failed tests", "download the test artifact", "what's failing in CI", "look at the CI run", and "what does CI think". Also use proactively whenever you'd otherwise ask the user to paste CI output.
---

# CI Results Lookup

The `gh` CLI is allow-listed (`Bash(gh *)`). Use it directly. Don't ask the user to paste output you can fetch yourself — almost everything is one `gh` call away.

## Finding the run you want

The user usually won't hand over a run ID. Resolve it yourself.

| Need                              | Command                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Latest run on the current branch  | `gh run list --branch $(git branch --show-current) --limit 1 --json databaseId,conclusion,status,headSha,createdAt`       |
| Recent runs on the current branch | `gh run list --branch $(git branch --show-current) --limit 5 --json databaseId,displayTitle,conclusion,createdAt,headSha` |
| Run ID from a GitHub URL          | The digits after `/actions/runs/` are the ID                                                                              |
| Jobs in a run + their conclusions | `gh run view <id> --json jobs --jq '.jobs[] \| {name, conclusion, status}'`                                               |
| Per-step conclusions for one job  | `gh run view <id> --json jobs --jq '.jobs[] \| select(.name == "Skill-Unit Tests") \| .steps[] \| {name, conclusion}'`    |

When the user gives you a GitHub URL, extract the ID, but **also confirm it matches the latest run on the branch** if they've pushed since — they may be referring to an obsolete run without realizing it.

## Extracting test results from logs

The log step for the skill-unit run is large (~50KB) and ANSI-colored. Don't `cat` or read the full log directly; pipe through `grep` from the start.

| Need                       | Command                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Per-test pass/fail summary | <code>gh run view &lt;id&gt; --log-failed \| grep -aE "(✅\|❌\|✗\|Tests:) " \| head -60</code> |
| Just the failing tests     | <code>gh run view &lt;id&gt; --log-failed \| grep -aE "(❌\|✗) " \| head -30</code>             |
| Full log (last resort)     | `gh run view <id> --log` — only when `--log-failed` is empty                                    |

### Why these flags

- `grep -a` forces text mode. Without it, grep can mark the output as binary because of ANSI escape bytes and timestamps. The "Binary file (standard input) matches" message means you forgot `-a`.
- Anchor on the unicode markers (`✅` / `❌` / `✗`). The skill-unit reporter uses those consistently, so they're a reliable parse hook even with color codes interleaved.
- Prefer `--log-failed` over `--log`. The former skips the giant setup-and-teardown noise. Only fall back to `--log` if `--log-failed` is empty (cancelled job, infra failure before tests ran).

### The shape of a passing/failing summary

The skill-unit job prints a final summary that looks like:

```
PASS  skill-unit > runner
  ✅ SU-1 Runs Tests and Produces a Report (6/6)  35.6s
  ❌ SU-2 Activates Via Slash Command (3/5)  108.3s
    ✗ Begins executing test prompts
...
Tests:     ✅ 19 passed  ❌ 2 failed  21 total
Duration:  131.7s
Cost:      $0.7863
Tokens:    3,397,738
```

Per-test lines start with `✅` or `❌`; failing-expectation lines start with `✗`. Grep on those, you get the picture in 5 lines.

## Artifacts

The `skill-unit-results` artifact contains the actual `.workspace/runs/<timestamp>/results/` directory — per-test transcripts, grader transcripts, results JSON. **This is the only way to see what the agent and grader actually did during the run.** The GitHub web UI doesn't expose it.

| Need                          | Command                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| List artifacts                | `gh api repos/<owner>/<repo>/actions/runs/<id>/artifacts --jq '.artifacts[] \| {name, id, expired}'` |
| Owner/repo from current dir   | `gh repo view --json owner,name --jq '.owner.login + "/" + .name'`                                   |
| Download `skill-unit-results` | `gh run download <id> --name skill-unit-results --dir /tmp/su-results`                               |

**Retention is 14 days** (`.github/workflows/ci.yml` sets `retention-days: 14`). After that, `gh run download` returns `no valid artifacts found to download`. **Pull the artifact early in any investigation**, even before you think you need it, since an investigation that takes a few days can age out the only source of truth.

After downloading, the layout is `.workspace/runs/<timestamp>/results/<spec>.<test-id>.transcript.md` (agent transcript), `.grader-transcript.md` (grader's reasoning), and `.results.json` (per-expectation verdicts).

## Workflows in this repo

Three workflows live in `.github/workflows/`. Read the YAML directly to confirm details — do not ask the user.

| Workflow              | Trigger                                             | What it runs                                                 | Cost / gating                                    |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| `ci.yml`              | `pull_request`, `push` to main, `workflow_dispatch` | Two jobs (see below)                                         | Build & Test is free; Skill-Unit Tests is opt-in |
| `publish-next.yml`    | `push` to main                                      | typecheck, test, build, then `npm publish --tag next` to npm | Publishes a pre-release tag on every main push   |
| `publish-release.yml` | GitHub release published                            | Same as above but `npm publish` (latest tag)                 | Tied to release publication                      |

### `ci.yml` jobs

1. **`Build & Test`** — matrix over Node 22/24/25. Steps: `npm ci`, typecheck, format check, lint, `test:coverage` (vitest), build. Free. Runs on every PR and push. If your change is lint/typecheck/unit-test scope, this is the only job that matters.
2. **`Skill-Unit Tests`** — runs `npm run test:skills`, which executes the spec files using a real Anthropic API key (`CLAUDE_CODE_OAUTH_TOKEN`). **Costs API tokens (~$0.5–$1.5 per run).** Gated:
   - PR-triggered run requires the `run-skill-tests` label on the PR.
   - Manual run via `gh workflow run CI -f run-skill-tests=true`.
   - A bare push to the branch does **not** trigger it. The user has to apply the label or dispatch.

Don't push trivial tweaks just to "see what CI thinks" of the skill tests — every run costs money. When iterating on skill behavior, prefer `npm run su -- test --test <ID>` locally first.

## Common gotchas

- **`--log-failed` returning "Binary file (standard input) matches"** when piped to grep: add `-a` (force text). The timestamps look like binary to grep's heuristic.
- **The skill-unit job's failures can be flaky** because the agent under test is a nondeterministic model (whichever `runner.model` is set in `.skill-unit.yml`; do not assume a specific one). Before declaring a real regression, re-run the failing test locally: `npm run su -- test --test <ID>`. Local should match CI in pass/fail most of the time; if local consistently passes and CI consistently fails, it's the spec design (often expectation strictness vs. the model's response style) rather than a code bug.
- **Don't `gh run rerun <id>`** the Skill-Unit Tests job to "see if it stabilizes" without confirming with the user first — every rerun costs tokens.
- **The artifact name is `skill-unit-results`**, exactly. Not `skill-unit-tests` or `test-results`. `gh run download <id>` with no `--name` will fail if other artifacts also exist; use `--name` explicitly.
- **`gh run view <id>` without `--log` or `--log-failed`** shows a high-level summary that does NOT include test results. The summary lives in the step log, not the run metadata.
- **The `dorny/test-reporter` step's GitHub Checks output** is an alternative source for failing-test names — check it via `gh pr checks` or the PR's Checks tab in the web UI. But for failure _reasons_, you still need the log.

## When not to use this skill

- For unit-test or typecheck failures that didn't run in CI, run them locally instead (`npm run test`, `npm run typecheck`). CI doesn't give you anything new.
- For investigating why a _local_ skill-unit test failed, use `skill-unit` skill's troubleshooting subcommands (`runs`, `show`, `grading`, `transcript`) instead — they're faster and read directly from `.workspace/runs/`.
