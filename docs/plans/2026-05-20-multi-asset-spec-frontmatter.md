# Multi-Asset Spec Frontmatter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional `extra-skills`, `extra-agents`, and `extra-hooks` frontmatter fields to `*.spec.md` files so test workspaces can mount multiple plugin assets, not just the single primary `skill:`.

**Architecture:** Pure additive change. The compiler resolves the new fields into project-relative paths and emits them in the manifest. The runner extends `installSkillPlugin` to install the primary plus the listed extras into the workspace's `plugin/` tree. Existing specs with no extras produce a byte-identical workspace to today.

**Tech Stack:** TypeScript, Node.js, vitest. No new dependencies.

**Spec:** [docs/specs/2026-05-20-multi-asset-spec-frontmatter-design.md](docs/specs/2026-05-20-multi-asset-spec-frontmatter-design.md)

---

## File Structure

**New files:** none.

**Modified files:**

| File                                                                        | Responsibility                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/spec.ts`                                                         | Add `extra-skills`, `extra-agents`, `extra-hooks` to `SpecFrontmatter`; add `extra-skill-paths`, `extra-agent-paths`, `extra-hook-paths` to `Manifest`.                                                     |
| `src/core/compiler.ts`                                                      | Add `resolveAgentPath` and `resolveHookPath` (siblings to `resolveSkillPath`). Extend `buildManifest` to resolve and emit the new arrays. Fail compile on unresolved entries.                               |
| `src/core/runner.ts`                                                        | Extend `installSkillPlugin` to accept lists of extra skills/agents/hooks. Preserve the "absent extra-agents ⇒ auto-mount whole agents dir" rule. Update `_runTestAsync` to forward the new manifest fields. |
| `tests/core/compiler.spec.ts`                                               | TDD: tests for new resolvers, manifest population, and unresolved-name failure mode.                                                                                                                        |
| `tests/core/runner.spec.ts`                                                 | TDD: tests for `installSkillPlugin` with extras (and the auto-mount-preservation case).                                                                                                                     |
| `skill-tests/skill-test-troubleshooting/skill-test-troubleshooting.spec.md` | Add `extra-skills`, restore STT-3/4/5 positive expectations.                                                                                                                                                |
| `skills/skill-unit/references/spec-format.md` (if present)                  | Document the three new frontmatter fields.                                                                                                                                                                  |

---

## Task 1: Add Type Definitions

**Files:**

- Modify: `src/types/spec.ts:1-50`

This task only edits types. No runtime behavior. No test needed yet (subsequent tasks will exercise the types).

- [ ] **Step 1: Add `extra-skills`, `extra-agents`, `extra-hooks` to `SpecFrontmatter`**

Edit `src/types/spec.ts` so `SpecFrontmatter` reads:

```ts
export interface SpecFrontmatter {
  name: string;
  skill?: string;
  'extra-skills'?: string[];
  'extra-agents'?: string[];
  'extra-hooks'?: string[];
  tags: string[];
  timeout?: string;
  'global-fixtures'?: string;
  setup?: string;
  teardown?: string;
  'allowed-tools'?: string[];
  'allowed-tools-extra'?: string[];
  'disallowed-tools'?: string[];
  'disallowed-tools-extra'?: string[];
}
```

- [ ] **Step 2: Add `extra-skill-paths`, `extra-agent-paths`, `extra-hook-paths` to `Manifest`**

Edit `src/types/spec.ts` so `Manifest` reads:

```ts
export interface Manifest {
  'spec-name': string;
  'global-fixture-path': string | null;
  'skill-path': string | null;
  'extra-skill-paths': string[];
  'extra-agent-paths': string[];
  'extra-hook-paths': string[];
  timestamp: string;
  timeout: string;
  runner: {
    tool: string;
    model: string | null;
    'max-turns': number;
    'allowed-tools': string[];
    'disallowed-tools': string[];
  };
  'test-cases': ManifestTestCase[];
}
```

- [ ] **Step 3: Run typecheck to surface call sites that need updating**

Run: `npm.cmd run typecheck`

Expected: errors at every `Manifest` construction site (currently only `buildManifest` in `compiler.ts`) and `Manifest` consumer sites (`runner.ts`). These are the call sites Task 3 and Task 5 will fix. Note the error locations and proceed.

- [ ] **Step 4: Commit**

```bash
git add src/types/spec.ts
git commit -m "feat(types): add extra-skills/agents/hooks frontmatter and manifest fields"
```

---

## Task 2: Add `resolveAgentPath` and `resolveHookPath` Helpers

**Files:**

- Modify: `src/core/compiler.ts:306-325` (add siblings to `resolveSkillPath`)
- Modify: `tests/core/compiler.spec.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/compiler.spec.ts`. The file already imports from `compiler.js`; extend that import to include the new helpers.

```ts
import {
  // existing imports...
  resolveSkillPath,
  resolveAgentPath,
  resolveHookPath,
} from '../../src/core/compiler.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('resolveAgentPath', () => {
  it('when agent exists under .claude/agents should return repo-relative path', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
    fs.mkdirSync(path.join(tmp, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude', 'agents', 'reviewer.md'), '');

    // Act
    const result = resolveAgentPath('reviewer', tmp);

    // Assert
    expect(result).toBe(path.join('.claude', 'agents', 'reviewer.md'));
  });

  it('when agent exists under agents should return repo-relative path', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
    fs.mkdirSync(path.join(tmp, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'agents', 'grader.md'), '');

    // Act
    const result = resolveAgentPath('grader', tmp);

    // Assert
    expect(result).toBe(path.join('agents', 'grader.md'));
  });

  it('when agent is not found should return null', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));

    // Act
    const result = resolveAgentPath('missing', tmp);

    // Assert
    expect(result).toBeNull();
  });
});

