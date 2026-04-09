import React, { useRef, useState, useEffect } from 'react';
import { Box, Text, type DOMElement, measureElement } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

interface MarkdownProps {
  content: string;
}

// ANSI escape helpers
const BOLD_ON = '\x1b[1m';
const BOLD_OFF = '\x1b[22m';
const ITALIC_ON = '\x1b[3m';
const ITALIC_OFF = '\x1b[23m';
const WHITE = '\x1b[37m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const DIM_OFF = '\x1b[22m';
const RESET = '\x1b[0m';

function renderMarkdown(content: string, width: number): string {
  const m = new Marked();
  m.use(markedTerminal({ showSectionPrefix: false, width }));
  m.use({
    renderer: {
      heading(token) {
        const text = m.parseInline(token.text);
        const depth = token.depth;
        if (depth <= 1) {
          // H1: bold cyan, underlined with ─
          return `\n${BOLD_ON}${CYAN}${text}${RESET}\n\n`;
        } else if (depth === 2) {
          // H2: bold white
          return `\n${BOLD_ON}${WHITE}${text}${RESET}\n\n`;
        } else if (depth === 3) {
          // H3: bold + italic white
          return `\n${BOLD_ON}${ITALIC_ON}${WHITE}${text}${RESET}${ITALIC_OFF}${BOLD_OFF}\n\n`;
        }
        // H4+: bright white, not bold
        return `\n${WHITE}${text}${RESET}\n\n`;
      },
      strong(token) {
        return `${BOLD_ON}${WHITE}${token.text}${RESET}${BOLD_OFF}`;
      },
      blockquote(token) {
        const body = m.parser(token.tokens);
        // Strip trailing newlines from body, add bar prefix to each line
        const lines = body.replace(/\n+$/, '').split('\n');
        const prefixed = lines
          .map((line) => `${DIM}│${DIM_OFF} ${line}`)
          .join('\n');
        return prefixed + '\n\n';
      },
      hr() {
        return '\n' + '─'.repeat(width) + '\n\n';
      },
      list(token) {
        // markedTerminal does not process inline markdown (bold, italic)
        // inside list items. Override list rendering to run parseInline
        // on each item so **bold** etc. get rendered correctly.
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

export function Markdown({ content }: MarkdownProps) {
  const ref = useRef<DOMElement>(null);
  const [width, setWidth] = useState(80);

  useEffect(() => {
    if (ref.current) {
      const { width: measured } = measureElement(ref.current);
      if (measured > 0) setWidth(measured);
    }
  });

  const rendered = renderMarkdown(content, width);

  return (
    <Box ref={ref} flexGrow={1} flexDirection="column">
      <Text>{rendered}</Text>
    </Box>
  );
}
