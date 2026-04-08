# Tool Permissions for Test Sessions — Design Spec

## Overview

Replace `--dangerously-skip-permissions` in the skill-unit runner with a structured, configurable tool permission system. Test sessions use `--permission-mode dontAsk` with explicit `--allowedTools` and `--disallowedTools` flags, giving each test case just enough access to execute the skill under test without unrestricted capabilities.

Permissions are configurable at three levels with a clear resolution chain: built-in defaults → `.skill-unit.yml` → spec frontmatter.

## Goals

- **Least privilege:** Test sessions get only the tools they need, not blanket permission bypass.
- **Configurable per suite:** Different skills have different needs — a git skill doesn't need `WebFetch`, a documentation skill doesn't need `Bash(docker *)`.
- **Sensible defaults:** A bare config with no permission fields works out of the box for typical skills.
- **Path isolation:** File tools are scoped to the workspace directory, preventing the test agent from reading spec files, other fixtures, or results.

## Built-in Defaults

The framework ships with a hardcoded default set. These are the tools any typical skill test needs:

```yaml
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
  - Skill
disallowed-tools:
  - AskUserQuestion
```

Notably excluded from allowed-tools:

- **`WebFetch` / `WebSearch`** — Test execution should be hermetic by default. Skills that need network access opt in explicitly.
- **`AskUserQuestion`** — Test sessions are non-interactive. This is actively disallowed, not just omitted.
- **MCP tools** — Not included in defaults. `--strict-mcp-config` already prevents MCP leakage.

`Skill` is included because many skills invoke other skills during execution.

## Configuration

### `.skill-unit.yml` (global level)

Two new fields under `runner:`:

```yaml
runner:
  tool: claude
  max-turns: 10

  # Fully replaces the built-in default allowed tools list.
  allowed-tools:
    - Read
    - Write
    - Edit
    - 'Bash(git *)'
    - Glob
    - Grep
    - Agent
    - Skill

  # Fully replaces the built-in default disallowed tools list.
  disallowed-tools:
    - AskUserQuestion
    - WebFetch
```

When omitted, the built-in defaults carry through unchanged.

Note: The `-extra` suffix fields (`allowed-tools-extra`, `disallowed-tools-extra`) are **not available** at this level — they only exist in spec frontmatter. The global config always fully replaces or inherits.

### Spec frontmatter (per-suite level)

Four new optional fields:

| Field                    | Type | Description                                                          |
| ------------------------ | ---- | -------------------------------------------------------------------- |
| `allowed-tools`          | list | Fully replaces the resolved allowed tools list from global config    |
| `disallowed-tools`       | list | Fully replaces the resolved disallowed tools list from global config |
| `allowed-tools-extra`    | list | Adds entries to the resolved allowed tools list (union)              |
| `disallowed-tools-extra` | list | Adds entries to the resolved disallowed tools list (union)           |

If both `allowed-tools` and `allowed-tools-extra` are present in the same frontmatter, `allowed-tools` wins (full replace; `-extra` is ignored). Same rule applies for the disallowed pair.

Example — a spec that needs Docker access without restating the full default list:

```yaml
---
name: docker-skill-tests
skill: docker-manager
allowed-tools-extra:
  - 'Bash(docker *)'
disallowed-tools-extra:
  - 'Bash(rm -rf *)'
---
```

## Resolution Chain

```
Built-in defaults
    ↓  (.skill-unit.yml replaces if specified)
Global config (resolved)
    ↓  (spec replaces or extends)
Spec frontmatter (resolved)
    ↓  (conflict rule applied)
Final resolved lists
```

### Resolution rules

1. **Built-in defaults** provide the base `allowed-tools` and `disallowed-tools` lists.
2. **`.skill-unit.yml`**: If `allowed-tools` is present, it fully replaces the built-in allowed list. If `disallowed-tools` is present, it fully replaces the built-in disallowed list. Each field is independent.
3. **Spec frontmatter**:
   - If `allowed-tools` is present, it fully replaces the resolved global allowed list (`allowed-tools-extra` is ignored).
   - If only `allowed-tools-extra` is present, its entries are unioned with the resolved global allowed list.
   - Same logic applies independently for `disallowed-tools` / `disallowed-tools-extra`.
4. **Conflict resolution**: After merging, if a tool appears in both the final allowed and disallowed lists, **disallow wins** — the tool is removed from the allowed list.

### Specificity model

The spec level overrides the global level. A spec can widen permissions beyond what the global config allows. This is the "specificity wins" model — the spec is closest to the test and knows what it needs.

### Full resolution example

```
Built-in:        allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, Skill]
                 disallowed = [AskUserQuestion]

.skill-unit.yml: (no fields specified)
  → Resolved:    allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, Skill]
                 disallowed = [AskUserQuestion]

Spec frontmatter:
  allowed-tools-extra: ["Bash(docker *)"]
  disallowed-tools-extra: ["Bash(rm -rf *)"]

  → Final:       allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, "Bash(docker *)"]
                 disallowed = [AskUserQuestion, "Bash(rm -rf *)"]
```

