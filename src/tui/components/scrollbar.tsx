import React from 'react';
import { Box, Text } from 'ink';

interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height: number;
}

export function Scrollbar({
  totalLines,
  visibleLines,
  scrollOffset,
  height,
}: ScrollbarProps) {
  if (totalLines <= visibleLines || height <= 0) {
    return <Box />;
  }

  const thumbHeight = Math.max(
    1,
    Math.round((height * visibleLines) / totalLines)
  );
  const maxOffset = Math.max(0, totalLines - visibleLines);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  // scrollOffset=0 means at bottom, scrollOffset=maxOffset means at top
  // We want thumb at bottom when offset=0, at top when offset=maxOffset
  const thumbTop =
    maxOffset > 0
      ? Math.round((clampedOffset / maxOffset) * (height - thumbHeight))
      : 0;

  const rows: string[] = [];
  for (let i = 0; i < height; i++) {
    // Invert: high offset = top of content = thumb at top of track
    const invertedPos = height - thumbHeight - thumbTop;
    if (i >= invertedPos && i < invertedPos + thumbHeight) {
      rows.push('\u2588'); // █
    } else {
      rows.push('\u2591'); // ░
    }
  }

  return (
    <Box flexDirection="column" width={1} marginLeft={1}>
      {rows.map((char, i) => (
        <Text key={i} color="gray">
          {char}
        </Text>
      ))}
    </Box>
  );
}
