import { describe, it, expect } from 'vitest';
import { discoverSpecPaths, filterSpecs } from '../../src/core/discovery.js';
import type { Spec, SpecFilter } from '../../src/types/spec.js';

describe('discoverSpecPaths', () => {
  it('finds .spec.md files in test directory', () => {
    // Uses real filesystem - relies on skill-tests/ existing
    const paths = discoverSpecPaths('skill-tests');
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/\.spec\.md$/);
    }
  });

  it('excludes files inside fixtures directories', () => {
    const paths = discoverSpecPaths('skill-tests');
    for (const p of paths) {
      expect(p).not.toMatch(/fixtures[/\\]/);
    }
  });
});

describe('filterSpecs', () => {
  const specs: Spec[] = [
    {
      path: 'skill-tests/runner.spec.md',
      frontmatter: { name: 'runner-tests', tags: ['integration', 'core'], skill: 'skill-unit' },
      testCases: [
        { id: 'TEST-1', name: 'basic-usage', prompt: 'test', expectations: [], 'negative-expectations': [] },
        { id: 'TEST-2', name: 'error-case', prompt: 'test', expectations: [], 'negative-expectations': [] },
      ],
    },
    {
      path: 'skill-tests/design.spec.md',
      frontmatter: { name: 'design-tests', tags: ['e2e'], skill: 'test-design' },
      testCases: [
        { id: 'TEST-1', name: 'design-flow', prompt: 'test', expectations: [], 'negative-expectations': [] },
      ],
    },
  ];

  it('returns all specs when no filters applied', () => {
    const result = filterSpecs(specs, {});
    expect(result).toHaveLength(2);
  });

  it('filters by tag', () => {
    const result = filterSpecs(specs, { tag: ['e2e'] });
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.name).toBe('design-tests');
  });

  it('filters by name', () => {
    const result = filterSpecs(specs, { name: ['runner-tests'] });
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.name).toBe('runner-tests');
  });

  it('filters by file path', () => {
    const result = filterSpecs(specs, { file: ['skill-tests/design.spec.md'] });
    expect(result).toHaveLength(1);
  });

  it('filters by test ID', () => {
    const result = filterSpecs(specs, { test: ['TEST-2'] });
    expect(result).toHaveLength(1);
    expect(result[0].testCases).toHaveLength(1);
    expect(result[0].testCases[0].id).toBe('TEST-2');
  });
});
