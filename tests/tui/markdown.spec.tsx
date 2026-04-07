import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Markdown } from '../../src/tui/components/markdown.js';

describe('Markdown', () => {
  it('renders plain text', () => {
    const { lastFrame } = render(<Markdown content="Hello world" />);
    expect(lastFrame()!).toContain('Hello world');
  });

  it('renders markdown with formatting', () => {
    const { lastFrame } = render(<Markdown content="**bold** and `code`" />);
    const output = lastFrame()!;
    expect(output).toContain('bold');
    expect(output).toContain('code');
  });
});
