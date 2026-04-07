import React from 'react';
import { Text } from 'ink';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';

marked.use(markedTerminal());

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  const rendered = marked(content) as string;
  return <Text>{rendered}</Text>;
}
