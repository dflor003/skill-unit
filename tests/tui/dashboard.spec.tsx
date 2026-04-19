import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Mock selection persistence so tests start with no pre-selected tests
vi.mock('../../src/core/selection.js', () => ({
  loadSelection: () => ({ selectedTests: new Set(), viewMode: 'primary' }),
  saveSelection: () => {},
}));

import { Dashboard } from '../../src/tui/screens/dashboard.js';
import { KeyboardRegistryProvider } from '../../src/tui/keyboard/index.js';

function renderDashboard(props: React.ComponentProps<typeof Dashboard>) {
  return render(
    <KeyboardRegistryProvider>
      <Dashboard {...props} />
    </KeyboardRegistryProvider>
  );
}

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
    const { lastFrame } = renderDashboard({
      specs: mockSpecs,
      testDir: 'skill-tests',
      onRunTests: () => {},
    });
    const output = lastFrame()!;
    expect(output).toContain('basic-usage');
    expect(output).toContain('error-case');
  });

  it('shows test count', () => {
    const { lastFrame } = renderDashboard({
      specs: mockSpecs,
      testDir: 'skill-tests',
      onRunTests: () => {},
    });
    const output = lastFrame()!;
    expect(output).toContain('2');
  });

  it('does not run tests when Enter is pressed with no selection', () => {
    // Arrange
    const onRunTests = vi.fn();
    const { stdin } = renderDashboard({
      specs: mockSpecs,
      testDir: 'skill-tests',
      onRunTests,
    });

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
      const { stdin, lastFrame } = renderDashboard({
        specs,
        testDir: 'skill-tests',
        onRunTests,
      });

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
      const { lastFrame } = renderDashboard({
        specs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('skill-unit > empty-project');
      expect(output).toContain('skill-unit > setup > bootstrap');
      expect(output).toContain('first');
      expect(output).toContain('second');
    });
  });

  it('runs selected tests when Enter is pressed', async () => {
    // Arrange -- cursor starts on the group; arrow down to land on first test
    const onRunTests = vi.fn();
    const { stdin, lastFrame } = renderDashboard({
      specs: mockSpecs,
      testDir: 'skill-tests',
      onRunTests,
    });

    // Act -- move from group to TEST-1, select it with space, then Enter
    stdin.write('\x1b[B'); // arrow down
    await vi.waitFor(() => {
      expect(lastFrame()).toMatch(/>\s+\[ \]\s+TEST-1\s+basic-usage/);
    });
    await new Promise((r) => setImmediate(r));
    stdin.write(' ');
    await vi.waitFor(() => {
      expect(lastFrame()).toContain('(1 selected)');
    });
    await new Promise((r) => setImmediate(r));
    stdin.write('\r');
    await vi.waitFor(() => {
      expect(onRunTests).toHaveBeenCalledTimes(1);
    });

    // Assert
    expect(onRunTests.mock.calls[0][0]).toHaveLength(1);
    expect(onRunTests.mock.calls[0][0][0].testCase.id).toBe('TEST-1');
  });

  describe('when cursor is on a group', () => {
    it('should select all tests in the group when Space is pressed', async () => {
      // Arrange -- cursor starts on the group header (index 0)
      const onRunTests = vi.fn();
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests,
      });

      // Act
      stdin.write(' ');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('(2 selected)');
      });

      // Assert
      expect(lastFrame()).toContain('(2 selected)');
    });

    it('should deselect all tests in the group when Space is pressed again', async () => {
      // Arrange
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Act -- select then deselect
      stdin.write(' ');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('(2 selected)');
      });
      stdin.write(' ');
      await vi.waitFor(() => {
        expect(lastFrame()).not.toContain('selected');
      });

      // Assert
      expect(lastFrame()).not.toContain('selected');
    });
  });

  describe('group checkbox states', () => {
    it('should render [ ] when no tests in the group are selected', () => {
      // Arrange / Act
      const { lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Assert
      const output = lastFrame()!;
      expect(output).toMatch(/\[ \]\s+runner/);
    });

    it('should render [x] when all tests in the group are selected', async () => {
      // Arrange
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Act -- space on group to select all
      stdin.write(' ');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('(2 selected)');
      });

      // Assert
      expect(lastFrame()!).toMatch(/\[x\]\s+runner/);
    });

    it('should render [-] when some but not all tests are selected', async () => {
      // Arrange -- navigate to first test, select just that one
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Act -- arrow down to test, space to select one
      stdin.write('\x1b[B');
      await vi.waitFor(() => {
        expect(lastFrame()).toMatch(/>\s+\[ \]\s+TEST-1\s+basic-usage/);
      });
      await new Promise((r) => setImmediate(r));
      stdin.write(' ');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('(1 selected)');
      });

      // Assert
      expect(lastFrame()!).toMatch(/\[-\]\s+runner/);
    });
  });

  describe('when the user is typing a search query', () => {
    it('should route action keys into the query instead of firing actions', async () => {
      // Arrange
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Act -- typing "sa" includes an 'a' which used to trigger select-all
      stdin.write('s');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('s');
      });
      stdin.write('a');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('sa');
      });

      // Assert -- nothing should have been selected; 'a' went into query
      expect(lastFrame()).not.toContain('selected');
    });

    it('should clear the query when Esc is pressed', async () => {
      // Arrange
      const { stdin, lastFrame } = renderDashboard({
        specs: mockSpecs,
        testDir: 'skill-tests',
        onRunTests: () => {},
      });

      // Act -- type something, then press Esc
      stdin.write('abc');
      await vi.waitFor(() => {
        expect(lastFrame()).toContain('abc');
      });
      stdin.write('\x1b'); // Esc
      await vi.waitFor(() => {
        expect(lastFrame()).not.toContain('abc');
      });

      // Assert
      expect(lastFrame()).not.toContain('abc');
    });
  });
});
