# Tool Permissions for Test Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `--dangerously-skip-permissions` with a configurable, least-privilege tool permission system that scopes file tools to the workspace directory.

**Architecture:** Three-level resolution chain (built-in defaults → `.skill-unit.yml` → spec frontmatter) resolved by the evaluator (SKILL.md), written into the manifest, consumed by runner.js which applies workspace path scoping and maps to CLI flags.

**Tech Stack:** Node.js (runner.js), Markdown (SKILL.md, spec-format.md), YAML (.skill-unit.yml)

**Spec:** `docs/specs/2026-04-04-tool-permissions-design.md`

---

### Task 1: Update runner.js — Add scopeToolsToWorkspace helper

**Files:**
- Modify: `skills/skill-unit/scripts/runner.js:30-48` (after TOOL_PROFILES)

- [ ] **Step 1: Add the FILE_TOOLS constant and scopeToolsToWorkspace function**

Add after line 48 (after the `TOOL_PROFILES` closing brace):

```js
// -- Workspace path scoping for file tools ----------------------------------

const FILE_TOOLS = new Set(["Read", "Write", "Edit", "Glob", "Grep"]);

// Rewrite bare file tool names to include workspace path restrictions.
// Tools with existing path patterns (e.g., "Read(/some/path/**)") pass through unchanged.
function scopeToolsToWorkspace(allowedTools, workspacePath) {
  return allowedTools.map((tool) => {
    if (FILE_TOOLS.has(tool)) {
      return `${tool}(${workspacePath}/**)`;
    }
    return tool;
  });
}
```

- [ ] **Step 2: Verify the script still parses**

Run: `node -c skills/skill-unit/scripts/runner.js`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/scripts/runner.js
git commit -m "feat(runner): add scopeToolsToWorkspace helper for file tool path scoping"
```

---

### Task 2: Update runner.js — Change TOOL_PROFILES signature and replace --dangerously-skip-permissions

**Files:**
- Modify: `skills/skill-unit/scripts/runner.js:33-48` (TOOL_PROFILES object)

- [ ] **Step 1: Update the claude profile to accept allowedTools and disallowedTools**

Replace the existing `TOOL_PROFILES` object (lines 33-48) with:

```js
const TOOL_PROFILES = {
  claude: (model, maxTurns, pluginDir, allowedTools, disallowedTools) => [
    "--print",
    "--verbose",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--max-turns", String(maxTurns),
    "--permission-mode", "dontAsk",
    ...(allowedTools.length ? ["--allowedTools", ...allowedTools] : []),
    ...(disallowedTools.length ? ["--disallowedTools", ...disallowedTools] : []),
    "--no-chrome",
    "--no-session-persistence",
    "--setting-sources", "project",
    "--strict-mcp-config",
    ...(model ? ["--model", model] : []),
    ...(pluginDir ? ["--plugin-dir", pluginDir] : []),
  ],
  // Future: add copilot, codex profiles here
};
```

Key changes:
- Signature gains `allowedTools` and `disallowedTools` parameters
- `--dangerously-skip-permissions` replaced with `--permission-mode dontAsk`
- `--allowedTools` and `--disallowedTools` flags added conditionally

- [ ] **Step 2: Verify the script still parses**

Run: `node -c skills/skill-unit/scripts/runner.js`
Expected: No output (clean parse)

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/scripts/runner.js
git commit -m "feat(runner): replace --dangerously-skip-permissions with --permission-mode dontAsk and tool flags"
```

---

### Task 3: Update runner.js — Read tool lists from manifest and wire into execution

**Files:**
- Modify: `skills/skill-unit/scripts/runner.js:73-83` (manifest destructuring)
- Modify: `skills/skill-unit/scripts/runner.js:96-114` (runner resolution and CLI arg building)
- Modify: `skills/skill-unit/scripts/runner.js:410-411` (cmdArgs building in main)
- Modify: `skills/skill-unit/scripts/runner.js:460-466` (per-test-case CLI invocation)

- [ ] **Step 1: Add allowed-tools and disallowed-tools to manifest destructuring**

At line 73, the manifest is destructured. Add the two new fields:

```js
const {
  "spec-name": specName,
  "fixture-path": rawFixturePath,
  "skill-path": rawSkillPath,
  "spec-dir": rawSpecDir,
  timestamp,
  timeout: timeoutStr,
  runner,
  "test-cases": testCases,
} = manifest;
```

After the runner resolution block (around line 98), add:

```js
const allowedTools = runner["allowed-tools"] || [];
const disallowedTools = runner["disallowed-tools"] || [];
```

Add logging after the existing log block (around line 114):

```js
log(`Allowed tools: ${allowedTools.length ? allowedTools.join(", ") : "(none — using dangerously-skip-permissions fallback)"}`);
log(`Disallowed tools: ${disallowedTools.length ? disallowedTools.join(", ") : "(none)"}`);
```

- [ ] **Step 2: Move CLI arg building into the per-test-case loop and apply path scoping**

Currently at line 411, `cmdArgs` is built once before the loop:

```js
const cmdArgs = buildArgs(model, maxTurns, pluginDir);
```

Replace this with building args per test case inside the loop. At line 411, remove the existing `cmdArgs` line and the log line after it.

Inside the test case loop (after workspace creation, around line 445), add:

```js
    // Scope file tools to this test case's workspace path
    const scopedAllowed = scopeToolsToWorkspace(allowedTools, workspacePath);
    const cmdArgs = buildArgs(model, maxTurns, pluginDir, scopedAllowed, disallowedTools);
```

Move the CLI args log line into the loop as well (it now varies per test case):

```js
    log(`[${i + 1}/${testCases.length}] ${testId}: CLI args: ${tool} ${cmdArgs.join(" ")}`);
```

- [ ] **Step 3: Verify the script still parses**

Run: `node -c skills/skill-unit/scripts/runner.js`
Expected: No output (clean parse)

- [ ] **Step 4: Commit**

```bash
git add skills/skill-unit/scripts/runner.js
git commit -m "feat(runner): read tool permission lists from manifest and scope file tools per workspace"
```

---

### Task 4: Update SKILL.md — Add tool permission resolution to evaluator instructions

**Files:**
- Modify: `skills/skill-unit/SKILL.md:30-48` (Step 2: Load Configuration)
- Modify: `skills/skill-unit/SKILL.md:80-101` (Step 4b: Write Manifest)

- [ ] **Step 1: Update Step 2 (Load Configuration) to document built-in defaults and resolution**

After the existing defaults YAML block in Step 2 (line 48), add a new subsection:

```markdown
#### Tool Permission Defaults

The runner uses `--permission-mode dontAsk` with explicit tool allowlists instead of `--dangerously-skip-permissions`. Built-in defaults (used when `.skill-unit.yml` omits these fields):

```yaml
runner:
  allowed-tools:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
    - Agent
  disallowed-tools:
    - AskUserQuestion
```

If `.skill-unit.yml` specifies `runner.allowed-tools`, it fully replaces the built-in allowed list. Same for `runner.disallowed-tools`. Each field is independent.
```

- [ ] **Step 2: Update Step 4b (Write Manifest) to document the resolution chain**

In Step 4b, before the "Step 1: Create the manifest file" sub-step, add:

```markdown
**Step 0: Resolve tool permissions.**

Apply the three-level resolution chain to produce the final `allowed-tools` and `disallowed-tools` lists:

1. Start with the built-in defaults: `allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent]`, `disallowed = [AskUserQuestion]`.
2. If `.skill-unit.yml` has `runner.allowed-tools`, replace the allowed list entirely. If it has `runner.disallowed-tools`, replace the disallowed list entirely.
3. Apply spec frontmatter overrides:
   - If `allowed-tools` is present, it fully replaces the resolved allowed list (`allowed-tools-extra` is ignored).
   - If only `allowed-tools-extra` is present, union its entries with the resolved allowed list.
   - Same logic for `disallowed-tools` / `disallowed-tools-extra`.
4. Conflict resolution: if a tool appears in both final lists, remove it from allowed (disallow wins).
```

Update the manifest JSON example to include the resolved lists:

```json
{
  "spec-name": "{name from frontmatter}",
  "fixture-path": "{resolved fixture path relative to repo root, or null}",
  "skill-path": "{path to the skill directory being tested, or null}",
  "spec-dir": "{spec file directory relative to repo root}",
  "timestamp": "{timestamp from Step 1}",
  "timeout": "{timeout from spec frontmatter, or from config execution.timeout, e.g. '120s'}",
  "runner": {
    "tool": "{tool from config, e.g. 'claude'}",
    "model": "{model from config, or null}",
    "max-turns": 10,
    "allowed-tools": ["{resolved allowed tools list}"],
    "disallowed-tools": ["{resolved disallowed tools list}"]
  },
  "test-cases": [
    {"id": "{test-id}", "prompt": "{prompt text from blockquote}"}
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/SKILL.md
git commit -m "docs(SKILL.md): add tool permission resolution chain to evaluator instructions"
```

---

### Task 5: Update .skill-unit.yml template

**Files:**
- Modify: `skills/skill-unit/templates/.skill-unit.yml:9-16` (runner section)

- [ ] **Step 1: Add commented-out allowed-tools and disallowed-tools fields**

After the existing `max-turns: 10` line in the runner section, add:

```yaml

  # Tool permissions for test sessions. Controls what the harness agent can do.
  # Built-in defaults allow: Read, Write, Edit, Bash, Glob, Grep, Agent
  # Built-in defaults disallow: AskUserQuestion
  #
  # These lists fully REPLACE the built-in defaults when specified.
  # Spec frontmatter can further override or extend via allowed-tools-extra
  # and disallowed-tools-extra fields.
  #
  # allowed-tools:
  #   - Read
  #   - Write
  #   - Edit
  #   - Bash
  #   - Glob
  #   - Grep
  #   - Agent
  # disallowed-tools:
  #   - AskUserQuestion
```

- [ ] **Step 2: Commit**

```bash
git add skills/skill-unit/templates/.skill-unit.yml
git commit -m "docs(template): add tool permission fields to .skill-unit.yml template"
```

---

### Task 6: Update spec-format.md reference

**Files:**
- Modify: `skills/skill-unit/references/spec-format.md:16-27` (frontmatter fields table)
- Modify: `skills/skill-unit/references/spec-format.md` (add new section after frontmatter)

- [ ] **Step 1: Add tool permission fields to the frontmatter table**

Add four new rows to the frontmatter fields table (after the `teardown` row):

```markdown
| `allowed-tools` | No | list | Fully replaces the resolved allowed tools list from global config. |
| `disallowed-tools` | No | list | Fully replaces the resolved disallowed tools list from global config. |
| `allowed-tools-extra` | No | list | Adds entries to the resolved allowed tools list (union). Ignored if `allowed-tools` is also present. |
| `disallowed-tools-extra` | No | list | Adds entries to the resolved disallowed tools list (union). Ignored if `disallowed-tools` is also present. |
```

- [ ] **Step 2: Add a Tool Permissions section after the frontmatter section**

Insert a new section after the frontmatter fields table (before the "Test Case Structure" section):

```markdown
### Tool Permissions

Test sessions run with `--permission-mode dontAsk` — only explicitly allowed tools work. The framework resolves tool lists through a three-level chain:

1. **Built-in defaults:** `allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent]`, `disallowed = [AskUserQuestion]`
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
```

- [ ] **Step 3: Commit**

```bash
git add skills/skill-unit/references/spec-format.md
git commit -m "docs(spec-format): add tool permission fields and resolution chain documentation"
```

---

### Task 7: Verify end-to-end

- [ ] **Step 1: Syntax-check runner.js**

Run: `node -c skills/skill-unit/scripts/runner.js`
Expected: No output (clean parse)

- [ ] **Step 2: Review the final state of runner.js**

Read `skills/skill-unit/scripts/runner.js` and verify:
- `--dangerously-skip-permissions` does not appear anywhere
- `--permission-mode dontAsk` is present in TOOL_PROFILES
- `scopeToolsToWorkspace` is defined and called per test case
- `allowedTools` and `disallowedTools` are read from `runner` manifest section
- `cmdArgs` is built inside the test case loop, not before it

- [ ] **Step 3: Review SKILL.md**

Read `skills/skill-unit/SKILL.md` and verify:
- Step 2 documents the built-in defaults for allowed/disallowed tools
- Step 4b includes the resolution chain (built-in → global → spec)
- The manifest JSON example includes `allowed-tools` and `disallowed-tools` in the runner section

- [ ] **Step 4: Review spec-format.md**

Read `skills/skill-unit/references/spec-format.md` and verify:
- Frontmatter table includes all four new fields
- Tool Permissions section exists with resolution chain explanation and examples

- [ ] **Step 5: Review .skill-unit.yml template**

Read `skills/skill-unit/templates/.skill-unit.yml` and verify:
- Commented-out `allowed-tools` and `disallowed-tools` fields exist under runner section
- Comments explain the built-in defaults and resolution model

- [ ] **Step 6: Commit any final fixes**

If any issues found during review, fix and commit.
