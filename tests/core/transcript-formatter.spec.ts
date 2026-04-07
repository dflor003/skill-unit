import { describe, it, expect } from 'vitest';
import {
  formatToolCall,
  formatToolResult,
  formatTurnUsage,
  formatSessionInit,
  formatUsageSummary,
} from '../../src/core/transcript-formatter.js';

describe('formatToolCall', () => {
  it('formats Bash tool call', () => {
    const result = formatToolCall('Bash', { command: 'ls -la', description: 'List files' });
    expect(result).toContain('List files');
    expect(result).toContain('ls -la');
  });

  it('formats Read tool call', () => {
    const result = formatToolCall('Read', { file_path: '/src/index.ts' });
    expect(result).toContain('/src/index.ts');
  });

  it('formats unknown tool with generic formatter', () => {
    const result = formatToolCall('CustomTool', { key: 'value' });
    expect(result).toContain('CustomTool');
    expect(result).toContain('key');
  });
});

describe('formatToolResult', () => {
  it('formats normal result', () => {
    const result = formatToolResult('some output', false);
    expect(result).toContain('Tool result');
    expect(result).toContain('some output');
  });

  it('formats error result', () => {
    const result = formatToolResult('error message', true);
    expect(result).toContain('ERROR');
  });

  it('truncates long output', () => {
    const longOutput = 'x'.repeat(600);
    const result = formatToolResult(longOutput, false);
    expect(result).toContain('600 chars total');
  });
});

describe('formatTurnUsage', () => {
  it('formats usage data', () => {
    const result = formatTurnUsage({
      input_tokens: 100,
      output_tokens: 75,
      cache_read_input_tokens: 50,
    });
    expect(result).toContain('100');
    expect(result).toContain('75');
  });

  it('returns empty string for missing usage', () => {
    expect(formatTurnUsage(undefined)).toBe('');
    expect(formatTurnUsage(null)).toBe('');
  });
});

describe('formatSessionInit', () => {
  it('formats session init event', () => {
    const result = formatSessionInit({ model: 'opus', cwd: '/test', skills: ['s1'] });
    expect(result).toContain('opus');
  });
});

describe('formatUsageSummary', () => {
  it('formats aggregate usage with cost', () => {
    const result = formatUsageSummary(
      { input_tokens: 1000, output_tokens: 500 },
      0.05,
    );
    expect(result).toContain('1000');
    expect(result).toContain('0.05');
  });

  it('returns empty string for missing data', () => {
    expect(formatUsageSummary(undefined, null)).toBe('');
  });
});
