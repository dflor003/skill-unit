import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Spec, TestCase } from '../../types/spec.js';
import type { ContextHint } from '../components/context-bar.js';
import { SearchBox } from '../components/search-box.js';
import { loadSelection, saveSelection } from '../../core/selection.js';

interface FlatTestCase {
  specName: string;
  specPath: string;
  tags: string[];
  testCase: TestCase;
  key: string;
}

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

  const visible = filterTests(allTests, query);

  useEffect(() => {
    saveSelection(
      { selectedTests: selected, viewMode: 'primary' },
      SELECTION_DIR
    );
  }, [selected]);

  useEffect(() => {
    const hints = [
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
  }, [selected.size, onContextHintsChange]);

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(visible.length - 1, c + 1));
    } else if (input === ' ') {
      const item = visible[cursor];
      if (!item) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(item.key)) {
          next.delete(item.key);
        } else {
          next.add(item.key);
        }
        return next;
      });
    } else if (input === 'a') {
      if (selected.size === visible.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(visible.map((t) => t.key)));
      }
    } else if (input === 'A') {
      const item = visible[cursor];
      if (!item) return;
      const specTests = visible.filter((t) => t.specPath === item.specPath);
      const specKeys = specTests.map((t) => t.key);
      const allSelected = specKeys.every((k) => selected.has(k));
      setSelected((prev) => {
        const next = new Set(prev);
        if (allSelected) {
          for (const k of specKeys) next.delete(k);
        } else {
          for (const k of specKeys) next.add(k);
        }
        return next;
      });
    } else if (key.return) {
      if (selected.size === 0) return;
      const toRun = visible.filter((t) => selected.has(t.key));
      if (toRun.length > 0) onRunTests(toRun);
    } else if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>Dashboard</Text>
      </Box>
      <Box marginBottom={1}>
        <SearchBox value={query} onChange={setQuery} />
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">
          {visible.length} test{visible.length !== 1 ? 's' : ''}
          {selected.size > 0 ? ` (${selected.size} selected)` : ''}
        </Text>
      </Box>
      <Box flexDirection="column">
        {visible.map((item, idx) => {
          const isActive = idx === cursor;
          const isChecked = selected.has(item.key);
          const prev = idx > 0 ? visible[idx - 1] : null;
          const isFirstOfSpec = !prev || prev.specPath !== item.specPath;
          const breadcrumb = isFirstOfSpec
            ? specBreadcrumb(item.specPath, testDir)
            : null;
          return (
            <Box key={item.key} flexDirection="column">
              {breadcrumb && (
                <Box marginTop={idx === 0 ? 0 : 1}>
                  <Box flexGrow={1}>
                    <Text bold color="cyan">
                      {breadcrumb}
                    </Text>
                  </Box>
                  {item.tags.length > 0 && (
                    <Text color="gray">[{item.tags.join(', ')}]</Text>
                  )}
                </Box>
              )}
              <Box paddingLeft={2}>
                <Text color={isActive ? 'blue' : undefined}>
                  {isActive ? '>' : ' '} {isChecked ? '[x]' : '[ ]'}{' '}
                  <Text bold={isActive}>{item.testCase.name}</Text>
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
