import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Mock selection persistence so tests start with no pre-selected tests
vi.mock('../../src/core/selection.js', () => ({
  loadSelection: () => ({ selectedTests: new Set(), viewMode: 'primary' }),
  saveSelection: () => {},
}));

import { Dashboard } from '../../src/tui/screens/dashboard.js';

const mockSpecs = [
  {
    path: 'skill-tests/runner.spec.md',
    frontmatter: { name: 'runner', tags: ['integration'], skill: 'skill-unit' },
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
];

describe('Dashboard', () => {
  it('renders test list', () => {
    const { lastFrame } = render(
      <Dashboard
        specs={mockSpecs}
        testDir="skill-tests"
        onRunTests={() => {}}
      />
    );
    const output = lastFrame()!;
    expect(output).toContain('basic-usage');
    expect(output).toContain('error-case');
  });

  it('shows test count', () => {
    const { lastFrame } = render(
      <Dashboard
        specs={mockSpecs}
        testDir="skill-tests"
        onRunTests={() => {}}
      />
    );
    const output = lastFrame()!;
    expect(output).toContain('2');
  });

  it('does not run tests when Enter is pressed with no selection', () => {
    // Arrange
    const onRunTests = vi.fn();
    const { stdin } = render(
      <Dashboard
        specs={mockSpecs}
        testDir="skill-tests"
        onRunTests={onRunTests}
      />
    );

    // Act -- press Enter with nothing selected
    stdin.write('\r');

    // Assert
    expect(onRunTests).not.toHaveBeenCalled();
  });

  describe('when Shift+A is pressed', () => {
    it('should select all tests in the spec at the cursor', async () => {
      // Arrange -- two specs, cursor starts on first test of first spec
      const specs = [
        {
          path: 'skill-tests/spec-a.spec.md',
          frontmatter: { name: 'spec-a', tags: [], skill: 'x' },
          testCases: [
            {
              id: 'A-1',
              name: 'a1',
              prompt: 'p',
              expectations: [],
              'negative-expectations': [],
            },
            {
              id: 'A-2',
              name: 'a2',
              prompt: 'p',
              expectations: [],
              'negative-expectations': [],
            },
          ],
        },
        {
          path: 'skill-tests/spec-b.spec.md',
          frontmatter: { name: 'spec-b', tags: [], skill: 'x' },
          testCases: [
            {
              id: 'B-1',
              name: 'b1',
              prompt: 'p',
              expectations: [],
              'negative-expectations': [],
            },
          ],
        },
      ];
      const onRunTests = vi.fn();
      const { stdin, lastFrame } = render(
        <Dashboard
          specs={specs}
          testDir="skill-tests"
          onRunTests={onRunTests}
        />
      );

      // Act -- Shift+A to select all in current spec, then Enter to run
      stdin.write('A');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('(2 selected)');
      });
      stdin.write('\r');
      await vi.waitFor(() => {
        expect(onRunTests).toHaveBeenCalledTimes(1);
      });

      // Assert -- only tests from spec-a should have run
      const runIds = onRunTests.mock.calls[0][0].map(
        (t: { testCase: { id: string } }) => t.testCase.id
      );
      expect(runIds).toEqual(['A-1', 'A-2']);
    });
  });

  describe('when tests span multiple specs and folders', () => {
    it('should render a breadcrumb header per spec file', () => {
      // Arrange
      const specs = [
        {
          path: 'skill-tests/skill-unit/empty-project.spec.md',
          frontmatter: { name: 'empty-project', tags: [], skill: 'skill-unit' },
          testCases: [
            {
              id: 'TEST-1',
              name: 'first',
              prompt: 'p',
              expectations: [],
              'negative-expectations': [],
            },
          ],
        },
        {
          path: 'skill-tests/skill-unit/setup/bootstrap.spec.md',
          frontmatter: { name: 'bootstrap', tags: [], skill: 'skill-unit' },
          testCases: [
            {
              id: 'TEST-2',
              name: 'second',
              prompt: 'p',
              expectations: [],
              'negative-expectations': [],
            },
          ],
        },
      ];

      // Act
      const { lastFrame } = render(
        <Dashboard specs={specs} testDir="skill-tests" onRunTests={() => {}} />
      );
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('skill-unit > empty-project');
      expect(output).toContain('skill-unit > setup > bootstrap');
      expect(output).toContain('first');
      expect(output).toContain('second');
    });
  });

  it('runs selected tests when Enter is pressed', async () => {
    // Arrange
    const onRunTests = vi.fn();
    const { stdin, lastFrame } = render(
      <Dashboard
        specs={mockSpecs}
        testDir="skill-tests"
        onRunTests={onRunTests}
      />
    );

    // Act -- press Space to select first test, wait for state update, then Enter
    stdin.write(' ');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('(1 selected)');
    });
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(onRunTests).toHaveBeenCalledTimes(1);
    });

    // Assert
    expect(onRunTests.mock.calls[0][0]).toHaveLength(1);
    expect(onRunTests.mock.calls[0][0][0].testCase.id).toBe('TEST-1');
  });
});
