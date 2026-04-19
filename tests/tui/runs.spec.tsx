import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunManager } from '../../src/tui/screens/runs.js';
import { KeyboardRegistryProvider } from '../../src/tui/keyboard/index.js';

const KEY_DELETE = '\x1b[3~';
const KEY_BACKSPACE = '\u007f';

function renderWithProvider(ui: React.ReactElement) {
  return render(<KeyboardRegistryProvider>{ui}</KeyboardRegistryProvider>);
}

describe('RunManager', () => {
  it('shows empty state when no runs exist', () => {
    const { lastFrame } = renderWithProvider(
      <RunManager
        runs={[]}
        onCleanup={() => {}}
        onDeleteRun={() => {}}
        onViewRun={() => {}}
      />
    );
    expect(lastFrame()!).toContain('No runs yet');
  });

  it('renders run list', () => {
    const runs = [
      {
        id: '2026-04-07-10-00-00',
        timestamp: '2026-04-07T10:00:00Z',
        testCount: 5,
        passed: 4,
        failed: 1,
        duration: 30000,
        cost: 0.1,
        tokens: 5000,
      },
    ];
    const { lastFrame } = renderWithProvider(
      <RunManager
        runs={runs}
        onCleanup={() => {}}
        onDeleteRun={() => {}}
        onViewRun={() => {}}
      />
    );
    const output = lastFrame()!;
    // Locale-formatted date should contain the year
    expect(output).toContain('2026');
  });

  it('clamps cursor when runs list shrinks', () => {
    // Arrange -- start with 3 runs, cursor at index 2
    const runs = [
      {
        id: 'run-a',
        timestamp: '2026-04-07T10:00:00Z',
        testCount: 2,
        passed: 1,
        failed: 1,
        duration: 5000,
        cost: 0.05,
        tokens: 3000,
      },
      {
        id: 'run-b',
        timestamp: '2026-04-07T11:00:00Z',
        testCount: 3,
        passed: 2,
        failed: 1,
        duration: 8000,
        cost: 0.08,
        tokens: 4000,
      },
      {
        id: 'run-c',
        timestamp: '2026-04-07T12:00:00Z',
        testCount: 1,
        passed: 1,
        failed: 0,
        duration: 2000,
        cost: 0.02,
        tokens: 1000,
      },
    ];

    const { rerender, lastFrame } = renderWithProvider(
      <RunManager
        runs={runs}
        onCleanup={() => {}}
        onDeleteRun={() => {}}
        onViewRun={() => {}}
      />
    );

    // Act -- rerender with only 1 run (simulating 2 deletions)
    rerender(
      <KeyboardRegistryProvider>
        <RunManager
          runs={[runs[0]]}
          onCleanup={() => {}}
          onDeleteRun={() => {}}
          onViewRun={() => {}}
        />
      </KeyboardRegistryProvider>
    );

    // Assert -- should render without crash, cursor clamped to 0
    const output = lastFrame()!;
    expect(output).toContain('1 run');
  });

  describe('delete key handling', () => {
    const runs = [
      {
        id: 'run-a',
        timestamp: '2026-04-07T10:00:00Z',
        testCount: 2,
        passed: 1,
        failed: 1,
        duration: 5000,
        cost: 0.05,
        tokens: 3000,
      },
      {
        id: 'run-b',
        timestamp: '2026-04-07T11:00:00Z',
        testCount: 3,
        passed: 2,
        failed: 1,
        duration: 8000,
        cost: 0.08,
        tokens: 4000,
      },
    ];

    it('should call onDeleteRun with the highlighted run when Delete is pressed', () => {
      // Arrange
      const onDeleteRun = vi.fn();
      const { stdin } = renderWithProvider(
        <RunManager
          runs={runs}
          onCleanup={() => {}}
          onDeleteRun={onDeleteRun}
          onViewRun={() => {}}
        />
      );

      // Act
      stdin.write(KEY_DELETE);

      // Assert
      expect(onDeleteRun).toHaveBeenCalledWith('run-a');
    });

    // Backspace and Delete both fire onDeleteRun in this ink version (ASCII
    // 0x7f from Backspace maps to `key.delete` per ink's parse-keypress). The
    // confirmation dialog in app.tsx guards against accidental deletes.
    it('should also call onDeleteRun when backspace is pressed', () => {
      // Arrange
      const onDeleteRun = vi.fn();
      const { stdin } = renderWithProvider(
        <RunManager
          runs={runs}
          onCleanup={() => {}}
          onDeleteRun={onDeleteRun}
          onViewRun={() => {}}
        />
      );

      // Act
      stdin.write(KEY_BACKSPACE);

      // Assert
      expect(onDeleteRun).toHaveBeenCalledWith('run-a');
    });

    it('should not call onDeleteRun when the runs list is empty', () => {
      // Arrange
      const onDeleteRun = vi.fn();
      const { stdin } = renderWithProvider(
        <RunManager
          runs={[]}
          onCleanup={() => {}}
          onDeleteRun={onDeleteRun}
          onViewRun={() => {}}
        />
      );

      // Act
      stdin.write(KEY_DELETE);

      // Assert
      expect(onDeleteRun).not.toHaveBeenCalled();
    });
  });
});
