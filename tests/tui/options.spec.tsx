import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Options } from '../../src/tui/screens/options.js';

const defaultConfig = {
  'test-dir': 'skill-tests',
  runner: { tool: 'claude', model: null, 'max-turns': 10, 'runner-concurrency': 5 },
  output: { format: 'interactive' as const, 'show-passing-details': false, 'log-level': 'info' as const },
  execution: { timeout: '120s', 'grader-concurrency': 5 },
  defaults: { setup: 'setup.sh', teardown: 'teardown.sh' },
};

describe('Options', () => {
  it('renders config fields', () => {
    const { lastFrame } = render(<Options config={defaultConfig} onSave={() => {}} />);
    const output = lastFrame()!;
    expect(output).toContain('claude');
  });
});
