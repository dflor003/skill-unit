# Multi-Asset Spec Frontmatter

**Status:** Draft
**Date:** 2026-05-20

## Goal

Allow a `*.spec.md` to declare additional skills, agents, and hooks that the test runner should mount in the per-test workspace, beyond the single primary `skill:`. Today the runner copies exactly one skill (the one named by `skill:` frontmatter) plus the entire sibling `agents/` directory. Tests that need to verify cross-skill behavior (e.g., "this skill should NOT activate; that other one should") cannot be written, because the other skill is never present in the workspace.

This unblocks STT-3, STT-4, and STT-5 (negative-activation tests for `skill-test-troubleshooting` that need `skill-unit` and `skill-test-design` available so the agent's correct routing decision is observable). It also creates the capability for future tests to depend on specific agents and hooks.

## Non-Goals

- Per-test-case overrides. Asset declarations are spec-level only. Per-test `Fixtures:` lists stay focused on filesystem state, not plugin assets.
- Auto-discovery. The runner does not scan the project for "all available skills" and mount them. Tests opt in by name.
- Versioning, namespacing, or aliasing. Asset names map one-to-one to the same `<repo>/<kind>/<name>/` or `<repo>/.claude/<kind>/<name>/` locations the current code already searches.
- Mounting external (non-project) skills, agents, or hooks. Only assets present in this repo are resolvable.

## Frontmatter

Three new optional fields. All are arrays of asset names. Missing or empty means current behavior.

```yaml
---
name: skill-test-troubleshooting-tests
skill: skill-test-troubleshooting # primary, unchanged
extra-skills: # additional skills to mount
  - skill-unit
  - skill-test-design
extra-agents: # additional agents to mount
  - grader
extra-hooks: # additional hooks to mount
  - on-test-complete
---
```

The primary `skill:` field keeps all current semantics: it controls `--skill X` filter matching, it is reported as the spec's "skill under test," and it is the asset that auto-co-locates its sibling `agents/` (current behavior; see Agent Auto-Mount Compatibility below).

## Resolution

Each entry resolves to one filesystem path via a two-step lookup, matching the existing `resolveSkillPath` pattern.

| Asset kind | Lookup order                                                          |
| ---------- | --------------------------------------------------------------------- |
| Skills     | `.claude/skills/<name>/SKILL.md`, then `skills/<name>/SKILL.md`       |
| Agents     | `.claude/agents/<name>.md`, then `agents/<name>.md`                   |
| Hooks      | `.claude/hooks/<name>/` (directory), then `hooks/<name>/` (directory) |

Unresolved entries are a hard fail at **compile time** with a message naming the missing entry and the locations searched. Failing early at compile keeps test runs from getting halfway through before discovering a typo.

Asset name validation (kebab-case, no path separators, no `..`) is enforced by the compiler. The runner trusts its input.

## Runner Behavior

The current `installSkillPlugin` in `src/core/runner.ts` is generalized to install one primary skill plus N extra skills, agents, and hooks into the workspace's `plugin/` directory:

```
<workspace>/plugin/
  .claude-plugin/plugin.json
  skills/
    <primary-skill-name>/
    <extra-skill-1>/
    <extra-skill-2>/
  agents/
    <auto-copied or extra-agent>.md
    <extra-agent>.md
  hooks/
    <extra-hook>/
```

The single-skill code path (no extras) produces a workspace identical to today's, so every existing spec runs unchanged.

### Agent Auto-Mount Compatibility

Today, when the primary skill's source plugin has a sibling `agents/` directory, the runner copies the entire directory into the workspace plugin. This is what makes `grader.md` transparently available to any spec.

New behavior:

- If `extra-agents` is **absent or empty**, current behavior is preserved: the entire sibling `agents/` directory is auto-mounted.
- If `extra-agents` is **specified**, the runner mounts only the listed agents. Authors who want to restrict the workspace's agent surface can do so explicitly. Authors who do not care can ignore the field.

The principle: opting in to the new field opts in to explicit control; staying silent preserves convenience.

### Hook Mounting

Hooks are copied as whole directories under `<workspace>/plugin/hooks/<name>/`. The runner does not parse or validate `hooks.json` inside them; whatever the directory contains is what the test sees.

The project currently uses no plugin hooks. The implementation is intentionally simple (copy directory) so it can be extended later if a real test needs more.

## Compiler Changes

In `src/core/compiler.ts`:

- Generalize `resolveSkillPath(skillName, repoRoot)` into a small helper `resolveAssetPath(kind, name, repoRoot)` keyed on `'skill' | 'agent' | 'hook'`. Or keep three thin wrappers; either works.
- After parsing frontmatter, resolve `extra-skills`, `extra-agents`, `extra-hooks` into three corresponding arrays of project-relative paths.
- Emit them in the manifest alongside the existing `skill-path` field.
- Fail with a clear error if any entry does not resolve. The error names the kind, the missing name, and both attempted locations.

## Manifest Schema

`src/types/spec.ts` adds three nullable arrays to `Manifest`:

```ts
interface Manifest {
  // existing fields...
  'skill-path': string | null;
  'extra-skill-paths': string[]; // new, empty array if none declared
  'extra-agent-paths': string[]; // new, empty array if none declared
  'extra-hook-paths': string[]; // new, empty array if none declared
}
```

`SpecFrontmatter` gains the three optional input fields:

```ts
interface SpecFrontmatter {
  // existing fields...
  skill?: string;
  'extra-skills'?: string[];
  'extra-agents'?: string[];
  'extra-hooks'?: string[];
}
```

## Filtering

`--skill X` semantics stay scoped to the primary `skill:` field only. A spec that pulls in `skill-unit` via `extra-skills` does **not** become discoverable via `--skill skill-unit`; that filter still answers the question "which specs are testing skill-unit?", and the answer is "the ones whose primary skill is skill-unit."

If, in the future, `--skill` should also match `extra-skills`, that is a small, additive change. For v1 we keep the meaning narrow.

## Testing

### Unit

In `tests/core/`:

- `compiler.spec.ts`: resolves declared extras into paths, fails compile on unresolved, handles the "no extras" case identically to today.
- `runner.spec.ts` (or a new file): given a manifest with extras, the workspace `plugin/` tree contains the listed extras. Existing single-skill assertions still hold for specs with no extras.

### Integration

STT-3, STT-4, STT-5 are the canonical first users of `extra-skills`:

```yaml
extra-skills:
  - skill-unit # STT-3, STT-4 need it
  - skill-test-design # STT-5 needs it
```

Their positive expectations ("Activates the `skill-unit` skill") become testable for the first time. The negative expectations are unchanged.

## Documentation

- `skills/skill-unit/references/spec-format.md` (if present): add the three new frontmatter fields.
- `docs/architecture/` index in `CLAUDE.md`: update if a new architecture doc is added.
- A new architecture doc is not strictly required for v1; the design doc plus inline code documentation are enough. Re-evaluate if behavior grows past the table in this spec.

## Risks

| Risk                                                                  | Mitigation                                                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Hooks are unverified; no existing test uses them.                     | Implementation is intentionally minimal (copy directory). If the shape turns out wrong later, the change surface is small. |
| `extra-agents` flips current auto-mount behavior in a surprising way. | The "absent ⇒ preserve current behavior" rule keeps every existing spec identical. New tests cover both code paths.        |
| Authors typo an asset name and only find out mid-run.                 | Resolution failures happen at compile time, before any test executes.                                                      |

## Rollout

Backwards compatible. Existing specs need no changes. Specs that want the new capability opt in by adding the frontmatter fields. No CLI flag changes. No config file changes.
