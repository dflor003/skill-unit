import fs from 'node:fs';
import path from 'node:path';
import { parseYaml } from '../config/loader.js';
import type { SkillUnitConfig } from '../types/config.js';
import type { Spec, SpecFrontmatter, TestCase, Manifest, ManifestTestCase } from '../types/spec.js';

// -- Built-in defaults ---------------------------------------------------------

export const BUILT_IN_ALLOWED: string[] = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'Skill',
];

export const BUILT_IN_DISALLOWED: string[] = ['AskUserQuestion'];

// -- Spec file parsing ---------------------------------------------------------

export function parseFrontmatter(content: string): { frontmatter: SpecFrontmatter; body: string } {
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: { name: '', tags: [] }, body: content };

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx < 0) return { frontmatter: { name: '', tags: [] }, body: content };

  const yamlBlock = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  const parsed = parseYaml(yamlBlock);

  const frontmatter: SpecFrontmatter = {
    name: (parsed['name'] as string) ?? '',
    tags: (parsed['tags'] as string[]) ?? [],
    ...(parsed['skill'] !== undefined && { skill: parsed['skill'] as string }),
    ...(parsed['timeout'] !== undefined && { timeout: parsed['timeout'] as string }),
    ...(parsed['global-fixtures'] !== undefined && { 'global-fixtures': parsed['global-fixtures'] as string }),
    ...(parsed['setup'] !== undefined && { setup: parsed['setup'] as string }),
    ...(parsed['teardown'] !== undefined && { teardown: parsed['teardown'] as string }),
    ...(parsed['allowed-tools'] !== undefined && { 'allowed-tools': parsed['allowed-tools'] as string[] }),
    ...(parsed['allowed-tools-extra'] !== undefined && { 'allowed-tools-extra': parsed['allowed-tools-extra'] as string[] }),
    ...(parsed['disallowed-tools'] !== undefined && { 'disallowed-tools': parsed['disallowed-tools'] as string[] }),
    ...(parsed['disallowed-tools-extra'] !== undefined && { 'disallowed-tools-extra': parsed['disallowed-tools-extra'] as string[] }),
  };

  // Ensure tags defaults to []
  if (!frontmatter.tags) frontmatter.tags = [];

  return { frontmatter, body };
}

