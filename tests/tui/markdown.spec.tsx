import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import { Markdown } from '../../src/tui/components/markdown.js';

const BOLD_ON = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';
const ITALIC_ON = '\x1b[3m';
const ITALIC_OFF = '\x1b[23m';
const WHITE = '\x1b[37m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const DIM_OFF = '\x1b[22m';
const RESET = '\x1b[0m';

/** Mirror the renderMarkdown helper from the component */
function renderMarkdown(content: string, width: number): string {
  const m = new Marked();
  m.use(markedTerminal({ showSectionPrefix: false, width }));
  m.use({
    renderer: {
      heading(token) {
        const text = m.parseInline(token.text);
        const depth = token.depth;
        if (depth <= 1) {
          return `\n${BOLD_ON}${CYAN}${text}${RESET}\n\n`;
        } else if (depth === 2) {
          return `\n${BOLD_ON}${WHITE}${text}${RESET}\n\n`;
        } else if (depth === 3) {
          return `\n${BOLD_ON}${ITALIC_ON}${WHITE}${text}${RESET}${ITALIC_OFF}${BOLD_OFF}\n\n`;
        }
        return `\n${WHITE}${text}${RESET}\n\n`;
      },
      strong(token) {
        return `${BOLD_ON}${WHITE}${token.text}${RESET}${BOLD_OFF}`;
      },
      blockquote(token) {
        const body = m.parser(token.tokens);
        const lines = body.replace(/\n+$/, '').split('\n');
        const prefixed = lines
          .map((line: string) => `${DIM}│${DIM_OFF} ${line}`)
          .join('\n');
        return prefixed + '\n\n';
      },
      hr() {
        return '\n' + '─'.repeat(width) + '\n\n';
      },
      list(token) {
        const items = (token.items || []).map((item) => {
          const parsed = m.parseInline(item.text);
          return '    * ' + parsed;
        });
        return items.join('\n') + '\n\n';
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

    it('when rendering **bold** should apply ANSI bold and not contain raw asterisks', () => {
      // Act
      const result = renderMarkdown('**Model:** claude-opus', 80);

      // Assert
      expect(result).not.toContain('**');
      expect(result).toContain('Model:');
      expect(result).toContain(BOLD_ON);
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

    it('when rendering bold inside list items should not contain raw asterisks', () => {
      // Arrange
      const input =
        '* **Model:** claude-haiku\n* **Skills:** update-config\n* **CWD:** /some/path';

      // Act
      const result = renderMarkdown(input, 80);

      // Assert
      expect(result).not.toContain('**');
      expect(result).toContain('Model:');
      expect(result).toContain('Skills:');
      expect(result).toContain('CWD:');
    });

    it('when rendering a session init block should format bold labels in list', () => {
      // Arrange
      const input = [
        '- **Model:** claude-haiku-4-5-20251001',
        '- **Skills:** update-config, debug, simplify',
        '- **CWD:** C:\\Projects\\skill-unit\\.workspace\\work',
      ].join('\n');

      // Act
      const result = renderMarkdown(input, 80);

      // Assert
      expect(result).not.toContain('**');
      expect(result).toContain('Model:');
      expect(result).toContain('CWD:');
    });

    it('when rendering h2 should apply bold white', () => {
      // Act
      const result = renderMarkdown('## Turn 1', 80);

      // Assert
      expect(result).toContain(BOLD_ON);
      expect(result).toContain(WHITE);
      expect(result).toContain('Turn 1');
      expect(result).not.toContain(CYAN);
    });

    it('when rendering h3 should apply bold + italic white', () => {
      // Act
      const result = renderMarkdown('### Usage Summary', 80);

      // Assert
      expect(result).toContain(BOLD_ON);
      expect(result).toContain(ITALIC_ON);
      expect(result).toContain(WHITE);
      expect(result).toContain('Usage Summary');
    });

    it('when rendering h4 should apply bright white without bold', () => {
      // Act
      const result = renderMarkdown('#### Details', 80);

      // Assert
      expect(result).toContain(WHITE);
      expect(result).toContain('Details');
      // Should not have bold ON immediately before the text
      const idx = result.indexOf('Details');
      const before = result.substring(Math.max(0, idx - 20), idx);
      expect(before).not.toContain(BOLD_ON);
    });

    it('when rendering blockquotes should use a vertical bar prefix', () => {
      // Act
      const result = renderMarkdown('> Tokens -- in: 10 | out: 56', 80);

      // Assert
      expect(result).toContain('│');
      expect(result).toContain('Tokens');
      // Should not be indented with 4 spaces (old style)
      expect(result).not.toMatch(/^ {4}Tokens/m);
    });

    it('when rendering multi-line blockquotes should prefix each line', () => {
      // Act
      const result = renderMarkdown('> line one\n> line two', 80);

      // Assert
      const barCount = (result.match(/│/g) || []).length;
      expect(barCount).toBeGreaterThanOrEqual(1);
      expect(result).toContain('line one');
      expect(result).toContain('line two');
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
