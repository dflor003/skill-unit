import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, measureElement, type DOMElement } from 'ink';
import type { Spec, TestCase } from '../../types/spec.js';
import type { ContextHint } from '../components/context-bar.js';
import { SearchBox } from '../components/search-box.js';
import { Scrollbar } from '../components/scrollbar.js';
import { loadSelection, saveSelection } from '../../core/selection.js';
import { ensureCursorVisible } from '../utils/scroll.js';

interface FlatTestCase {
  specName: string;
  specPath: string;
  tags: string[];
  testCase: TestCase;
  key: string;
}

interface GroupItem {
  kind: 'group';
  specPath: string;
  specName: string;
  tags: string[];
  tests: FlatTestCase[];
  key: string;
}

interface TestItem {
  kind: 'test';
  test: FlatTestCase;
  key: string;
}

type VisibleItem = GroupItem | TestItem;

// Build a breadcrumb like "skill-unit > empty-project" from a spec path.
// Strips the configured test directory prefix and the .spec.md extension.
function specBreadcrumb(specPath: string, testDir: string): string {
  const normalized = specPath.replace(/\\/g, '/');
  const prefix = testDir.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  const relative = normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
  const withoutExt = relative.replace(/\.spec\.md$/, '');
  return withoutExt.split('/').join(' > ');
}

interface DashboardProps {
  specs: Spec[];
  testDir: string;
  onRunTests: (tests: FlatTestCase[]) => void;
  onContextHintsChange?: (hints: ContextHint[]) => void;
}

function flattenSpecs(specs: Spec[]): FlatTestCase[] {
  const result: FlatTestCase[] = [];
  for (const spec of specs) {
    for (const tc of spec.testCases) {
      result.push({
        specName: spec.frontmatter.name,
        specPath: spec.path,
        tags: spec.frontmatter.tags,
        testCase: tc,
        key: `${spec.path}::${tc.id}`,
      });
    }
  }
  return result;
}

function filterTests(tests: FlatTestCase[], query: string): FlatTestCase[] {
  if (!query.trim()) return tests;

  if (query.startsWith('tag:')) {
    const tag = query.slice(4).trim().toLowerCase();
    return tests.filter((t) =>
      t.tags.some((tg) => tg.toLowerCase().includes(tag))
    );
  }

  const q = query.toLowerCase();
  return tests.filter(
    (t) =>
      t.testCase.name.toLowerCase().includes(q) ||
      t.testCase.id.toLowerCase().includes(q)
  );
}

// Interleave group headers and tests into a single navigation list.
// Groups appear before their tests; each group only includes the tests that
// survived the current search filter.
function buildVisibleItems(tests: FlatTestCase[]): VisibleItem[] {
  const items: VisibleItem[] = [];
  let currentGroup: GroupItem | null = null;

  for (const t of tests) {
    if (!currentGroup || currentGroup.specPath !== t.specPath) {
      currentGroup = {
        kind: 'group',
        specPath: t.specPath,
        specName: t.specName,
        tags: t.tags,
        tests: [],
        key: `group:${t.specPath}`,
      };
      items.push(currentGroup);
    }
    currentGroup.tests.push(t);
    items.push({ kind: 'test', test: t, key: t.key });
  }

  return items;
}

function visibleTests(items: VisibleItem[]): FlatTestCase[] {
  return items
    .filter((i): i is TestItem => i.kind === 'test')
    .map((i) => i.test);
}

type GroupState = 'none' | 'all' | 'partial';

function groupState(group: GroupItem, selected: Set<string>): GroupState {
  if (group.tests.length === 0) return 'none';
  let count = 0;
  for (const t of group.tests) if (selected.has(t.key)) count++;
  if (count === 0) return 'none';
  if (count === group.tests.length) return 'all';
  return 'partial';
}

function groupCheckbox(state: GroupState): string {
  if (state === 'all') return '[x]';
  if (state === 'partial') return '[-]';
  return '[ ]';
}

