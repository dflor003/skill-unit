import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { Markdown } from '../../src/tui/components/markdown.js';

/** Mirror the renderMarkdown helper from the component */
function renderMarkdown(content: string, width: number): string {
  const m = new Marked();
  m.use(markedTerminal({ showSectionPrefix: false, width }));
  m.use({
    renderer: {
      hr() {
        return '\n' + '─'.repeat(width) + '\n\n';
      },
    },
  });
  return m.parse(content) as string;
}

describe('Markdown', () => {
  describe('renderMarkdown output', () => {
    it('when rendering ## headings should not contain raw hashes', () => {
      // Act
      const result = renderMarkdown('## Turn 1', 80);

      // Assert
      expect(result).not.toContain('##');
      expect(result).toContain('Turn 1');
    });

    it('when rendering **bold** should not contain raw asterisks', () => {
      // Act
      const result = renderMarkdown('**Model:** claude-opus', 80);

      // Assert
      expect(result).not.toContain('**');
      expect(result).toContain('Model:');
    });

    it('when rendering --- should produce a ─ horizontal rule', () => {
      // Act
      const result = renderMarkdown('above\n\n---\n\nbelow', 40);

      // Assert
      expect(result).toContain('─'.repeat(40));
      expect(result).not.toMatch(/^---$/m);
    });

    it('when called should return a string, not a Promise', () => {
      // Act
      const result = renderMarkdown('hello', 80);

      // Assert
      expect(typeof result).toBe('string');
    });

    it('when rendering a transcript snippet should format headings', () => {
      // Arrange
      const input = [
        '## Turn 1',
        '',
        '    Tokens -- in: 3 | cache write: 10081 | out: 56',
        '',
        'Skill: **my-plugins:test-design** -- Write a single test case',
        '',
        '---',
        '',
        '## Turn 3',
        '',
        '    Tokens -- in: 3 | cache read: 10081 | out: 23',
        '',
        'Glob: **/*.spec.md',
      ].join('\n');

      // Act
      const result = renderMarkdown(input, 60);

      // Assert
      expect(result).not.toMatch(/^##\s/m);
      expect(result).toContain('─'.repeat(60));
    });

    it('when given different widths should size the HR accordingly', () => {
      // Act
      const narrow = renderMarkdown('---', 30);
      const wide = renderMarkdown('---', 100);

      // Assert
      expect(narrow).toContain('─'.repeat(30));
      expect(narrow).not.toContain('─'.repeat(31));
      expect(wide).toContain('─'.repeat(100));
    });
  });

  describe('Ink component rendering', () => {
    it('when rendering plain text should display it', () => {
      // Act
      const { lastFrame } = render(<Markdown content="Hello world" />);

      // Assert
      expect(lastFrame()!).toContain('Hello world');
    });

    it('when rendering bold markdown should not show raw asterisks', () => {
      // Act
      const { lastFrame } = render(<Markdown content="**bold text** here" />);
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('bold text');
      expect(output).not.toContain('**');
    });

    it('when rendering headings should not show raw hashes', () => {
      // Act
      const { lastFrame } = render(<Markdown content="## My Heading" />);
      const output = lastFrame()!;

      // Assert
      expect(output).toContain('My Heading');
      expect(output).not.toContain('##');
    });
  });
});
