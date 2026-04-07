import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  scopeToolsToWorkspace,
  parseTimeout,
} from '../../src/core/runner.js';

describe('buildSystemPrompt', () => {
  it('includes workspace path constraint', () => {
    const prompt = buildSystemPrompt('/workspace/abc123');
    expect(prompt).toContain('/workspace/abc123');
    expect(prompt).toContain('workspace');
  });
});

describe('scopeToolsToWorkspace', () => {
  it('scopes file tools to workspace path', () => {
    const tools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'];
    const scoped = scopeToolsToWorkspace(tools, '/workspace/abc');
    const readTool = scoped.find(t => t.startsWith('Read'));
    expect(readTool).toContain('/workspace/abc');
    // Bash should not be scoped
    expect(scoped).toContain('Bash');
  });
});

describe('parseTimeout', () => {
  it('parses seconds', () => {
    expect(parseTimeout('120s')).toBe(120000);
  });

  it('parses minutes', () => {
    expect(parseTimeout('5m')).toBe(300000);
  });

  it('returns default for invalid input', () => {
    expect(parseTimeout('')).toBe(300000);
    expect(parseTimeout(undefined as any)).toBe(300000);
  });
});
