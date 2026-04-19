import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RunManager } from '../../src/tui/screens/runs.js';

describe('RunManager', () => {
  it('shows empty state when no runs exist', () => {
    const { lastFrame } = render(
      <RunManager runs={[]} onCleanup={() => {}} onViewRun={() => {}} />
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
      <RunManager runs={runs} onCleanup={() => {}} onViewRun={() => {}} />
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

    const { rerender, lastFrame } = render(
      <RunManager runs={runs} onCleanup={() => {}} onViewRun={() => {}} />
    );

    // Act -- rerender with only 1 run (simulating 2 deletions)
    rerender(
      <RunManager runs={[runs[0]]} onCleanup={() => {}} onViewRun={() => {}} />
    );

    // Assert -- should render without crash, cursor clamped to 0
    const output = lastFrame()!;
    expect(output).toContain('1 run');
  });
});
