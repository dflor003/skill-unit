# Plan: Top-Level CLI with Subcommands for Skill-Unit

## Context

The skill-unit pipeline currently requires the AI agent (SKILL.md) to parse `.spec.md` files, load `.skill-unit.yml`, resolve tool permissions, and generate manifest JSON before handing off to `runner.js`. This makes the agent a mandatory middleman for what is fundamentally deterministic text processing. Moving this logic into Node.js scripts means any caller (human CLI, CI pipeline, or AI agent) can run tests with a single command, and the agent's role shrinks to orchestrating graders and presenting results.

## Approach: Top-Level Entry Point + Compiler Module

Create two new files:
- **`scripts/cli.js`** -- top-level entry point with subcommands, delegates to compiler/runner/report
- **`scripts/compiler.js`** -- the parsing/resolution/manifest-generation engine (also usable standalone)

The runner and report scripts stay unchanged.

## CLI Design: Subcommands

```
node cli.js <command> [options] [spec-paths...]

Commands:
  run       Compile manifests and execute tests (compile + runner.js)
  compile   Parse specs, resolve config, write manifests (no execution)
  ls        List discovered specs and their test cases
  report    Generate report from a completed run

Shared Options (apply to run, compile, ls):
  --config <path>         Path to .skill-unit.yml (default: .skill-unit.yml in cwd)
  --name <name>           Filter by spec suite name (from frontmatter `name` field)
  --tag <tags>            Filter specs by tag (comma-separated)
  --test <ids>            Filter to specific test case IDs (comma-separated)

Run/Compile Options:
  --model <model>         Override runner model
  --timeout <duration>    Override timeout (e.g., 60s, 5m)
  --max-turns <n>         Override max turns
  --timestamp <ts>        Use specific timestamp (default: generate now)
  --out-dir <path>        Manifest output dir (default: .workspace/runs/{timestamp}/manifests)
  --keep-workspaces       Keep test workspaces after execution (run only)

Report Options:
  --run-dir <path>        Path to a specific run directory

No-command shorthand:
  node cli.js             (no args) prints help
```

### Example Usage

```bash
# Run all tests
node cli.js run

# Run a specific spec file
node cli.js run tests/test-design/test-design.spec.md

# Run by suite name
node cli.js run --name test-design-tests

# Run by tag
node cli.js run --tag smoke

# Run specific test cases from a spec
node cli.js run tests/test-design/test-design.spec.md --test TD-1,TD-3

# Override model for this run
node cli.js run --model opus

# List all discovered specs and test cases
node cli.js ls

# List tests for a specific suite
node cli.js ls --name test-design-tests

# List tests matching a tag
node cli.js ls --tag smoke

# Compile manifests only (no execution)
node cli.js compile --timestamp 2026-04-04-15-30-00

# Then run a specific manifest directly if needed
node runner.js .workspace/runs/2026-04-04-15-30-00/manifests/test-design-tests.manifest.json

# Generate report for a completed run
node cli.js report --run-dir .workspace/runs/2026-04-04-15-30-00
```

### `ls` Output Format

```
test-design-tests (tests/test-design/test-design.spec.md)
  tags: slash-command, activation, fixtures
  TD-1: Generated Test Case Follows Quality Guidelines
  TD-2: Detects Existing Spec and Offers Review
  TD-3: Handles Malformed Skill Gracefully
  TD-4: Generated Fixtures Use Neutral Names and Content

commit-skill-tests (tests/commit/commit.spec.md)
  tags: slash-command, git
  COM-1: basic-commit
  COM-2: nothing-to-commit
```

When filtered with `--test`, only matching test cases are shown. When filtered with `--name` or `--tag`, only matching specs are shown.

## Script Architecture

### `cli.js` (~80 lines) -- Entry Point

Parses `process.argv` for subcommand and options, then delegates:
- `run` -> calls compiler to generate manifests, then spawns `runner.js` for each
- `compile` -> calls compiler, writes manifests, exits
- `ls` -> calls compiler's discovery + parsing (no manifest writing), prints listing
- `report` -> spawns `report.js` with the run directory

This is a thin dispatch layer. All real logic lives in `compiler.js`.

### `compiler.js` (~350 lines) -- Parsing Engine

Exports functions for programmatic use by `cli.js`, and also works standalone:

**Exported API:**
```js
module.exports = {
  loadConfig(configPath),           // Load + merge .skill-unit.yml with defaults
  discoverSpecs(testDir, filters),  // Find *.spec.md files, apply name/tag/path filters
  parseSpecFile(filePath),          // Parse one spec: frontmatter + test cases
  resolveToolPermissions(config, specFrontmatter),  // 3-level chain
  buildManifest(spec, config, options),  // Generate manifest JSON object
};
```

**Internal sections:**
1. Config loading (`loadConfig`, `CONFIG_DEFAULTS`)
2. YAML subset parser (`parseSimpleYaml`) -- handles frontmatter and `.skill-unit.yml`
3. Spec file parser (`parseFrontmatter`, `parseTestCases`, `parseSpecFile`)
4. Spec discovery (`discoverSpecs` via recursive `fs.readdirSync`)
5. Tool permission resolution (`resolveToolPermissions`)
6. Path resolution (`resolveSkillPath`, `resolveFixturePaths`)
7. Manifest generation (`buildManifest`)

