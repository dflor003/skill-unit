# Spec File Format Reference

## Overview

A `*.spec.md` file defines a test suite for a skill. Each file contains:

- A YAML frontmatter block with shared configuration for the suite
- One or more test cases defined by `###` headings

The file extension is always `.spec.md` — it is not configurable. Test files are discovered recursively under the configured test directory (default: `tests/`).

---

## Frontmatter Fields

Frontmatter is a YAML block delimited by `---` at the top of the file.

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Human-readable name for the test suite. Shown in results output. |
| `skill` | No | string | Skill being tested. Informational — not used for filtering or execution. |
| `tags` | No | list | Tags for filtering test runs (e.g., `[happy-path, slash-command]`). |
| `timeout` | No | duration | Per-test timeout for this suite. Overrides the global default from `.skill-unit.yml`. Example: `90s`. |
| `fixtures` | No | path | Path to a fixture folder. Copied into the working directory before tests run. Relative paths are resolved from the spec file's directory. |
| `setup` | No | filename | Script to run before the test cases in this file execute. Overrides the global default. |
| `teardown` | No | filename | Script to run after all test cases in this file have run. Runs even if tests fail. |
| `allowed-tools` | No | list | Fully replaces the resolved allowed tools list from global config. |
| `disallowed-tools` | No | list | Fully replaces the resolved disallowed tools list from global config. |
| `allowed-tools-extra` | No | list | Adds entries to the resolved allowed tools list (union). Ignored if `allowed-tools` is also present. |
| `disallowed-tools-extra` | No | list | Adds entries to the resolved disallowed tools list (union). Ignored if `disallowed-tools` is also present. |

### Tool Permissions

Test sessions run with `--permission-mode dontAsk` — only explicitly allowed tools work. The framework resolves tool lists through a three-level chain:

1. **Built-in defaults:** `allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, Skill]`, `disallowed = [AskUserQuestion]`
2. **`.skill-unit.yml`:** `runner.allowed-tools` and `runner.disallowed-tools` fully replace the built-in lists when present.
3. **Spec frontmatter:** `allowed-tools` / `disallowed-tools` fully replace the resolved global lists. `allowed-tools-extra` / `disallowed-tools-extra` add to them instead. If both the full and `-extra` variant are present, the full variant wins.

If a tool appears in both the final allowed and disallowed lists, **disallow wins**.

File tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`) are automatically scoped to the workspace directory at runtime — the test agent cannot access files outside its workspace.

**Example — add Docker access for a specific suite:**

```yaml
---
name: docker-skill-tests
skill: docker-manager
allowed-tools-extra:
  - "Bash(docker *)"
disallowed-tools-extra:
  - "Bash(rm -rf *)"
---
```

**Example — fully custom tool set:**

```yaml
---
name: readonly-skill-tests
skill: analyzer
allowed-tools:
  - Read
  - Glob
  - Grep
disallowed-tools:
  - AskUserQuestion
  - Bash
  - Write
  - Edit
---
```

---

## Test Case Structure

Each test case is introduced by a `###` heading and contains three parts: a prompt, expectations, and optional negative expectations.

### Heading Format

```
### {ID}: {name}
```

- **ID** — everything before the colon. Used in results output and filtering. Convention: short uppercase prefix + number (e.g., `COM-1`, `BRN-3`).
- **name** — everything after the colon (trimmed). A short descriptive label.

### Prompt

The prompt is a blockquote directly below the `**Prompt:**` label:

```markdown
**Prompt:**
> The text of the prompt sent to the isolated CLI session.
```

Multi-line prompts use continued blockquote lines:

```markdown
**Prompt:**
> First line of the prompt.
> Second line of the prompt.
```

The prompt is passed verbatim to the isolated CLI session. It must read as a genuine user request — no test metadata, no skill names, no hints.

### Expectations

A bullet list directly below the `**Expectations:**` label. Each bullet is one independently verifiable outcome:

```markdown
**Expectations:**
- Outcome A was observable in the response
- Outcome B occurred
- The agent informed the user of X
```

All expectations must pass for the test case to pass.

### Negative Expectations

An optional bullet list directly below the `**Negative Expectations:**` label. Each bullet is a behavior that must NOT have occurred:

```markdown
**Negative Expectations:**
- Did not do X
- Did not invoke Y
```

All negative expectations must pass (i.e., none of the listed behaviors occurred) for the test case to pass.

---

## Parsing Rules

- Test cases are delimited by `###` headings. Everything between two `###` headings belongs to the first heading's test case.
- The ID is everything before the first colon in the heading text. The name is everything after (trimmed of whitespace).
- The prompt is the content of the blockquote immediately following `**Prompt:**`. Leading `> ` markers are stripped.
- Expectations are parsed as a bullet list immediately following `**Expectations:**`.
- Negative expectations are parsed as a bullet list immediately following `**Negative Expectations:**`. This section is optional.
- Horizontal rules (`---`) between test cases are optional and cosmetic — they are not parsed.
- File extension is always `*.spec.md` — this is not configurable.

---

## Complete Example

```markdown
---
name: commit-skill-tests
skill: commit
tags: [slash-command, git]
timeout: 60s
fixtures: ./fixtures/basic-repo
setup: setup.sh
teardown: teardown.sh
---

### COM-1: basic-commit

**Prompt:**
> Create a commit for the staged changes

**Expectations:**
- Ran `git commit`
- Commit message references the nature of the changes
- No files left in a dirty state after the commit

**Negative Expectations:**
- Did not run `git push`
- Did not amend an existing commit

---

### COM-2: nothing-to-commit

**Prompt:**
> Commit my changes

**Expectations:**
- Agent detected there was nothing to commit
- Informed the user clearly that there was nothing to stage or commit

**Negative Expectations:**
- Did not create an empty commit
- Did not fabricate or stage any changes
```

---

## Writing Good Expectations

**Describe observable outcomes, not implementation details.**

Good: "Commit message references the nature of the changes"
Avoid: "Called `git commit -m` with a message"

The grader reads the agent's response and decides whether each expectation was met. Expectations phrased as observable outcomes give the grader clear criteria. Implementation-detail assertions are fragile and may fail when the behavior is correct but the tool invocation differs.

**Make each expectation independently verifiable.**

Each bullet should check exactly one thing. Do not combine multiple checks into one expectation — if a combined expectation fails, you will not know which condition was unmet.

Good:
```
- Commit message is present and non-empty
- Commit message references the nature of the changes
```

Avoid:
```
- Commit message is present, non-empty, and references the nature of the changes
```

**Cover the failure modes too.**

Negative expectations document behaviors that must not occur. Use them to confirm the agent did not take a dangerous, incorrect, or out-of-scope action alongside the correct behavior.

---

## Writing Good Prompts

**Write from the human perspective.**

Prompts should read as something a real user would type. Users do not say "use the commit skill" or "invoke /commit" — they say "commit my changes" or "make a commit."

**Be vague and natural.**

Real users rarely provide precise specifications. Vague prompts test whether the skill correctly interprets intent rather than mechanically matching keywords.

Good: "commit my changes"
Avoid: "run git commit with a descriptive message for the staged files"

**Do not include skill names or hints.**

If the prompt contains the skill name, you are testing keyword matching rather than intent recognition.

**Include realistic variation.**

Vary phrasing across test cases. Include typos, casual phrasing, and abbreviated requests where realistic. This validates robustness across natural language variation.

**Do not lead the agent.**

The isolated CLI session has no access to expected outcomes. If the prompt implies the expected answer, you are contaminating the test rather than measuring skill performance.
