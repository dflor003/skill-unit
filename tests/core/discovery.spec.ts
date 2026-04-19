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
      frontmatter: {
        name: 'runner-tests',
        tags: ['integration', 'core'],
        skill: 'skill-unit',
      },
      testCases: [
        {
          id: 'TEST-1',
          name: 'basic-usage',
          prompt: 'test',
          expectations: [],
          'negative-expectations': [],
        },
        {
          id: 'TEST-2',
          name: 'error-case',
          prompt: 'test',
          expectations: [],
          'negative-expectations': [],
        },
      ],
    },
    {
      path: 'skill-tests/design.spec.md',
      frontmatter: {
        name: 'design-tests',
        tags: ['e2e'],
        skill: 'test-design',
      },
      testCases: [
        {
          id: 'TEST-1',
          name: 'design-flow',
          prompt: 'test',
          expectations: [],
          'negative-expectations': [],
        },
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

  describe('when filtering by skill', () => {
    it('should match the exact skill field', () => {
      // Act
      const result = filterSpecs(specs, { skill: ['test-design'] });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].frontmatter.skill).toBe('test-design');
    });

    it('should support multiple skills', () => {
      // Act
      const result = filterSpecs(specs, {
        skill: ['test-design', 'skill-unit'],
      });

      // Assert
      expect(result).toHaveLength(2);
    });

    it('should not match specs without a skill field', () => {
      // Arrange
      const noSkillSpecs: Spec[] = [
        {
          path: 'skill-tests/x.spec.md',
          frontmatter: { name: 'x', tags: [] },
          testCases: [],
        },
      ];

      // Act
      const result = filterSpecs(noSkillSpecs, { skill: ['skill-unit'] });

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('when searching with partial match', () => {
    it('should match the spec name as a substring', () => {
      // Act
      const result = filterSpecs(specs, { search: 'runner' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].frontmatter.name).toBe('runner-tests');
      // Spec-level match keeps all test cases
      expect(result[0].testCases).toHaveLength(2);
    });

    it('should match the skill field as a substring', () => {
      // Act
      const result = filterSpecs(specs, { search: 'test-design' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].frontmatter.skill).toBe('test-design');
    });

    it('should match the file basename', () => {
      // Act
      const result = filterSpecs(specs, { search: 'design.spec' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].path).toContain('design.spec.md');
    });

    it('should narrow to matching test cases when only test names match', () => {
      // Act
      const result = filterSpecs(specs, { search: 'error' });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].testCases).toHaveLength(1);
      expect(result[0].testCases[0].name).toBe('error-case');
    });

    it('should match test case IDs case-insensitively', () => {
      // Act
      const result = filterSpecs(specs, { search: 'test-1' });

      // Assert
      // Both specs have a TEST-1 test case
      expect(result).toHaveLength(2);
    });

    it('should return nothing when no field matches', () => {
      // Act
      const result = filterSpecs(specs, { search: 'nonexistent-zzz' });

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
