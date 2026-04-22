import React from 'react';
import { Box, Text } from 'ink';

interface ScrollbarProps {
  totalLines: number;
  visibleLines: number;
  scrollOffset: number;
  height: number;
  // 'log' (default): scrollOffset=0 means at bottom (newest first, thumb at bottom
  // when viewing latest). Used for chat/transcript streams.
  // 'list': scrollOffset=0 means at top. Used for top-to-bottom lists where the
  // user moves a cursor from first to last item.
  direction?: 'log' | 'list';
}

export function Scrollbar({
  totalLines,
  visibleLines,
  scrollOffset,
  height,
  direction = 'log',
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

  const thumbTop =
    maxOffset > 0
      ? Math.round((clampedOffset / maxOffset) * (height - thumbHeight))
      : 0;

  const rows: string[] = [];
  for (let i = 0; i < height; i++) {
    const pos =
      direction === 'log' ? height - thumbHeight - thumbTop : thumbTop;
    if (i >= pos && i < pos + thumbHeight) {
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
