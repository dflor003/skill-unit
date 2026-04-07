import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ProgressTree } from '../../src/tui/components/progress-tree.js';
import { Ticker } from '../../src/tui/components/ticker.js';

describe('ProgressTree', () => {
  it('renders test cases with status icons', () => {
    const tests = [
      { id: 'TEST-1', name: 'basic', status: 'passed' as const, durationMs: 1200 },
      { id: 'TEST-2', name: 'error', status: 'running' as const, durationMs: 0 },
      { id: 'TEST-3', name: 'pending', status: 'pending' as const, durationMs: 0 },
    ];
    const { lastFrame } = render(<ProgressTree tests={tests} elapsed={5000} />);
    const output = lastFrame()!;
    expect(output).toContain('basic');
    expect(output).toContain('error');
    expect(output).toContain('pending');
  });

  it('when selectable should show checkboxes', () => {
    // Arrange
    const tests = [
      { id: 'TEST-1', name: 'basic', status: 'passed' as const, durationMs: 1200 },
      { id: 'TEST-2', name: 'error', status: 'failed' as const, durationMs: 3000 },
    ];
    const selected = new Set(['TEST-2']);

    // Act
    const { lastFrame } = render(
      <ProgressTree tests={tests} elapsed={5000} selectable selected={selected} />,
    );
    const output = lastFrame()!;

    // Assert
    expect(output).toContain('[x]');
    expect(output).toContain('[ ]');
    expect(output).toContain('basic');
    expect(output).toContain('error');
  });
});

describe('Ticker', () => {
  it('renders session tabs', () => {
    const sessions = [
      { id: 'TEST-1', name: 'basic', status: 'running' as const, activity: 'Using Read...' },
      { id: 'TEST-2', name: 'error', status: 'grading' as const, activity: 'Grading...' },
    ];
    const { lastFrame } = render(<Ticker sessions={sessions} activeId="TEST-1" />);
    const output = lastFrame()!;
    expect(output).toContain('basic');
    expect(output).toContain('error');
  });
});
