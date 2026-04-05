# Retry, Confidence Scoring & Cost Tracking — Design Spec

## Overview

This spec extends Skill Unit with three capabilities that address non-determinism and cost visibility in AI agent testing:

1. **Retry system** — configurable per-test-case re-execution to absorb LLM non-determinism.
2. **Confidence scoring** — replaces binary pass/fail with a pass/fail status plus a confidence fraction that surfaces how consistently a test passes across attempts.
3. **Cost tracking** — per-test-case usage extraction from the CLI runner's JSON output, aggregated into results and the run summary.

These are additive changes to the Phase 1 architecture. The two-role model (evaluator + isolated CLI session), inline grading, and CLI runner approach are unchanged.

## Problem

LLM responses are non-deterministic. The same prompt executed twice can produce different behavior, causing test results to flip between runs. Industry data shows teams experience ~50% false-red CI builds from non-determinism alone. Binary pass/fail with a single execution provides no signal about whether a failure is a genuine regression or a flaky response.

Additionally, each test case spawns an isolated CLI session with real token costs. As test suites grow and retries multiply, users need visibility into cost per test case and per run to manage budgets and catch runaway tests.

## Design

### Configuration Surface

Two layers: framework defaults in `.skill-unit.yml` and per-spec overrides in frontmatter.

**`.skill-unit.yml` additions:**

```yaml
# Retry & confidence settings
attempts: 3                # max times to run each test case
pass-threshold: 2          # minimum passing attempts to consider "pass"
retry-strategy: early-exit # "early-exit" | "full"
```

**Per-spec frontmatter override:**

```yaml
---
name: commit-skill-tests
skill: commit
attempts: 5
pass-threshold: 4
retry-strategy: full
---
```

Spec-level values completely replace the framework defaults for that spec file — no merging. "What you see is what you get."

**Defaults when nothing is configured:** `attempts: 1`, `pass-threshold: 1`, `retry-strategy: early-exit`. This preserves backward compatibility — existing specs run once with binary pass/fail, identical to current behavior.

### Resolution Order

1. Spec file frontmatter (highest priority)
2. `.skill-unit.yml` at repo root
3. Built-in defaults: `attempts: 1`, `pass-threshold: 1`, `retry-strategy: early-exit`

### Retry Strategy

Two modes:

- **`early-exit`** (default) — stop as soon as the result is statistically determined. Two exit conditions:
  - *Success:* `attempts_passed >= pass-threshold` — no need to keep going.
  - *Futility:* Even if every remaining attempt passes, can't reach `pass-threshold` — fail fast.
- **`full`** — always run all attempts regardless. Produces complete confidence data for every test case. Useful for CI trend analysis, costly for interactive use.

### Execution Flow Change

The current Phase 1 flow is: for each test case, run once, grade inline. With retries, the per-test-case loop becomes:

```
For each test case:
  1. attempts_passed = 0, attempts_run = 0, attempt_results = []
  2. Loop up to `attempts` times:
     a. Execute prompt via CLI runner (--output-format json)
     b. Parse JSON response: extract `result` (for grading) and usage metadata (for cost)
     c. Grade the response inline: pass/fail per expectation
     d. Record attempt result (pass/fail, rationale, usage data)
     e. attempts_run++
     f. If pass: attempts_passed++
     g. Early-exit check (if strategy is "early-exit"):
        - If attempts_passed >= pass-threshold → stop (confident pass)
        - If (attempts - attempts_run) + attempts_passed < pass-threshold → stop (futile)
  3. Final status: pass if attempts_passed >= pass-threshold, else fail
  4. Final confidence: attempts_passed / attempts_run
```

The evaluator grades each attempt immediately after execution, keeping context bounded to one response at a time. The attempt loop and early-exit logic are entirely within the evaluator.

### Confidence Scoring

Every test case gets a status (pass/fail) plus a confidence fraction:

- **Fraction:** `attempts_passed / attempts_run` — e.g., `2/3`
- **Percentage:** derived from the fraction — e.g., `67%`

The fraction reveals early exit: `2/2 (100%)` means two ran and both passed (third skipped), while `3/3 (100%)` means all three ran. This distinction matters for diagnosing test stability.

**Per-expectation confidence:** Each individual expectation also tracks its pass rate across attempts. A test case might pass overall but have one expectation that's shaky (e.g., passes 2/3 while others pass 3/3). This pinpoints which expectation is flaky.

### Cost Tracking

The CLI runner's `--output-format json` provides rich usage data per test execution:

```json
{
  "total_cost_usd": 0.0608795,
  "duration_ms": 2137,
  "duration_api_ms": 2128,
  "num_turns": 1,
  "usage": {
    "input_tokens": 2,
    "output_tokens": 5,
    "cache_creation_input_tokens": 8696,
    "cache_read_input_tokens": 12789
  }
}
```

The evaluator extracts this metadata from each CLI invocation and aggregates it. No estimation or price tables — real cost from the runner.

**Runner config change:** The evaluator internally uses `--output-format json` regardless of the user's configured args, since it needs both the response text (from the `result` field) and the usage metadata. If the user's `args` in `.skill-unit.yml` include an `--output-format` flag, the evaluator strips it before appending `--output-format json`. The user's `output.format` setting controls the *results presentation*, not the runner invocation format.

