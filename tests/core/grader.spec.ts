import { describe, it, expect } from 'vitest';
import { buildGraderPrompt, resolveAgentPath } from '../../src/core/grader.js';

describe('buildGraderPrompt', () => {
  it('includes test metadata in prompt', () => {
    // Arrange
    const tc = {
      id: 'TEST-1',
      name: 'basic-usage',
      prompt: 'Do the thing',
      expectations: ['File created', 'Output matches'],
      'negative-expectations': ['No errors'],
    };

    // Act
    const prompt = buildGraderPrompt(tc, 'runner', '2026-04-07-10-00-00');

    // Assert
    expect(prompt).toContain('TEST-1');
    expect(prompt).toContain('basic-usage');
    expect(prompt).toContain('File created');
    expect(prompt).toContain('No errors');
    expect(prompt).toContain('Transcript path:');
  });

  it('when no negative-expectations should show None', () => {
    // Arrange
    const tc = {
      id: 'TEST-2',
      name: 'no-negatives',
      prompt: 'Do the thing',
      expectations: ['Something happens'],
      'negative-expectations': [],
    };

    // Act
    const prompt = buildGraderPrompt(tc, 'runner', '2026-04-07-10-00-00');

    // Assert
    expect(prompt).toContain('None');
  });

  it('when expectations are empty should not include bullets', () => {
    // Arrange
    const tc = {
      id: 'TEST-3',
      name: 'empty-expectations',
      prompt: 'Do the thing',
      expectations: [],
      'negative-expectations': [],
    };

    // Act
    const prompt = buildGraderPrompt(tc, 'runner', '2026-04-07-10-00-00');

    // Assert
    expect(prompt).toContain('TEST-3');
    expect(prompt).toContain('Output path:');
  });
});

describe('resolveAgentPath', () => {
  it('finds agents/grader.md in repo root', () => {
    // Act
    const agentPath = resolveAgentPath();

    // Assert
    expect(agentPath).toContain('grader.md');
  });
});
