import React, { useRef, useState, useEffect } from 'react';
import { Box, Text, type DOMElement, measureElement } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

interface MarkdownProps {
  content: string;
}

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