## Path Isolation

File tools are dynamically scoped to the workspace's work directory at runtime. The runner knows each workspace path (`.workspace/workspaces/{uuid}/work/`) before spawning the CLI session, so it rewrites the resolved file tool entries to include path restrictions.

### Scoped tools

These tools get path-scoped when they appear in the allowed list:

| Tool    | Rewritten to                 |
| ------- | ---------------------------- |
| `Read`  | `Read({workspace-path}/**)`  |
| `Write` | `Write({workspace-path}/**)` |
| `Edit`  | `Edit({workspace-path}/**)`  |
| `Glob`  | `Glob({workspace-path}/**)`  |
| `Grep`  | `Grep({workspace-path}/**)`  |

Tools that already have an explicit path pattern (e.g., `Read(/some/specific/path/**)`), `Bash`, `Agent`, and any non-file tools are passed through unchanged.

### Why this matters

Workspaces live at `.workspace/workspaces/{uuid}/work/` — inside the repo. Each workspace is a UUID-named directory to prevent leaking test metadata to the agent. Without path scoping, the test agent could navigate to sibling directories (plugin files, other workspaces) or up to the repo root. Path isolation ensures the agent sees only its own work directory.

### Implementation in runner.js

The runner applies path scoping after reading the manifest's resolved tool lists, just before building CLI arguments. This is a runner-level concern — the evaluator writes the unscoped tool names into the manifest, and the runner scopes them per workspace.

```js
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep']);

function scopeToolsToWorkspace(allowedTools, workspacePath) {
  return allowedTools.map((tool) => {
    // Only scope bare tool names (no existing path pattern)
    if (FILE_TOOLS.has(tool)) {
      return `${tool}(${workspacePath}/**)`;
    }
    return tool;
  });
}
```

## CLI Argument Mapping

### Manifest changes

The manifest gains two new fields under `runner`:

```json
{
  "spec-name": "docker-tests",
  "runner": {
    "tool": "claude",
    "model": "sonnet",
    "max-turns": 10,
    "allowed-tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "Skill", "Bash(docker *)"],
    "disallowed-tools": ["AskUserQuestion", "Bash(rm -rf *)"]
  },
  "test-cases": [...]
}
```

The evaluator performs the full resolution chain and writes the final lists here. The runner reads them and passes them through to the CLI (after applying path scoping for file tools).

### TOOL_PROFILES change

The profile builder signature gains the two lists. `--dangerously-skip-permissions` is replaced with `--permission-mode dontAsk` plus the tool flags:

```js
const TOOL_PROFILES = {
  claude: (
    model,
    maxTurns,
    pluginDir,
    allowedTools,
    disallowedTools,
    workspacePath
  ) => [
    '--print',
    '--verbose',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    '--max-turns',
    String(maxTurns),
    '--permission-mode',
    'dontAsk',
    ...(allowedTools.length ? ['--allowedTools', ...allowedTools] : []),
    ...(disallowedTools.length
      ? ['--disallowedTools', ...disallowedTools]
      : []),
    '--no-chrome',
    '--no-session-persistence',
    '--setting-sources',
    'local',
    '--strict-mcp-config',
    '--system-prompt',
    `You are working in the directory: ${workspacePath}...`,
    ...(model ? ['--model', model] : []),
    ...(pluginDir ? ['--plugin-dir', pluginDir] : []),
  ],
};
```

## Files Changed

### `skills/skill-unit/scripts/runner.js`

- Add `scopeToolsToWorkspace()` helper function.
- Read `allowed-tools` and `disallowed-tools` from manifest's `runner` section.
- Apply path scoping per workspace before building CLI args.
- Update `TOOL_PROFILES.claude` signature to accept the two lists.
- Remove `--dangerously-skip-permissions`, add `--permission-mode dontAsk` + `--allowedTools` + `--disallowedTools`.

### `skills/skill-unit/SKILL.md`

- Step 2 (Load Configuration): Document reading `allowed-tools` and `disallowed-tools` from `.skill-unit.yml` runner section.
- Step 4b (Write Manifest): Document the resolution chain — merge built-in defaults with global config, then with spec frontmatter. Write resolved lists into the manifest's `runner` section.

### `skills/skill-unit/templates/.skill-unit.yml`

- Add commented-out `allowed-tools` and `disallowed-tools` fields under `runner:` with documentation explaining the defaults and resolution model.

### `skills/skill-unit/references/spec-format.md`

- Add `allowed-tools`, `disallowed-tools`, `allowed-tools-extra`, `disallowed-tools-extra` to the frontmatter fields table.
- Add a section explaining the resolution chain and the `-extra` suffix behavior.
- Add examples showing common patterns (adding a tool, restricting Bash).
