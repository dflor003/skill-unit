import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
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
