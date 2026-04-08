import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Statistics } from '../../src/tui/screens/stats.js';

describe('Statistics', () => {
  it('shows zero state for empty data', () => {
    const emptyIndex = {
      version: 1,
      lastUpdated: '',
      aggregate: {
        totalRuns: 0,
        totalTests: 0,
        passRate: 0,
        totalCost: 0,
        totalTokens: 0,
      },
      tests: {},
      runs: [],
    };
    const { lastFrame } = render(<Statistics index={emptyIndex} />);
    expect(lastFrame()!).toContain('0');
  });

  it('renders aggregate stats', () => {
    const index = {
      version: 1,
      lastUpdated: '',
      aggregate: {
        totalRuns: 10,
        totalTests: 50,
        passRate: 0.85,
        totalCost: 2.5,
        totalTokens: 100000,
      },
      tests: {},
      runs: [],
    };
    const { lastFrame } = render(<Statistics index={index} />);
    const output = lastFrame()!;
    expect(output).toContain('10');
    expect(output).toContain('85');
  });
});