export function parseTestCases(body: string): TestCase[] {
  const testCases: TestCase[] = [];
  // Split on ### headings
  const sections = body.split(/^### /m);

  for (const section of sections) {
    if (!section.trim()) continue;

    const lines = section.split('\n');
    const heading = lines[0].trim();

    // Parse ID and name from heading
    const colonIdx = heading.indexOf(':');
    if (colonIdx < 0) continue; // Not a valid test case heading

    const id = heading.slice(0, colonIdx).trim();
    const name = heading.slice(colonIdx + 1).trim();

    // State machine for parsing sections
    let state: 'fixtures' | 'prompt' | 'expectations' | 'negative-expectations' | null = null;
    const fixtures: string[] = [];
    const promptLines: string[] = [];
    const expectations: string[] = [];
    const negativeExpectations: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect section labels
      if (trimmed === '**Fixtures:**') { state = 'fixtures'; continue; }
      if (trimmed === '**Prompt:**') { state = 'prompt'; continue; }
      if (trimmed === '**Expectations:**') { state = 'expectations'; continue; }
      if (trimmed === '**Negative Expectations:**') { state = 'negative-expectations'; continue; }

      // Horizontal rules are cosmetic
      if (/^---\s*$/.test(trimmed)) continue;

      // Collect content based on current state
      if (state === 'fixtures') {
        if (trimmed.startsWith('- ')) {
          fixtures.push(trimmed.slice(2).trim());
        } else if (trimmed && !trimmed.startsWith('**')) {
          // Non-blank, non-label line: could be description text, skip
        } else if (trimmed.startsWith('**')) {
          // Hit next label, re-process this line
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'prompt') {
        if (trimmed.startsWith('> ')) {
          promptLines.push(trimmed.slice(2));
        } else if (trimmed === '>') {
          promptLines.push('');
        } else if (trimmed === '') {
          // Blank line after prompt ends the prompt section
          if (promptLines.length > 0) state = null;
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'expectations') {
        if (trimmed.startsWith('- ')) {
          expectations.push(trimmed.slice(2).trim());
        } else if (trimmed === '') {
          // Blank line, continue collecting
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }

      if (state === 'negative-expectations') {
        if (trimmed.startsWith('- ')) {
          negativeExpectations.push(trimmed.slice(2).trim());
        } else if (trimmed === '') {
          // Blank line, continue collecting
        } else if (trimmed.startsWith('**')) {
          i--;
          state = null;
        }
        continue;
      }
    }

    const tc: TestCase = {
      id,
      name,
      prompt: promptLines.join('\n'),
      expectations,
      'negative-expectations': negativeExpectations,
    };
    if (fixtures.length) tc['fixture-paths'] = fixtures;

    testCases.push(tc);
  }

  return testCases;
}

export function parseSpecFile(filePath: string): Spec {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const testCases = parseTestCases(body);

  return {
    path: filePath,
    frontmatter,
    testCases,
  };
}

// -- Tool permission resolution -----------------------------------------------

type ToolPermissionConfig = {
  runner?: {
    'allowed-tools'?: string[];
    'disallowed-tools'?: string[];
  };
  'allowed-tools'?: string[];
  'disallowed-tools'?: string[];
};

type SpecPermissionOverride = {
  'allowed-tools'?: string[];
  'allowed-tools-extra'?: string[];
  'disallowed-tools'?: string[];
  'disallowed-tools-extra'?: string[];
};

export function resolveToolPermissions(
  config: ToolPermissionConfig,
  specFrontmatter: SpecPermissionOverride,
): { allowed: string[]; disallowed: string[] } {
  // Level 1: built-in defaults
  let allowed = [...BUILT_IN_ALLOWED];
  let disallowed = [...BUILT_IN_DISALLOWED];

  // Level 2: config overrides (support both flat and nested runner format)
  const configAllowed = config.runner?.['allowed-tools'] ?? (config as Record<string, unknown>)['allowed-tools'] as string[] | undefined;
  const configDisallowed = config.runner?.['disallowed-tools'] ?? (config as Record<string, unknown>)['disallowed-tools'] as string[] | undefined;

  if (configAllowed) {
    allowed = [...configAllowed];
  }
  if (configDisallowed) {
    disallowed = [...configDisallowed];
  }

  // Level 3: spec frontmatter overrides
  const fm = specFrontmatter ?? {};

  if (fm['allowed-tools']) {
    // Full replace (ignore -extra)
    allowed = [...fm['allowed-tools']];
  } else if (fm['allowed-tools-extra']) {
    // Union
    for (const tool of fm['allowed-tools-extra']) {
      if (!allowed.includes(tool)) allowed.push(tool);
    }
  }

  if (fm['disallowed-tools']) {
    disallowed = [...fm['disallowed-tools']];
  } else if (fm['disallowed-tools-extra']) {
    for (const tool of fm['disallowed-tools-extra']) {
      if (!disallowed.includes(tool)) disallowed.push(tool);
    }
  }

  // Conflict resolution: disallow wins
  allowed = allowed.filter((t) => !disallowed.includes(t));

  return { allowed, disallowed };
}

// -- Path resolution ----------------------------------------------------------

export function resolveFixturePath(
  fixturePath: string | null | undefined,
  specDir: string,
  repoRoot: string,
): string | null {
  if (!fixturePath) return null;
  const absolute = path.resolve(specDir, fixturePath);
  return path.relative(repoRoot, absolute);
}

export function resolveSkillPath(skillName: string | null | undefined, repoRoot: string): string | null {
  if (!skillName) return null;

  // Check .claude/skills/{name}/SKILL.md first, then skills/{name}/SKILL.md
  const candidates = [
    path.join(repoRoot, '.claude', 'skills', skillName, 'SKILL.md'),
    path.join(repoRoot, 'skills', skillName, 'SKILL.md'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.relative(repoRoot, path.dirname(candidate));
    }
  }

  return null;
}

// -- Manifest generation ------------------------------------------------------

export interface BuildManifestOptions {
  timestamp?: string;
  modelOverride?: string | null;
  timeoutOverride?: string | null;
  maxTurnsOverride?: number | null;
}

export function buildManifest(
  spec: Spec | { path: string; frontmatter: Partial<SpecFrontmatter> & Record<string, unknown>; testCases: Partial<TestCase>[] },
  config: SkillUnitConfig | { runner: { tool: string; model: string | null; 'max-turns': number; 'runner-concurrency'?: number; 'allowed-tools'?: string[]; 'disallowed-tools'?: string[] }; execution: { timeout: string; 'grader-concurrency': number } },
  options?: BuildManifestOptions,
): Manifest {
  const { timestamp, modelOverride, timeoutOverride, maxTurnsOverride } = options ?? {};
  const fm = spec.frontmatter;
  const specDir = path.dirname(spec.path);
  const repoRoot = process.cwd();

  // Resolve paths
  const globalFixturePath = fm['global-fixtures']
    ? resolveFixturePath(fm['global-fixtures'] as string, specDir, repoRoot)
    : null;

  const skillPath = resolveSkillPath(fm['skill'] as string | undefined, repoRoot);

  // Resolve tool permissions
  const { allowed, disallowed } = resolveToolPermissions(config as ToolPermissionConfig, fm as SpecPermissionOverride);

  // Resolve per-test fixture paths
  const testCases: ManifestTestCase[] = spec.testCases.map((tc) => {
    const entry: ManifestTestCase = { id: tc.id ?? '', prompt: tc.prompt ?? '' };
    if (tc['fixture-paths'] && (tc['fixture-paths'] as string[]).length) {
      entry['fixture-paths'] = (tc['fixture-paths'] as string[]).map((fp: string) =>
        resolveFixturePath(fp, specDir, repoRoot) ?? fp,
      );
    }
    return entry;
  });

  // Determine timeout: CLI override > spec frontmatter > config
  const timeout = timeoutOverride ?? (fm['timeout'] as string | undefined) ?? config.execution.timeout;

  // Determine model and max-turns with CLI overrides
  const model = modelOverride ?? config.runner.model;
  const maxTurns = maxTurnsOverride ?? config.runner['max-turns'];

  return {
    'spec-name': (fm['name'] as string) || path.basename(spec.path, '.spec.md'),
    'global-fixture-path': globalFixturePath,
    'skill-path': skillPath,
    timestamp: timestamp ?? formatTimestamp(new Date()),
    timeout: String(timeout),
    runner: {
      tool: config.runner.tool,
      model: model ?? null,
      'max-turns': maxTurns,
      'allowed-tools': allowed,
      'disallowed-tools': disallowed,
    },
    'test-cases': testCases,
  };
}

export function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}
