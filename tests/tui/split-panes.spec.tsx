import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SplitPanes } from '../../src/tui/components/split-panes.js';

describe('SplitPanes', () => {
  it('renders grid of session panes', () => {
    const sessions = [
      { id: 'TEST-1', name: 'basic', status: 'running' as const, transcript: ['User: do it'], durationMs: 1000 },
      { id: 'TEST-2', name: 'error', status: 'running' as const, transcript: ['User: fail'], durationMs: 2000 },
    ];
    const { lastFrame } = render(
      <SplitPanes sessions={sessions} focusedId="TEST-1" maximizedId={null} />
    );
    const output = lastFrame()!;
    expect(output).toContain('basic');
    expect(output).toContain('error');
  });
});
