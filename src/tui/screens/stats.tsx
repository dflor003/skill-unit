import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { StatsIndex, TestStats } from '../../types/run.js';
import { formatDate } from '../format.js';

type SortField = 'name' | 'runCount' | 'passRate' | 'duration' | 'cost' | 'lastRun';

const SORT_FIELDS: SortField[] = ['name', 'runCount', 'passRate', 'duration', 'cost', 'lastRun'];

const SORT_LABELS: Record<SortField, string> = {
  name: 'Name',
  runCount: 'Runs',
  passRate: 'Pass%',
  duration: 'Avg Dur',
  cost: 'Avg Cost',
  lastRun: 'Last Run',
};

interface StatisticsProps {
  index: StatsIndex;
}

function formatPassRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(3)}`;
}

function formatDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return `${mins}m${rem}s`;
}

function sortTests(tests: Array<[string, TestStats]>, field: SortField): Array<[string, TestStats]> {
  return [...tests].sort(([aKey, a], [bKey, b]) => {
    switch (field) {
      case 'name':
        return aKey.localeCompare(bKey);
      case 'runCount':
        return b.runCount - a.runCount;
      case 'passRate': {
        const aRate = a.runCount > 0 ? a.passCount / a.runCount : 0;
        const bRate = b.runCount > 0 ? b.passCount / b.runCount : 0;
        return bRate - aRate;
      }
      case 'duration':
        return a.avgDuration - b.avgDuration;
      case 'cost':
        return a.avgCost - b.avgCost;
      case 'lastRun':
        return b.lastRun.localeCompare(a.lastRun);
      default:
        return 0;
    }
  });
}

export function Statistics({ index }: StatisticsProps) {
  const [sortField, setSortField] = useState<SortField>('name');

  useInput((input) => {
    if (input === 's' || input === 'S') {
      setSortField(current => {
        const idx = SORT_FIELDS.indexOf(current);
        return SORT_FIELDS[(idx + 1) % SORT_FIELDS.length]!;
      });
    }
  });

  const { aggregate } = index;
  const testEntries = sortTests(Object.entries(index.tests), sortField);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold>Statistics</Text>
      </Box>

      {/* Aggregate section */}
      <Box flexDirection="column" marginBottom={1} borderStyle="single" paddingX={1}>
        <Box marginBottom={0}>
          <Text bold color="gray">Aggregate</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text color="gray">Total Runs:</Text>
          </Box>
          <Text bold>{aggregate.totalRuns}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text color="gray">Total Tests:</Text>
          </Box>
          <Text bold>{aggregate.totalTests}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text color="gray">Pass Rate:</Text>
          </Box>
          <Text bold color={aggregate.passRate >= 0.8 ? 'green' : aggregate.passRate >= 0.5 ? 'yellow' : 'red'}>
            {Math.round(aggregate.passRate * 100)}%
          </Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text color="gray">Total Cost:</Text>
          </Box>
          <Text bold>{formatCost(aggregate.totalCost)}</Text>
        </Box>
        <Box>
          <Box width={18}>
            <Text color="gray">Total Tokens:</Text>
          </Box>
          <Text bold>{aggregate.totalTokens.toLocaleString()}</Text>
        </Box>
      </Box>

      {/* Per-test table */}
      <Box marginBottom={1}>
        <Text bold>Per-Test Metrics</Text>
        <Text color="gray">  (sort: </Text>
        <Text color="cyan">{SORT_LABELS[sortField]}</Text>
        <Text color="gray">)</Text>
      </Box>

      {testEntries.length === 0 ? (
        <Box>
          <Text color="gray">No test data yet. Run some tests to populate statistics.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Table header */}
          <Box marginBottom={0}>
            <Box width={30}><Text bold color="gray">Test Name</Text></Box>
            <Box width={7}><Text bold color="gray">Runs</Text></Box>
            <Box width={8}><Text bold color="gray">Pass%</Text></Box>
            <Box width={9}><Text bold color="gray">Avg Dur</Text></Box>
            <Box width={10}><Text bold color="gray">Avg Cost</Text></Box>
            <Box><Text bold color="gray">Last Run</Text></Box>
          </Box>

          {/* Table rows */}
          {testEntries.map(([key, stats]) => {
            const passRate = stats.runCount > 0 ? stats.passCount / stats.runCount : 0;
            const passRateColor = passRate >= 0.8 ? 'green' : passRate >= 0.5 ? 'yellow' : 'red';
            const displayName = stats.name || key;
            const truncated = displayName.length > 28
              ? displayName.slice(0, 25) + '...'
              : displayName;

            return (
              <Box key={key}>
                <Box width={30}><Text>{truncated}</Text></Box>
                <Box width={7}><Text>{stats.runCount}</Text></Box>
                <Box width={8}><Text color={passRateColor}>{formatPassRate(passRate)}</Text></Box>
                <Box width={9}><Text>{formatDuration(stats.avgDuration)}</Text></Box>
                <Box width={10}><Text>{formatCost(stats.avgCost)}</Text></Box>
                <Box><Text color="gray">{formatDate(stats.lastRun)}</Text></Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer help */}
      <Box marginTop={1}>
        <Text color="gray">[s] cycle sort field</Text>
      </Box>
    </Box>
  );
}