describe('resolveHookPath', () => {
  it('when hook dir exists under .claude/hooks should return repo-relative path', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
    fs.mkdirSync(path.join(tmp, '.claude', 'hooks', 'on-stop'), {
      recursive: true,
    });

    // Act
    const result = resolveHookPath('on-stop', tmp);

    // Assert
    expect(result).toBe(path.join('.claude', 'hooks', 'on-stop'));
  });

  it('when hook dir exists under hooks should return repo-relative path', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
    fs.mkdirSync(path.join(tmp, 'hooks', 'on-stop'), { recursive: true });

    // Act
    const result = resolveHookPath('on-stop', tmp);

    // Assert
    expect(result).toBe(path.join('hooks', 'on-stop'));
  });

  it('when hook is not found should return null', () => {
    // Arrange
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));

    // Act
    const result = resolveHookPath('missing', tmp);

    // Assert
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- compiler`

Expected: FAIL with "`resolveAgentPath` is not exported" / "`resolveHookPath` is not exported".

- [ ] **Step 3: Implement `resolveAgentPath`**

Add to `src/core/compiler.ts`, immediately after `resolveSkillPath`:

```ts
export function resolveAgentPath(
  agentName: string | null | undefined,
  repoRoot: string
): string | null {
  if (!agentName) return null;

  // Check .claude/agents/{name}.md first, then agents/{name}.md
  const candidates = [
    path.join(repoRoot, '.claude', 'agents', `${agentName}.md`),
    path.join(repoRoot, 'agents', `${agentName}.md`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.relative(repoRoot, candidate);
    }
  }

  return null;
}
```

- [ ] **Step 4: Implement `resolveHookPath`**

Add to `src/core/compiler.ts`, immediately after `resolveAgentPath`:

```ts
export function resolveHookPath(
  hookName: string | null | undefined,
  repoRoot: string
): string | null {
  if (!hookName) return null;

  // Check .claude/hooks/{name}/ first, then hooks/{name}/
  const candidates = [
    path.join(repoRoot, '.claude', 'hooks', hookName),
    path.join(repoRoot, 'hooks', hookName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return path.relative(repoRoot, candidate);
    }
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm.cmd test -- compiler`

Expected: PASS for all six new tests; existing compiler tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/compiler.ts tests/core/compiler.spec.ts
git commit -m "feat(compiler): add resolveAgentPath and resolveHookPath helpers"
```

---

## Task 3: Extend `buildManifest` to Populate the Extra Path Arrays

**Files:**

- Modify: `src/core/compiler.ts:336-420` (`buildManifest`)
- Modify: `tests/core/compiler.spec.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/compiler.spec.ts`:

```ts
describe('buildManifest', () => {
  describe('when frontmatter declares no extras', () => {
    it('should emit empty arrays for extra-*-paths', () => {
      // Arrange
      const spec = {
        path: 'skill-tests/foo/foo.spec.md',
        frontmatter: { name: 'foo', tags: [] },
        testCases: [],
      };
      const config = {
        runner: { tool: 'claude', model: null, 'max-turns': 10 },
        execution: { timeout: '60s', 'grader-concurrency': 1 },
      };

      // Act
      const manifest = buildManifest(spec, config);

      // Assert
      expect(manifest['extra-skill-paths']).toEqual([]);
      expect(manifest['extra-agent-paths']).toEqual([]);
      expect(manifest['extra-hook-paths']).toEqual([]);
    });
  });

  describe('when frontmatter declares resolvable extras', () => {
    it('should emit project-relative paths for each kind', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      fs.mkdirSync(path.join(tmp, 'skills', 'helper'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'skills', 'helper', 'SKILL.md'), '');
      fs.mkdirSync(path.join(tmp, 'agents'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'agents', 'grader.md'), '');
      fs.mkdirSync(path.join(tmp, 'hooks', 'on-stop'), { recursive: true });
      const prev = process.cwd();
      process.chdir(tmp);
      try {
        const spec = {
          path: 'skill-tests/foo/foo.spec.md',
          frontmatter: {
            name: 'foo',
            tags: [],
            'extra-skills': ['helper'],
            'extra-agents': ['grader'],
            'extra-hooks': ['on-stop'],
          },
          testCases: [],
        };
        const config = {
          runner: { tool: 'claude', model: null, 'max-turns': 10 },
          execution: { timeout: '60s', 'grader-concurrency': 1 },
        };

        // Act
        const manifest = buildManifest(spec, config);

        // Assert
        expect(manifest['extra-skill-paths']).toEqual([
          path.join('skills', 'helper'),
        ]);
        expect(manifest['extra-agent-paths']).toEqual([
          path.join('agents', 'grader.md'),
        ]);
        expect(manifest['extra-hook-paths']).toEqual([
          path.join('hooks', 'on-stop'),
        ]);
      } finally {
        process.chdir(prev);
      }
    });
  });

  describe('when frontmatter declares an unresolvable extra-skill', () => {
    it('should throw a clear error naming the missing entry', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const prev = process.cwd();
      process.chdir(tmp);
      try {
        const spec = {
          path: 'skill-tests/foo/foo.spec.md',
          frontmatter: {
            name: 'foo',
            tags: [],
            'extra-skills': ['does-not-exist'],
          },
          testCases: [],
        };
        const config = {
          runner: { tool: 'claude', model: null, 'max-turns': 10 },
          execution: { timeout: '60s', 'grader-concurrency': 1 },
        };

        // Act + Assert
        expect(() => buildManifest(spec, config)).toThrow(
          /extra-skills.*does-not-exist/
        );
      } finally {
        process.chdir(prev);
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- compiler`

Expected: FAIL. `extra-skill-paths` is undefined on the manifest.

- [ ] **Step 3: Extend `buildManifest`**

In `src/core/compiler.ts`, inside `buildManifest`, after the existing `skillPath` line (around line 370-373), add:

```ts
const extraSkills = (fm['extra-skills'] as string[] | undefined) ?? [];
const extraAgents = (fm['extra-agents'] as string[] | undefined) ?? [];
const extraHooks = (fm['extra-hooks'] as string[] | undefined) ?? [];

const extraSkillPaths = extraSkills.map((name) => {
  const p = resolveSkillPath(name, repoRoot);
  if (!p) {
    throw new Error(
      `extra-skills: could not resolve "${name}". ` +
        `Searched .claude/skills/${name}/SKILL.md and skills/${name}/SKILL.md.`
    );
  }
  return p;
});

const extraAgentPaths = extraAgents.map((name) => {
  const p = resolveAgentPath(name, repoRoot);
  if (!p) {
    throw new Error(
      `extra-agents: could not resolve "${name}". ` +
        `Searched .claude/agents/${name}.md and agents/${name}.md.`
    );
  }
  return p;
});

const extraHookPaths = extraHooks.map((name) => {
  const p = resolveHookPath(name, repoRoot);
  if (!p) {
    throw new Error(
      `extra-hooks: could not resolve "${name}". ` +
        `Searched .claude/hooks/${name}/ and hooks/${name}/.`
    );
  }
  return p;
});
```

Then add the three new arrays to the returned manifest object (between `'skill-path'` and `timestamp`):

```ts
return {
  'spec-name': (fm['name'] as string) || path.basename(spec.path, '.spec.md'),
  'global-fixture-path': globalFixturePath,
  'skill-path': skillPath,
  'extra-skill-paths': extraSkillPaths,
  'extra-agent-paths': extraAgentPaths,
  'extra-hook-paths': extraHookPaths,
  timestamp: timestamp ?? formatTimestamp(new Date()),
  // ...rest unchanged...
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- compiler`

Expected: PASS for all three new `buildManifest` tests; existing compiler tests still pass.

- [ ] **Step 5: Run full typecheck**

Run: `npm.cmd run typecheck`

Expected: errors only in `src/core/runner.ts` (consumer of `Manifest` that hasn't been updated yet). All other code paths compile.

- [ ] **Step 6: Commit**

```bash
git add src/core/compiler.ts tests/core/compiler.spec.ts
git commit -m "feat(compiler): emit extra-skill/agent/hook paths in manifest"
```

---

## Task 4: Generalize `installSkillPlugin`

**Files:**

- Modify: `src/core/runner.ts:208-262` (`installSkillPlugin`)
- Modify: `tests/core/runner.spec.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/runner.spec.ts`. Use a temp dir per test so file copies don't pollute the repo.

```ts
import { installSkillPlugin } from '../../src/core/runner.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('installSkillPlugin', () => {
  describe('when extras are not provided', () => {
    it('should preserve current behavior and auto-mount sibling agents/', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src-plugin', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const agentsSrc = path.join(tmp, 'src-plugin', 'agents');
      fs.mkdirSync(agentsSrc, { recursive: true });
      fs.writeFileSync(path.join(agentsSrc, 'grader.md'), '# grader');
      const pluginDest = path.join(tmp, 'workspace', 'plugin');

      // Act
      const result = installSkillPlugin(skillSrc, pluginDest);

      // Assert
      expect(result).toBe(pluginDest);
      expect(
        fs.existsSync(path.join(pluginDest, 'skills', 'primary', 'SKILL.md'))
      ).toBe(true);
      expect(fs.existsSync(path.join(pluginDest, 'agents', 'grader.md'))).toBe(
        true
      );
    });
  });

  describe('when extra-skills are provided', () => {
    it('should mount each extra skill alongside the primary', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const primary = path.join(tmp, 'src', 'skills', 'primary');
      const extra1 = path.join(tmp, 'src', 'skills', 'helper-a');
      const extra2 = path.join(tmp, 'src', 'skills', 'helper-b');
      for (const p of [primary, extra1, extra2]) {
        fs.mkdirSync(p, { recursive: true });
        fs.writeFileSync(path.join(p, 'SKILL.md'), '# ' + path.basename(p));
      }
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(primary, dest, {
        extraSkillPaths: [extra1, extra2],
      });

      // Assert
      expect(
        fs.existsSync(path.join(dest, 'skills', 'primary', 'SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dest, 'skills', 'helper-a', 'SKILL.md'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dest, 'skills', 'helper-b', 'SKILL.md'))
      ).toBe(true);
    });
  });

  describe('when extra-agents are provided', () => {
    it('should mount only the listed agents (overriding auto-mount)', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const agentsSrc = path.join(tmp, 'src', 'agents');
      fs.mkdirSync(agentsSrc, { recursive: true });
      fs.writeFileSync(path.join(agentsSrc, 'grader.md'), '# grader');
      fs.writeFileSync(path.join(agentsSrc, 'reviewer.md'), '# reviewer');
      const onlyAgent = path.join(agentsSrc, 'grader.md');
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(skillSrc, dest, {
        extraAgentPaths: [onlyAgent],
      });

      // Assert: grader is mounted, reviewer is NOT (explicit list overrides auto-mount)
      expect(fs.existsSync(path.join(dest, 'agents', 'grader.md'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'agents', 'reviewer.md'))).toBe(
        false
      );
    });
  });

  describe('when extra-hooks are provided', () => {
    it('should mount each hook directory under plugin/hooks/', () => {
      // Arrange
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sk-'));
      const skillSrc = path.join(tmp, 'src', 'skills', 'primary');
      fs.mkdirSync(skillSrc, { recursive: true });
      fs.writeFileSync(path.join(skillSrc, 'SKILL.md'), '# primary');
      const hookSrc = path.join(tmp, 'src', 'hooks', 'on-stop');
      fs.mkdirSync(hookSrc, { recursive: true });
      fs.writeFileSync(path.join(hookSrc, 'hooks.json'), '{"hooks":{}}');
      const dest = path.join(tmp, 'work', 'plugin');

      // Act
      installSkillPlugin(skillSrc, dest, {
        extraHookPaths: [hookSrc],
      });

      // Assert
      expect(
        fs.existsSync(path.join(dest, 'hooks', 'on-stop', 'hooks.json'))
      ).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- runner`

Expected: FAIL. `installSkillPlugin` does not accept an options object; the auto-mount preservation test should currently pass (it tests existing behavior).

- [ ] **Step 3: Generalize `installSkillPlugin`**

Replace the existing `installSkillPlugin` in `src/core/runner.ts` with:

```ts
/**
 * Install the skill under test (and any extra plugin assets) at the given path.
 * Creates:
 *   {pluginPath}/skills/{primary-skill}/        -- primary skill files
 *   {pluginPath}/skills/{extra-skill-name}/...  -- each extra skill
 *   {pluginPath}/agents/                        -- either auto-copied from the
 *                                                  primary skill's source plugin
 *                                                  root (when no extraAgentPaths
 *                                                  are passed) OR populated only
 *                                                  from the listed extraAgentPaths.
 *   {pluginPath}/hooks/{hook-name}/...          -- each extra hook directory
 *   {pluginPath}/.claude-plugin/plugin.json     -- bare plugin manifest
 * Returns the plugin dir path to pass via --plugin-dir, or null if primary not found.
 */
export interface InstallSkillPluginOptions {
  extraSkillPaths?: string[];
  extraAgentPaths?: string[];
  extraHookPaths?: string[];
}

export function installSkillPlugin(
  skillSrcPath: string,
  pluginPath: string,
  options: InstallSkillPluginOptions = {}
): string | null {
  if (!skillSrcPath || !fs.existsSync(skillSrcPath)) {
    log.warn(`Skill path not found: ${skillSrcPath}`);
    return null;
  }

  const extraSkillPaths = options.extraSkillPaths ?? [];
  const extraAgentPaths = options.extraAgentPaths ?? [];
  const extraHookPaths = options.extraHookPaths ?? [];

  // Copy primary skill
  const primarySkillName = path.basename(skillSrcPath);
  copyDirSync(skillSrcPath, path.join(pluginPath, 'skills', primarySkillName));

  // Copy each extra skill (each lives at <repo>/<...>/skills/<name>/)
  for (const extra of extraSkillPaths) {
    const extraName = path.basename(extra);
    copyDirSync(extra, path.join(pluginPath, 'skills', extraName));
  }

  // Agent mounting:
  //   - If extraAgentPaths is non-empty: mount ONLY those listed agents.
  //   - If extraAgentPaths is empty: preserve current auto-mount behavior
  //     (copy the entire sibling agents/ dir of the primary skill's plugin).
  if (extraAgentPaths.length > 0) {
    const agentsDest = path.join(pluginPath, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });
    for (const agentFile of extraAgentPaths) {
      fs.copyFileSync(
        agentFile,
        path.join(agentsDest, path.basename(agentFile))
      );
    }
  } else {
    const sourcePluginRoot = path.dirname(path.dirname(skillSrcPath));
    const sourceAgentsDir = path.join(sourcePluginRoot, 'agents');
    if (
      fs.existsSync(sourceAgentsDir) &&
      fs.statSync(sourceAgentsDir).isDirectory()
    ) {
      copyDirSync(sourceAgentsDir, path.join(pluginPath, 'agents'));
    }
  }

  // Copy each extra hook directory
  for (const hook of extraHookPaths) {
    const hookName = path.basename(hook);
    copyDirSync(hook, path.join(pluginPath, 'hooks', hookName));
  }

  // Generate bare plugin manifest
  const pluginMetaDir = path.join(pluginPath, '.claude-plugin');
  fs.mkdirSync(pluginMetaDir, { recursive: true });
  const pluginJson = {
    name: 'my-plugins',
    description: 'Local plugin',
  };
  fs.writeFileSync(
    path.join(pluginMetaDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2),
    'utf-8'
  );

  return pluginPath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm.cmd test -- runner`

Expected: PASS for all four new tests; previously-passing runner tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts tests/core/runner.spec.ts
git commit -m "feat(runner): installSkillPlugin accepts extra skills, agents, hooks"
```

---

## Task 5: Wire `_runTestAsync` to Forward Extras From Manifest

**Files:**

- Modify: `src/core/runner.ts:624-715` (`_runTestAsync`)

This is glue. The manifest now carries the resolved paths; the runner needs to pass them through to `installSkillPlugin`.

- [ ] **Step 1: Read the manifest's new arrays**

In `src/core/runner.ts`, in `_runTestAsync`, after the existing `rawSkillPath` line (around line 626), add:

```ts
const rawExtraSkillPaths = manifest['extra-skill-paths'] ?? [];
const rawExtraAgentPaths = manifest['extra-agent-paths'] ?? [];
const rawExtraHookPaths = manifest['extra-hook-paths'] ?? [];

const extraSkillPaths = rawExtraSkillPaths.map((p) => path.resolve(cwd, p));
const extraAgentPaths = rawExtraAgentPaths.map((p) => path.resolve(cwd, p));
const extraHookPaths = rawExtraHookPaths.map((p) => path.resolve(cwd, p));
```

- [ ] **Step 2: Pass them into `installSkillPlugin`**

Replace the existing call (around line 713):

```ts
const pluginDir = skillPath
  ? installSkillPlugin(skillPath, pluginPath, {
      extraSkillPaths,
      extraAgentPaths,
      extraHookPaths,
    })
  : null;
```

- [ ] **Step 3: Run typecheck**

Run: `npm.cmd run typecheck`

Expected: clean. All `Manifest` consumers now updated.

- [ ] **Step 4: Run the full unit test suite**

Run: `npm.cmd test`

Expected: PASS for all 359+ tests. New tests should now be in the count.

- [ ] **Step 5: Commit**

```bash
git add src/core/runner.ts
git commit -m "feat(runner): forward extra-asset paths from manifest into plugin install"
```

---

## Task 6: Use New Feature in `skill-test-troubleshooting` Spec

**Files:**

- Modify: `skill-tests/skill-test-troubleshooting/skill-test-troubleshooting.spec.md` (frontmatter + STT-3, STT-4, STT-5)

- [ ] **Step 1: Add `extra-skills` to the spec's frontmatter**

Replace the frontmatter at the top of `skill-tests/skill-test-troubleshooting/skill-test-troubleshooting.spec.md`:

```yaml
---
name: skill-test-troubleshooting-tests
skill: skill-test-troubleshooting
extra-skills:
  - skill-unit
  - skill-test-design
tags: [slash-command, activation, diagnosis, autonomous]
---
```

- [ ] **Step 2: Restore STT-3's positive expectations**

In the same file, STT-3 currently has only the negative expectations as verifiable. Replace the **Expectations:** section under STT-3 with the original wording:

```markdown
**Expectations:**

- Activates the skill-unit skill (not the troubleshooting skill)
- Proceeds to execute the tests
```

(Negative expectations stay as written.)

- [ ] **Step 3: Restore STT-4's positive expectations**

Replace the **Expectations:** section under STT-4:

```markdown
**Expectations:**

- Activates the skill-unit skill and uses its transcript subcommand
- Presents the requested transcript content
```

- [ ] **Step 4: Restore STT-5's positive expectations**

Replace the **Expectations:** section under STT-5:

```markdown
**Expectations:**

- Activates the skill-test-design skill
- Proceeds with test authoring
```

- [ ] **Step 5: Verify the spec compiles and discovers correctly**

Run: `npm.cmd run su -- compile --test STT-3`

Expected: success, `extra-skill-paths` in the manifest contains `skills\skill-unit` and `skills\skill-test-design`. Confirm by reading the most recent `.skill-unit/runs/<ts>/manifests/skill-test-troubleshooting-tests.manifest.json`.

- [ ] **Step 6: Commit**

```bash
git add skill-tests/skill-test-troubleshooting/skill-test-troubleshooting.spec.md
git commit -m "test(stt): use extra-skills to mount peer skills for STT-3/4/5"
```

---

## Task 7: Documentation

**Files:**

- Modify: `skills/skill-unit/references/spec-format.md` (if present)
- Modify: `CLAUDE.md` (architecture-doc list, if appropriate)

- [ ] **Step 1: Check whether `references/spec-format.md` exists**

Run: `npm.cmd run -- ls skills/skill-unit/references/spec-format.md` (or just check the filesystem). If absent, skip Step 2.

- [ ] **Step 2: If present, document the three new fields**

Open `skills/skill-unit/references/spec-format.md` and add a section near the existing frontmatter reference:

````markdown
### Extra plugin assets

A spec may declare additional skills, agents, or hooks that the runner mounts in the per-test workspace beyond the primary `skill:`. All three fields are optional arrays of asset names.

```yaml
extra-skills:
  - other-skill
extra-agents:
  - reviewer
extra-hooks:
  - on-stop
```
````

Resolution rules:

- `extra-skills` looks under `.claude/skills/<name>/SKILL.md` then `skills/<name>/SKILL.md`.
- `extra-agents` looks under `.claude/agents/<name>.md` then `agents/<name>.md`.
- `extra-hooks` looks under `.claude/hooks/<name>/` (directory) then `hooks/<name>/`.

Unresolved names fail at compile time.

Specifying `extra-agents` overrides the default behavior of auto-mounting the primary skill's sibling `agents/` directory: only the listed agents are mounted. Omit the field to keep the auto-mount.

The `--skill X` filter still matches only the primary `skill:` field. Mounting another skill via `extra-skills` does not make this spec discoverable through a filter on that name.

````

- [ ] **Step 3: Update CLAUDE.md only if needed**

This change does not add or rename an architecture document, so the standing rule in CLAUDE.md does not trigger. No edit required.

- [ ] **Step 4: Commit**

```bash
git add skills/skill-unit/references/spec-format.md
git commit -m "docs: document extra-skills/agents/hooks spec frontmatter"
````

If `spec-format.md` does not exist, skip the commit entirely.

---

## Task 8: Final Verification

**Files:** none modified.

- [ ] **Step 1: Run typecheck**

Run: `npm.cmd run typecheck`

Expected: clean.

- [ ] **Step 2: Run lint**

Run: `npm.cmd run lint`

Expected: clean.

- [ ] **Step 3: Run the full unit test suite**

Run: `npm.cmd test`

Expected: all tests pass. The total count should be the original baseline (359) plus the tests added in Task 2 (6) and Task 3 (3) and Task 4 (4) = **372 tests**.

- [ ] **Step 4: Smoke-discover via CLI**

Run: `npm.cmd run su -- ls --skill skill-test-troubleshooting`

Expected: all 14 STT test cases listed, no errors.

- [ ] **Step 5: Stop here**

Do NOT run the paid skill tests (`npm run test:skills`) from this plan. That validation is the next, separate work item ("Build STT fixtures and verify all 14 tests pass"), which the user will start after reviewing this implementation.

---

## Self-Review

**Spec coverage check (against [docs/specs/2026-05-20-multi-asset-spec-frontmatter-design.md](docs/specs/2026-05-20-multi-asset-spec-frontmatter-design.md)):**

| Spec section                         | Covered by                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| Frontmatter fields                   | Task 1, Task 6                                                                         |
| Resolution semantics                 | Task 2, Task 3                                                                         |
| Compile-time fail on unresolved      | Task 3 (Step 1 test #3, Step 3)                                                        |
| Runner behavior + plugin tree layout | Task 4, Task 5                                                                         |
| Agent auto-mount compatibility rule  | Task 4 (Step 1 test #1 + #3, Step 3)                                                   |
| Hook directory mounting              | Task 4 (Step 1 test #4, Step 3)                                                        |
| Manifest schema                      | Task 1                                                                                 |
| Filtering: `--skill X` unchanged     | Not modified; existing tests in `tests/core/discovery.spec.ts` continue to assert this |
| Unit tests                           | Task 2, Task 3, Task 4                                                                 |
| Integration test (STT-3/4/5)         | Task 6                                                                                 |
| Docs                                 | Task 7                                                                                 |

**Placeholder scan:** No TBDs, no "implement later". Every code step has complete code. Every test step has full test bodies. Expected outputs are stated for every command.

**Type consistency:** `Manifest` adds `extra-skill-paths`, `extra-agent-paths`, `extra-hook-paths` (Task 1). `buildManifest` populates them (Task 3). `_runTestAsync` reads them under the same keys (Task 5). `installSkillPlugin` accepts an options object with `extraSkillPaths`, `extraAgentPaths`, `extraHookPaths` (Task 4). Note the case difference: manifest keys are kebab-case (matching the rest of the manifest), runtime options are camelCase (matching project TS style).

No issues found.
