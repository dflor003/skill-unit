import React, { useRef, useState, useEffect } from 'react';
import { Box, Text, type DOMElement, measureElement } from 'ink';
import type { TestStatus } from '../../types/run.js';
import { Markdown } from './markdown.js';
import { Scrollbar } from './scrollbar.js';

export type TranscriptViewMode = 'execution' | 'grading';

interface SessionPanelProps {
  testId: string | null;
  testName: string;
  specName?: string;
  status: TestStatus | 'idle';
  transcript: string[];
  gradeTranscript: string[];
  elapsed: number;
  viewMode: TranscriptViewMode;
  scrollOffset?: number;
  following?: boolean;
  onScrollClamp?: (clampedOffset: number) => void;
}

function statusLabel(status: TestStatus | 'idle'): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'idle':
      return { label: 'Idle', color: 'gray' };
    case 'pending':
      return { label: 'Pending', color: 'gray' };
    case 'running':
      return { label: 'Running', color: 'blue' };
    case 'grading':
      return { label: 'Grading', color: 'yellow' };
    case 'passed':
      return { label: 'Passed', color: 'green' };
    case 'failed':
      return { label: 'Failed', color: 'red' };
    case 'timedout':
      return { label: 'Timed out', color: 'red' };
    case 'error':
      return { label: 'Error', color: 'red' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'gray' };
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export function SessionPanel({
  testId,
  testName,
  specName,
  status,
  transcript,
  gradeTranscript,
  elapsed,
  viewMode,
  scrollOffset = 0,
  following = true,
  onScrollClamp,
}: SessionPanelProps) {
  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(20);

  useEffect(() => {
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      if (height > 0) setContentHeight(height);
    }
  });

  if (!testId) {
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Text color="gray">
          No session selected. Use Left/Right arrows to switch sessions.
        </Text>
      </Box>
    );
  }

  const { label, color } = statusLabel(status);
  const activeTranscript =
    viewMode === 'grading' ? gradeTranscript : transcript;
  const allLines = activeTranscript.join('\n').split('\n');

  // contentHeight is the measured height of the content row Box.
  // Subtract 2 lines as buffer: long lines wrap and blank lines in
  // rendered markdown can consume extra visual rows, so being
  // conservative prevents the last few lines from being clipped.
  const visibleLines = Math.max(1, contentHeight - 2);

  // Clamp offset so it never exceeds the scrollable range
  const maxOffset = Math.max(0, allLines.length - visibleLines);
  const effectiveOffset = Math.min(scrollOffset, maxOffset);

  // Sync clamped offset back to parent so stored state doesn't drift
  useEffect(() => {
    if (scrollOffset > maxOffset && onScrollClamp) {
      onScrollClamp(maxOffset);
    }
  }, [scrollOffset, maxOffset, onScrollClamp]);

  let slicedLines: string[];
  if (effectiveOffset === 0) {
    slicedLines = allLines.slice(-visibleLines);
  } else {
    const startLine = allLines.length - visibleLines - effectiveOffset;
    slicedLines = allLines.slice(startLine, startLine + visibleLines);
  }

  const showFollowIndicator = !following && effectiveOffset > 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box
        flexShrink={0}
        flexDirection="column"
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Box>
          <Text bold>{testName}</Text>
          <Text> </Text>
          <Text color={color}>[{label}]</Text>
          <Text color="gray"> {formatElapsed(elapsed)}</Text>
        </Box>
        {specName && (
          <Box>
            <Text color="gray">
              {specName} / {testId}
            </Text>
          </Box>
        )}
      </Box>
      <Box
        flexShrink={0}
        paddingX={1}
        borderStyle="single"
        borderBottom
        borderTop={false}
        borderLeft={false}
        borderRight={false}
      >
        {viewMode === 'execution' ? (
          <Text>
            <Text bold color="white" backgroundColor="blue">
              {' '}
              Execution{' '}
            </Text>
            <Text color="gray"> Grading</Text>
          </Text>
        ) : (
          <Text>
            <Text color="gray">Execution </Text>
            <Text bold color="white" backgroundColor="blue">
              {' '}
              Grading{' '}
            </Text>
          </Text>
        )}
        <Text color="gray"> [t] toggle</Text>
      </Box>
      <Box ref={contentRef} flexDirection="row" flexGrow={1} overflow="hidden">
        <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
          {activeTranscript.length === 0 ? (
            <Text color="gray">Waiting for output...</Text>
          ) : (
            <Markdown content={slicedLines.join('\n')} />
          )}
        </Box>
        <Scrollbar
          totalLines={allLines.length}
          visibleLines={visibleLines}
          scrollOffset={effectiveOffset}
          height={visibleLines}
        />
      </Box>
      {showFollowIndicator && (
        <Box flexShrink={0} paddingX={1}>
          <Text color="yellow">[f] follow</Text>
        </Box>
      )}
    </Box>
  );
}