### `runner.js` (unchanged)

Reads a manifest JSON, creates isolated workspaces, spawns CLI processes, captures responses/transcripts. No modifications needed.

### `report.js` (unchanged)

Reads grader results, generates consolidated report. Called by `cli.js report` or directly.

## Parsing Implementation (Zero Dependencies)

No npm packages. The project has no `package.json` and stays that way.

**YAML frontmatter parser (~60 lines):**
- Delimited by `---` markers
- Scalar strings: `name: my-tests`
- Inline lists: `tags: [a, b, c]`
- Block lists: indented `- item` lines under a key
- No nested objects, anchors, or multi-line strings in frontmatter

**`.skill-unit.yml` parser:**
- Same subset but with one level of nesting (e.g., `runner:` with indented sub-keys)
- Detect top-level keys (no indent) vs sub-keys (2-space indent)

**Markdown test case parser (~80 lines):**
- Split on `### ` headings
- State machine scanning for `**Label:**` markers
- Extract: ID (before colon), name (after colon), prompt (blockquote lines), expectations (bullet lines), negative expectations (bullet lines), fixtures (bullet lines)

## Tool Permission Resolution

Pure function implementing the documented 3-level chain:
1. Start with built-in defaults: `allowed = [Read, Write, Edit, Bash, Glob, Grep, Agent, Skill]`, `disallowed = [AskUserQuestion]`
2. If `.skill-unit.yml` has `runner.allowed-tools`, fully replace allowed; same for disallowed
3. Spec frontmatter: `allowed-tools` fully replaces (ignoring `-extra`); `allowed-tools-extra` unions; same for disallowed
4. Conflict: disallow wins

## Path Resolution

- `global-fixtures`: relative to spec file's directory, stored relative to repo root in manifest
- Per-test `fixture-paths`: same resolution
- `skill-path`: search `.claude/skills/{name}/SKILL.md` then `skills/{name}/SKILL.md` from repo root

## Manifest Output

Identical schema to what the agent currently produces; `runner.js` needs zero changes:
```json
{
  "spec-name": "string",
  "global-fixture-path": "relative path or null",
  "skill-path": "relative path or null",
  "timestamp": "YYYY-MM-DD-HH-MM-SS",
  "timeout": "120s",
  "runner": { "tool": "claude", "model": null, "max-turns": 10,
              "allowed-tools": [...], "disallowed-tools": [...] },
  "test-cases": [{ "id": "TC-1", "prompt": "..." }]
}
```

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `skills/skill-unit/scripts/cli.js` | **Create** | ~80 lines: subcommand dispatch (run, compile, ls, report) |
| `skills/skill-unit/scripts/compiler.js` | **Create** | ~350 lines: config loading, spec parsing, tool resolution, manifest generation |
| `skills/skill-unit/scripts/runner.js` | **No change** | Manifest contract unchanged |
| `skills/skill-unit/scripts/report.js` | **No change** | |
| `skills/skill-unit/SKILL.md` | **Modify** | Replace Steps 2-4b with `cli.js run`; add to `allowed-tools` |
| `docs/architecture/test-execution.md` | **Modify** | Document the new CLI layer in the pipeline |

### SKILL.md Changes

Steps 2 (Load Configuration), 3 (Discover Test Files), 4a (Parse Spec), and 4b (Write Manifest and Execute) collapse into:

```bash
node ${CLAUDE_SKILL_DIR}/scripts/cli.js run --timestamp {timestamp} [spec-paths or --name/--tag flags]
```

Steps 4c-4f (setup, graders, verify, teardown) and Step 5 (report) remain in SKILL.md since grader dispatch requires the Agent tool.

Add to SKILL.md `allowed-tools`:
```
Bash(node ${CLAUDE_SKILL_DIR}/scripts/cli.js *)
```

### Setup Script Handling

Setup/teardown stay in SKILL.md for now. The CLI handles compile + run; the agent orchestrates setup, graders, and teardown around it.

## Error Handling

- Missing `.skill-unit.yml`: use all defaults, not an error
- No specs found: print message, exit 0
- Malformed frontmatter: print error with file path, skip that spec, continue; exit 1 at end
- `--test` filter matches nothing: warn, skip spec
- `--name` filter matches nothing: print "No specs match name: X", exit 0
- `--tag` filter matches nothing: print "No specs match tag(s): X", exit 0
- Unknown subcommand: print help, exit 1

## Implementation Order

1. **`compiler.js`** -- the core engine; all parsing, resolution, manifest generation
2. **`cli.js`** -- thin subcommand dispatcher wiring up compiler + runner + report
3. **SKILL.md** -- update to use `cli.js run` instead of inline parsing
4. **`docs/architecture/test-execution.md`** -- document the new pipeline

## Verification

1. **`node cli.js ls`**: verify it discovers and lists all specs/test cases correctly
2. **`node cli.js compile --timestamp test`**: verify manifests match what the agent previously generated
3. **`node cli.js run`**: end-to-end execution producing same workspace structure, transcripts, and responses
4. **`/skill-unit`**: agent correctly delegates to `cli.js run` and picks up from runner output to dispatch graders
5. **Syntax check**: `node -c skills/skill-unit/scripts/cli.js && node -c skills/skill-unit/scripts/compiler.js`
