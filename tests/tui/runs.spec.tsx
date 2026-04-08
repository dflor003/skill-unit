import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunManager } from '../../src/tui/screens/runs.js';

describe('RunManager', () => {
  it('shows empty state when no runs exist', () => {
    const { lastFrame } = render(
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
    const { lastFrame } = render(
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
});
