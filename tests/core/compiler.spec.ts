import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  parseTestCases,
  parseSpecFile,
  resolveToolPermissions,
  buildManifest,
  formatTimestamp,
  BUILT_IN_ALLOWED,
  BUILT_IN_DISALLOWED,
} from '../../src/core/compiler.js';

describe('parseFrontmatter', () => {
  it('extracts YAML frontmatter from markdown', () => {
    const content = '---\nname: my-tests\ntags: [a, b]\n---\n\n### TEST-1: hello';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter.name).toBe('my-tests');
    expect(frontmatter.tags).toEqual(['a', 'b']);
    expect(body).toContain('### TEST-1');
  });

  it('sets default empty tags when not specified', () => {
    const content = '---\nname: no-tags\n---\nbody';
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter.tags).toEqual([]);
  });
});

describe('parseTestCases', () => {
  it('parses a single test case', () => {
    const body = `
### TEST-1: basic-usage

**Prompt:**
> Do something interesting

**Expectations:**
- File should be created
- Output should contain "success"

**Negative Expectations:**
- Should not delete anything
`;
    const cases = parseTestCases(body);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe('TEST-1');
    expect(cases[0].name).toBe('basic-usage');
    expect(cases[0].prompt).toContain('Do something interesting');
    expect(cases[0].expectations).toHaveLength(2);
    expect(cases[0]['negative-expectations']).toHaveLength(1);
  });

  it('parses multiple test cases', () => {
    const body = `
### TEST-1: first

**Prompt:**
> First prompt

**Expectations:**
- First expectation

---

### TEST-2: second

**Prompt:**
> Second prompt

**Expectations:**
- Second expectation
`;
    const cases = parseTestCases(body);
    expect(cases).toHaveLength(2);
    expect(cases[0].id).toBe('TEST-1');
    expect(cases[1].id).toBe('TEST-2');
  });

  it('handles test case with fixtures', () => {
    const body = `
### TEST-1: with-fixtures

**Prompt:**
> Do the thing

**Fixtures:**
- fixtures/basic-setup

**Expectations:**
- It works
`;
    const cases = parseTestCases(body);
    expect(cases[0]['fixture-paths']).toEqual(['fixtures/basic-setup']);
  });
});

describe('resolveToolPermissions', () => {
  it('returns built-in defaults when no overrides', () => {
    const { allowed, disallowed } = resolveToolPermissions({}, {});
    expect(allowed).toEqual(BUILT_IN_ALLOWED);
    expect(disallowed).toEqual(BUILT_IN_DISALLOWED);
  });

  it('config allowed-tools replaces built-in', () => {
    const config = { 'allowed-tools': ['Read', 'Write'] };
    const { allowed } = resolveToolPermissions(config, {});
    expect(allowed).toEqual(['Read', 'Write']);
  });

  it('spec frontmatter overrides config', () => {
    const config = { 'allowed-tools': ['Read', 'Write'] };
    const spec = { 'allowed-tools': ['Bash'] };
    const { allowed } = resolveToolPermissions(config, spec);
    expect(allowed).toEqual(['Bash']);
  });

  it('extra tools append to base list', () => {
    const spec = { 'allowed-tools-extra': ['WebSearch'] };
    const { allowed } = resolveToolPermissions({}, spec);
    expect(allowed).toContain('WebSearch');
    expect(allowed).toContain('Read'); // built-in preserved
  });

  it('disallowed takes precedence over allowed', () => {
    const spec = { 'disallowed-tools-extra': ['Bash'] };
    const { allowed, disallowed } = resolveToolPermissions({}, spec);
    expect(disallowed).toContain('Bash');
    expect(allowed).not.toContain('Bash');
  });
});

describe('formatTimestamp', () => {
  it('formats date as YYYY-MM-DD-HH-MM-SS', () => {
    const date = new Date('2026-04-07T10:30:45Z');
    const result = formatTimestamp(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/);
  });
});

describe('buildManifest', () => {
  it('builds manifest from spec and config', () => {
    const spec = {
      path: 'skill-tests/runner.spec.md',
      frontmatter: { name: 'runner', tags: ['test'], skill: 'my-skill' },
      testCases: [
        { id: 'TEST-1', name: 'basic', prompt: 'do it', expectations: ['works'], 'negative-expectations': [] },
      ],
    };
    const config = {
      runner: { tool: 'claude', model: null, 'max-turns': 10, 'runner-concurrency': 5 },
      execution: { timeout: '120s', 'grader-concurrency': 5 },
    };

    const manifest = buildManifest(spec, config as any, { timestamp: '2026-04-07-10-00-00' });
    expect(manifest['spec-name']).toBe('runner');
    expect(manifest.timestamp).toBe('2026-04-07-10-00-00');
    expect(manifest['test-cases']).toHaveLength(1);
    expect(manifest['test-cases'][0].id).toBe('TEST-1');
    expect(manifest.runner.tool).toBe('claude');
  });
});
