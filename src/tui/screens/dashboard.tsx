import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Spec, TestCase } from '../../types/spec.js';
import { SearchBox } from '../components/search-box.js';
import { loadSelection, saveSelection } from '../../core/selection.js';

interface FlatTestCase {
  specName: string;
  specPath: string;
  tags: string[];
  testCase: TestCase;
  key: string;
}

interface DashboardProps {
  specs: Spec[];
  onRunTests: (tests: FlatTestCase[]) => void;
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

export function Dashboard({ specs, onRunTests }: DashboardProps) {
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
    } else if (input === 'a' || input === 'A') {
      if (selected.size === visible.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(visible.map((t) => t.key)));
      }
    } else if (key.return) {
      const toRun =
        selected.size > 0
          ? visible.filter((t) => selected.has(t.key))
          : visible;
      onRunTests(toRun);
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
          return (
            <Box key={item.key}>
              <Text color={isActive ? 'blue' : undefined}>
                {isActive ? '>' : ' '} {isChecked ? '[x]' : '[ ]'}{' '}
                <Text bold={isActive}>{item.testCase.name}</Text>{' '}
                <Text color="gray">({item.specName})</Text>
                {item.tags.length > 0 && (
                  <Text color="cyan"> [{item.tags.join(', ')}]</Text>
                )}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
