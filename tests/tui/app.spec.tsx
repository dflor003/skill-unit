import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';

// Mock @inkjs/ui to avoid ESM linking issues in vmForks pool
vi.mock('@inkjs/ui', () => ({
  Select: () => null,
  TextInput: () => null,
}));

import { App } from '../../src/tui/app.js';

describe('App', () => {
  it('renders with bottom bar', () => {
    const { lastFrame } = render(<App />);
    const output = lastFrame()!;
    expect(output).toContain('Dashboard');
  });

  it('shows dashboard by default', () => {
    const { lastFrame } = render(<App />);
    const output = lastFrame()!;
    expect(output).toBeDefined();
  });
});
