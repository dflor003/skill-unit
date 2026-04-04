# Grader Delegation & Transcript-Based Evaluation

## Overview

Replace the evaluator's inline grading with per-test-case grader agent delegation. The grader reads the full conversation transcript (`.transcript.md`) instead of the abbreviated final response, eliminating false negatives caused by evaluating only the agent's last message. A deterministic Node.js report script assembles a consolidated report from individual grading results.

## Problem

The current evaluator grades responses inline by reading the final response text from `responses.json`. This text captures only the agent's last message — it misses:

- **Tool calls** the agent attempted (e.g., tried to write a file but was blocked)
- **Tool results** the agent received (e.g., it did read the SKILL.md even if the final response doesn't mention it)
- **Multi-turn reasoning** showing whether the agent followed the right process

This produces false negatives: test cases where the agent did the right thing but the grading input didn't capture it. Additionally, inline grading pollutes the evaluator's context with response data, degrading quality as more tests are processed.

## Design

### Grader Agent Delegation

The evaluator dispatches the `grader` agent (defined in `agents/grader.md`) once per test case. The grader agent prompt is self-contained — it includes all grading logic, transcript format understanding, grading standards, and output format specification. This keeps the evaluator's dispatch lightweight and makes the grader independently testable.

#### Dispatch Contract

The evaluator passes to each grader:

- **Inline:** test ID, test name, original prompt, expectations (bullet list), negative expectations (bullet list)
- **Paths:** transcript file to `Read`, output file to `Write`

The evaluator does not read transcripts or response data itself. It parses specs (small), dispatches graders (short prompts), and reads the final report (one file).

#### Concurrency

Graders are dispatched in batches of up to `grader-concurrency` (configurable in `.skill-unit.yml`, default 5). The evaluator waits for each batch to complete before dispatching the next. This prevents unbounded API cost or rate limit spikes.

```yaml
# .skill-unit.yml
execution:
  timeout: 120s
  grader-concurrency: 5
```

#### Grader Agent Prompt

The `agents/grader.md` prompt is rewritten to be fully self-contained:

1. **Role** — strict, objective test grader
2. **Input contract** — what it receives (test metadata inline, transcript path, output path)
3. **Transcript format** — how to read `.transcript.md` files: turns, tool calls with JSON inputs, tool results, assistant text. Evaluate the full behavioral trajectory, not just the final message.
4. **Grading process** — MET/NOT MET logic for expectations, PASSES/FAILS logic for negative expectations, pass/fail rollup (a test case passes only if ALL expectations met AND ALL negative expectations pass)
5. **Grading standards** — strict, literal, based on observable behavior across the entire transcript. Specific failure reasons required.
6. **Output format** — the exact markdown structure to write to the results file

### Transcript as Primary Evidence

The runner writes conversation transcripts to `results/` as `.transcript.md` files (renamed from `.log.md`, moved from `logs/`). These are the primary grading input.

The transcript format is unchanged from the current `.log.md` — it already captures:

```markdown
# Transcript: {test-id}

**Prompt:** {original prompt}

---

**Model:** {model}
**Skills:** {discovered skills}
**CWD:** {workspace path}

---

## Turn N -- Assistant

{assistant text}

**Tool call:** `{tool name}`
```json
{tool input}
```

**Tool result:**
```
{tool output}
```

---

**Result:** {success|error}
```

#### Changes to `runner.js`

- Write `.transcript.md` files to `.workspace/runs/{ts}/results/` instead of `.log.md` files to `.workspace/runs/{ts}/logs/`
- Update the internal heading from `# Test Log:` to `# Transcript:`
- The `.log.jsonl` raw stream-json files remain in `logs/` as debug artifacts
- `responses.json` continues to be written (used for progress polling), but is no longer the grading input

### Consolidated Report Script

A Node.js script (`scripts/report.js`) generates a single `report.md` from all individual grader results files. No AI involved — deterministic parsing and template assembly.

#### Invocation

```bash
node ${CLAUDE_SKILL_DIR}/scripts/report.js .workspace/runs/{timestamp}
```

#### Process

1. Glob all `results/{spec-name}.{test-id}.results.md` files in the run directory
2. Parse each — extract test ID, name, pass/fail status, expectation lines, failure reasons
3. Group results by spec name (prefix before the first `.{test-id}`)
4. Generate `results/report.md`:
   - **Header:** timestamp, total passed/failed counts
   - **Per-spec sections:** spec name, pass/fail rollup
   - **Passing tests:** one line each (collapsed)
   - **Failing tests:** `<details>` block with full grading, failure reasons
   - **Relative links:** each test case links to its `.results.md` (grading) and `.transcript.md` (conversation)
5. Write report and print path to stdout

#### CI Usage

The same `report.md` works for `$GITHUB_STEP_SUMMARY` — `<details>` blocks render natively in GitHub markdown. The report is self-contained; relative links are supplementary for local browsing. The full `.workspace/runs/{timestamp}/` directory gets uploaded as a single artifact for drill-down.

### Updated Evaluator Flow

Steps 1-3 and 4a-4c are unchanged. Changes:

**Step 4d (replaced):** Dispatch grader agents.
- Collect all test cases from the current spec (already parsed in 4a)
- Dispatch grader agents in batches of up to `grader-concurrency`
- Each grader receives: test metadata inline, transcript path to read, output path to write
- Wait for each batch to complete before dispatching the next

**Step 4e (removed):** Eliminated — each grader writes its own results file.

**Step 5 (replaced):** Run report script and present.
- Invoke `node ${CLAUDE_SKILL_DIR}/scripts/report.js .workspace/runs/{timestamp}`
- Read the generated `results/report.md`
- Present content to the user

**SKILL.md `allowed-tools`** updated to include:
```
Bash(node ${CLAUDE_SKILL_DIR}/scripts/report.js *)
```

### Updated Workspace Structure

```
.workspace/
  runs/{timestamp}/
    manifests/
      {spec-name}.manifest.json            # input manifest (unchanged)
      {spec-name}.progress.json            # real-time progress (unchanged)
    logs/
      {spec-name}.{test-id}.log.jsonl      # raw stream-json debug artifact (unchanged)
    responses/
      {spec-name}.responses.json           # abbreviated responses (unchanged)
    results/
      {spec-name}.{test-id}.transcript.md  # conversation transcript (from runner)
      {spec-name}.{test-id}.results.md     # grader evaluation (from grader agent)
      report.md                            # consolidated report (from report script)
  workspaces/{uuid}/                       # ephemeral per test case (unchanged)
    work/
    plugin/
```

## Files Changed

| File | Change |
|------|--------|
| `agents/grader.md` | Rewritten — self-contained grading logic, transcript-aware prompt |
| `skills/skill-unit/SKILL.md` | Updated steps 4d, 4e, 5; added report script to allowed-tools |
| `skills/skill-unit/scripts/runner.js` | Write `.transcript.md` to `results/` instead of `.log.md` to `logs/` |
| `skills/skill-unit/scripts/report.js` | New — consolidated report generation |
| `skills/skill-unit/templates/.skill-unit.yml` | Add `grader-concurrency` field |
| `docs/architecture/workspaces.md` | Updated structure and artifact descriptions |
| `docs/architecture/test-execution.md` | Updated to reference grader delegation |