function toggleGroup(group: GroupItem, prev: Set<string>): Set<string> {
  const next = new Set(prev);
  const state = groupState(group, prev);
  if (state === 'all') {
    for (const t of group.tests) next.delete(t.key);
  } else {
    for (const t of group.tests) next.add(t.key);
  }
  return next;
}

const SELECTION_DIR = '.skill-unit';

export function Dashboard({
  specs,
  testDir,
  onRunTests,
  onContextHintsChange,
}: DashboardProps) {
  const allTests = flattenSpecs(specs);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => {
    const persisted = loadSelection(SELECTION_DIR);
    return persisted.selectedTests;
  });

  const filtered = filterTests(allTests, query);
  const visible = buildVisibleItems(filtered);
  const testsInView = visibleTests(visible);

  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(20);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      if (height > 0 && height !== contentHeight) setContentHeight(height);
    }
  });

  // Keep the cursor within the visible window. Runs on cursor, viewport, or
  // list length changes so filtering/resizing re-clamps correctly.
  useEffect(() => {
    setScrollOffset((prev) =>
      ensureCursorVisible(cursor, prev, contentHeight, visible.length)
    );
  }, [cursor, contentHeight, visible.length]);

  // Clamp the cursor when the filtered list shrinks out from under it.
  useEffect(() => {
    setCursor((c) => Math.max(0, Math.min(c, visible.length - 1)));
  }, [visible.length]);

  useEffect(() => {
    saveSelection(
      { selectedTests: selected, viewMode: 'primary' },
      SELECTION_DIR
    );
  }, [selected]);

  useEffect(() => {
    const searching = query.length > 0;
    const hints = searching
      ? [
          { key: '↑↓', label: 'navigate' },
          { key: '[Esc]', label: 'clear search' },
          ...(selected.size > 0
            ? [{ key: '[Enter]', label: `run ${selected.size} selected` }]
            : []),
          { key: 'type', label: 'to search' },
        ]
      : [
          { key: '↑↓', label: 'navigate' },
          { key: '[Space]', label: 'toggle' },
          { key: '[a]', label: 'all' },
          { key: '[A]', label: 'all in spec' },
          ...(selected.size > 0
            ? [{ key: '[Enter]', label: `run ${selected.size} selected` }]
            : []),
          { key: 'type', label: 'to search' },
        ];
    onContextHintsChange?.(hints);
  }, [selected.size, query.length, onContextHintsChange]);

  // Refs mirror the latest state for the useInput handler. ink re-binds the
  // input listener via useEffect after each render, which lands a tick AFTER
  // commit. Reading state through refs keeps the handler correct even when
  // it fires on the stale closure (fast keypresses, paste, test stdin.write).
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const queryRef = useRef(query);
  queryRef.current = query;
  const onRunTestsRef = useRef(onRunTests);
  onRunTestsRef.current = onRunTests;

  useInput((input, key) => {
    const selected = selectedRef.current;
    const visible = visibleRef.current;
    const cursor = cursorRef.current;
    const query = queryRef.current;
    const searching = query.length > 0;

    // Keys that always behave the same, regardless of search state.
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
      return;
    }
    if (key.downArrow) {
      setCursor((c) => Math.min(visible.length - 1, c + 1));
      return;
    }
    if (key.return) {
      if (selected.size === 0) return;
      const toRun = testsInView.filter((t) => selected.has(t.key));
      if (toRun.length > 0) onRunTestsRef.current(toRun);
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      return;
    }
    if (key.escape) {
      // Clear the query, snapping back to action mode.
      setQuery('');
      return;
    }

    // Action keys only fire when the search query is empty. Once the user is
    // typing a search, these characters are forwarded to the query so users
    // can type words containing them (e.g., "safe" would otherwise trip 'a').
    if (!searching) {
      if (input === ' ') {
        const item = visible[cursor];
        if (!item) return;
        if (item.kind === 'test') {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(item.test.key)) {
              next.delete(item.test.key);
            } else {
              next.add(item.test.key);
            }
            return next;
          });
        } else {
          setSelected((prev) => toggleGroup(item, prev));
        }
        return;
      }
      if (input === 'a') {
        const inViewKeys = visible
          .filter((i): i is TestItem => i.kind === 'test')
          .map((i) => i.key);
        const allSelected = inViewKeys.every((k) => selected.has(k));
        if (allSelected) {
          setSelected(new Set());
        } else {
          setSelected(new Set(inViewKeys));
        }
        return;
      }
      if (input === 'A') {
        const item = visible[cursor];
        if (!item) return;
        const specPath =
          item.kind === 'test' ? item.test.specPath : item.specPath;
        const group = visible.find(
          (i): i is GroupItem => i.kind === 'group' && i.specPath === specPath
        );
        if (!group) return;
        setSelected((prev) => toggleGroup(group, prev));
        return;
      }
    }

    // Anything else printable becomes part of the query.
    if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
    }
  });

  const visibleStart = Math.max(0, Math.min(scrollOffset, visible.length));
  const visibleEnd = Math.min(visible.length, visibleStart + contentHeight);
  const renderedItems = visible.slice(visibleStart, visibleEnd);
  const maxOffset = Math.max(0, visible.length - contentHeight);
  // Scrollbar uses inverted offset convention (0 = bottom). Our offset is
  // top-down (0 = showing the first item), so invert when passing in.
  const scrollbarOffset = maxOffset - Math.min(scrollOffset, maxOffset);

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text bold color="white">
          Dashboard
        </Text>
      </Box>
      <Box marginBottom={1} flexShrink={0}>
        <SearchBox value={query} onChange={setQuery} />
      </Box>
      <Box marginBottom={1} flexShrink={0}>
        <Text color="gray">
          {testsInView.length} test{testsInView.length !== 1 ? 's' : ''}
          {selected.size > 0 ? ` (${selected.size} selected)` : ''}
        </Text>
      </Box>
      <Box
        ref={contentRef}
        flexDirection="row"
        flexGrow={1}
        flexShrink={1}
        minHeight={0}
        overflow="hidden"
      >
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          overflow="hidden"
        >
          {renderedItems.map((item, relativeIdx) => {
            const idx = visibleStart + relativeIdx;
            const isActive = idx === cursor;
            if (item.kind === 'group') {
              const state = groupState(item, selected);
              const checkbox = groupCheckbox(state);
              return (
                <Box key={item.key} flexShrink={0}>
                  <Box flexGrow={1}>
                    <Text bold color={isActive ? 'blue' : 'white'}>
                      {isActive ? '>' : ' '} {checkbox}{' '}
                      {specBreadcrumb(item.specPath, testDir)}
                    </Text>
                  </Box>
                  {item.tags.length > 0 && (
                    <Text color="gray">[{item.tags.join(', ')}]</Text>
                  )}
                </Box>
              );
            }
            const isChecked = selected.has(item.test.key);
            return (
              <Box key={item.key} paddingLeft={2} flexShrink={0}>
                <Text color={isActive ? 'blue' : undefined}>
                  {isActive ? '>' : ' '} {isChecked ? '[x]' : '[ ]'}{' '}
                  <Text bold color={isActive ? 'blue' : 'white'}>
                    {item.test.testCase.id}
                  </Text>{' '}
                  <Text bold={isActive} color={isActive ? 'blue' : undefined}>
                    {item.test.testCase.name}
                  </Text>
                </Text>
              </Box>
            );
          })}
        </Box>
        <Scrollbar
          totalLines={visible.length}
          visibleLines={contentHeight}
          scrollOffset={scrollbarOffset}
          height={contentHeight}
        />
      </Box>
    </Box>
  );
}