**What gets tracked per test case:**

| Field | Source |
|-------|--------|
| `total_cost_usd` | JSON response root |
| `input_tokens` | `usage.input_tokens` |
| `output_tokens` | `usage.output_tokens` |
| `cache_read_tokens` | `usage.cache_read_input_tokens` |
| `duration_ms` | JSON response root |
| `num_turns` | JSON response root |

When a test case has multiple attempts, these values are summed across attempts.

**Harness-agnostic note:** The JSON fields above are specific to harnesses that output structured usage data. Harnesses that don't provide usage metadata in their CLI output will simply have empty cost fields in the results. The evaluator should handle missing fields gracefully — cost tracking is best-effort, not required for grading.

### Results Format Changes

**Per-test-case result (single attempt / attempts: 1):**

```markdown
## COM-1: basic-commit — PASS

**Prompt:**
> Create a commit for the staged changes

**Expectations:**
- ✓ Ran `git commit`
- ✓ Commit message references the nature of the changes

**Usage:** $0.12 | 1,240 tokens (in: 980, out: 260) | 4.2s | 3 turns
```

**Per-test-case result (multiple attempts):**

```markdown
## COM-3: nothing-to-commit — PASS (2/3, 67%)

**Prompt:**
> Commit my changes

**Expectations:**
- ✓ Agent detected there was nothing to commit (3/3)
- ✓ Informed the user clearly (2/3)

**Negative Expectations:**
- ✓ Did not create an empty commit (3/3)

**Attempts:**
1. PASS — $0.08 | 980 tokens | 3.1s | 2 turns
2. FAIL — $0.14 | 1,420 tokens | 5.8s | 4 turns
   → "Informed the user clearly" not met: agent silently exited without messaging
3. PASS — $0.09 | 1,050 tokens | 3.4s | 2 turns

**Usage (total):** $0.31 | 3,450 tokens | 12.3s
```

Key formatting rules:
- Single-attempt tests show no confidence fraction (backward compatible with current format).
- Multi-attempt tests show confidence in the header: `PASS (2/3, 67%)`.
- Per-expectation confidence shown in parentheses only when `attempts > 1`.
- Skipped attempts (early exit) are not listed — the fraction makes it clear (2/2 means third was skipped).
- Failed attempts expand with the reason; passing attempts show usage only.
- Usage summary aggregates across all attempts.

### Summary Format Changes

```
## Test Run: 2026-04-03 14:30
⏱ 92s | 8 passed | 1 failed | 1 low-confidence

📁 skill-tests/commit/
  📄 commit-basics.spec.md (5 passed, 1 failed)
    ✅ COM-1: basic-commit (3/3, 2/2) — $0.36
    ✅ COM-2: vague-commit-request (3/3, 1/1) — $0.28
    ❌ COM-3: nothing-to-commit (1/3, 67%)
       ✗ Informed the user clearly (1/3)
         → Agent silently exited without messaging
    ✅ COM-4: multifile-commit (2/2, 1/1) — $0.45
    ✅ COM-5: merge-conflict-staged (2/2, 2/2) — $0.52

💰 Total cost: $4.82 | 45,200 tokens | 42 turns
```

- **"low-confidence"** flags any passing test where confidence is below 100%. This label appears in the top-line count to draw attention without blocking the run.
- Per-test cost shown inline for quick identification of expensive tests.
- Run-total cost, tokens, and turns at the bottom.

### CI Gating

For CI pipelines that need a go/no-go exit code:

**`.skill-unit.yml` additions:**

```yaml
ci:
  min-confidence: 67%          # tests below this are "fail" for CI purposes
  fail-on-low-confidence: true # false = warn only (exit 0), true = exit 1
```

Behavior:
- A test at `3/3 (100%)` — passes CI.
- A test at `2/3 (67%)` with `min-confidence: 67%` — passes CI.
- A test at `1/3 (33%)` with `min-confidence: 67%` — fails CI.
- With `fail-on-low-confidence: false`, low-confidence tests produce warnings but don't affect the exit code.

CI settings only affect the exit code and summary messaging. They do not change how tests are executed or graded.

## Impact on Existing Spec

These changes are additive to the Phase 1 spec. Specifically:

- **Config:** New fields in `.skill-unit.yml` (`attempts`, `pass-threshold`, `retry-strategy`, `ci`). All optional with backward-compatible defaults.
- **Spec format:** New optional frontmatter fields (`attempts`, `pass-threshold`, `retry-strategy`). Existing specs are unaffected.
- **Execution flow:** The per-test-case loop gains an inner attempt loop. Grading remains inline.
- **Runner args:** The evaluator forces `--output-format json` internally. This is transparent to the user.
- **Results format:** Gains confidence fractions, attempt details, and usage data. Single-attempt results remain visually identical to the current format.
- **Summary format:** Gains cost totals and low-confidence count.

## Phasing

This spec is designed for Phase 1 inclusion. However, if scope pressure requires it, the minimum viable slice is:

- **Must have:** `attempts`, `pass-threshold`, `retry-strategy` config + early-exit logic + confidence in results.
- **Can defer:** CI gating config, per-expectation confidence tracking, cost tracking (depends only on using `--output-format json`).
