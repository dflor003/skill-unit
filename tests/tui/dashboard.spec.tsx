import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
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
      <Dashboard specs={mockSpecs} onRunTests={() => {}} />
    );
    const output = lastFrame()!;
    expect(output).toContain('basic-usage');
    expect(output).toContain('error-case');
  });

  it('shows test count', () => {
    const { lastFrame } = render(
      <Dashboard specs={mockSpecs} onRunTests={() => {}} />
    );
    const output = lastFrame()!;
    expect(output).toContain('2');
  });
});
