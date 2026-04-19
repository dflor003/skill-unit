import { describe, it, expect } from 'vitest';
import {
  buildGraderPrompt,
  buildSeedResultsJson,
  resolveAgentPath,
  GRADER_PROFILES,
} from '../../src/core/grader.js';

describe('buildGraderPrompt', () => {
  // The prompt now accompanies a pre-seeded results.json file; it tells the
  // grader to Read both the transcript and the seed, then Write the seed
  // back with `null`s replaced. No schema is described in prose -- the seed
  // file IS the schema the grader mirrors.

  it('points at the transcript and the seed results file', () => {
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
    expect(prompt).toContain('.transcript.md');
    expect(prompt).toContain('.results.json');
    expect(prompt).toMatch(/Read the transcript/i);
    expect(prompt).toMatch(/Read the seed/i);
    expect(prompt).toMatch(/Use the Write tool/i);
  });

  it('tells the grader to fill in nulls and not to change the schema', () => {
    // Arrange
    const tc = {
      id: 'TEST-4',
      name: 'schema-preservation',
      prompt: 'Do the thing',
      expectations: ['Something happens'],
      'negative-expectations': [],
    };

    // Act
    const prompt = buildGraderPrompt(tc, 'runner', '2026-04-07-10-00-00');

    // Assert -- the whole point of pre-seeding is to prevent drift; the
    // prompt must reinforce "do not rename / add / remove fields".
    expect(prompt).toMatch(/null/i);
    expect(prompt).toMatch(/do not rename/i);
  });
});

describe('buildSeedResultsJson', () => {
  // The seed file IS the forcing function. Every decision the grader has
  // to make appears as a `null` in a field that is already named correctly.
  it('populates testId, testName, prompt from the test case', () => {
    // Arrange
    const tc = {
      id: 'SU-5',
      name: 'Discovers all specs',
      prompt: 'Run all tests',
      expectations: ['a'],
      'negative-expectations': ['b'],
    };

    // Act
    const seed = buildSeedResultsJson(tc);

    // Assert
    expect(seed.testId).toBe('SU-5');
    expect(seed.testName).toBe('Discovers all specs');
    expect(seed.prompt).toBe('Run all tests');
  });

  it('sets passed to null because the grader must decide it', () => {
    // Arrange
    const tc = {
      id: 'X',
      name: 'y',
      prompt: 'z',
      expectations: ['a'],
      'negative-expectations': [],
    };

    // Act
    const seed = buildSeedResultsJson(tc);

    // Assert
    expect(seed.passed).toBeNull();
  });

  it('turns each expectation string into a {text, met:null, evidence:null} object', () => {
    // Arrange
    const tc = {
      id: 'X',
      name: 'y',
      prompt: 'z',
      expectations: ['First expectation', 'Second expectation'],
      'negative-expectations': [],
    };

    // Act
    const seed = buildSeedResultsJson(tc);

    // Assert
    expect(seed.expectations).toEqual([
      { text: 'First expectation', met: null, evidence: null },
      { text: 'Second expectation', met: null, evidence: null },
    ]);
  });

  it('turns each negative expectation string into a {text, met:null, evidence:null} object', () => {
    // Arrange
    const tc = {
      id: 'X',
      name: 'y',
      prompt: 'z',
      expectations: [],
      'negative-expectations': ['Does not crash'],
    };

    // Act
    const seed = buildSeedResultsJson(tc);

    // Assert
    expect(seed.negativeExpectations).toEqual([
      { text: 'Does not crash', met: null, evidence: null },
    ]);
  });

  it('when no expectations or negative expectations should produce empty arrays (not undefined)', () => {
    // Arrange -- downstream JSON parsers reject missing arrays; empty is OK
    const tc = {
      id: 'X',
      name: 'y',
      prompt: 'z',
      expectations: [],
      'negative-expectations': [],
    };

    // Act
    const seed = buildSeedResultsJson(tc);

    // Assert
    expect(seed.expectations).toEqual([]);
    expect(seed.negativeExpectations).toEqual([]);
  });

  it('JSON.stringify round-trip preserves nulls (safety check for the wire format)', () => {
    // Arrange -- the seed is written via JSON.stringify and read by the
    // grader. Nulls must survive the round-trip as nulls, not as strings
    // or missing keys; otherwise the grader has no signal to fill in.
    const tc = {
      id: 'X',
      name: 'y',
      prompt: 'z',
      expectations: ['a'],
      'negative-expectations': ['b'],
    };

    // Act
    const seed = buildSeedResultsJson(tc);
    const roundTripped: {
      passed: unknown;
      expectations: Array<{ met: unknown; evidence: unknown }>;
      negativeExpectations: Array<{ met: unknown; evidence: unknown }>;
    } = JSON.parse(JSON.stringify(seed));

    // Assert
    expect(roundTripped.passed).toBeNull();
    expect(roundTripped.expectations[0].met).toBeNull();
    expect(roundTripped.expectations[0].evidence).toBeNull();
    expect(roundTripped.negativeExpectations[0].met).toBeNull();
    expect(roundTripped.negativeExpectations[0].evidence).toBeNull();
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

describe('GRADER_PROFILES.claude', () => {
  // Without these flags the grader inherits the parent session's Opus model,
  // every user-installed skill, and unrestricted tools -- which causes both
  // format drift (Opus rewrites the results template) and max-turns exhaustion
  // (the grader wanders into Bash exploration instead of Read/Write).
  const args = GRADER_PROFILES.claude('/path/to/agents/grader.md');

  it('forces haiku explicitly because --agent does not apply frontmatter model', () => {
    // Assert
    const i = args.indexOf('--model');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('haiku');
  });

  it('restricts tools to Read and Write', () => {
    // Assert
    const i = args.indexOf('--allowedTools');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('Read');
    expect(args[i + 2]).toBe('Write');
  });

  it('loads only local settings so user-global skills do not leak in', () => {
    // Assert
    const i = args.indexOf('--setting-sources');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('local');
  });

  it('uses --strict-mcp-config to prevent extra MCP servers from loading', () => {
    // Assert
    expect(args).toContain('--strict-mcp-config');
  });

  it('passes the agent file path via --agent', () => {
    // Assert
    const i = args.indexOf('--agent');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe('/path/to/agents/grader.md');
  });
});
