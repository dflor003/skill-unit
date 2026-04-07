import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadConfig, parseYaml, CONFIG_DEFAULTS } from '../../src/config/loader.js';

describe('parseYaml', () => {
  it('parses scalar values', () => {
    const result = parseYaml('name: hello\ncount: 42\nenabled: true');
    expect(result).toEqual({ name: 'hello', count: 42, enabled: true });
  });

  it('parses inline arrays', () => {
    const result = parseYaml('tags: [a, b, c]');
    expect(result).toEqual({ tags: ['a', 'b', 'c'] });
  });

  it('parses block lists', () => {
    const result = parseYaml('items:\n  - one\n  - two\n  - three');
    expect(result).toEqual({ items: ['one', 'two', 'three'] });
  });

  it('parses nested objects (one level)', () => {
    const result = parseYaml('runner:\n  tool: claude\n  model: sonnet');
    expect(result).toEqual({ runner: { tool: 'claude', model: 'sonnet' } });
  });

  it('ignores comments', () => {
    const result = parseYaml('# this is a comment\nname: hello');
    expect(result).toEqual({ name: 'hello' });
  });

  it('handles null values', () => {
    const result = parseYaml('model: null');
    expect(result).toEqual({ model: null });
  });

  it('handles empty input', () => {
    const result = parseYaml('');
    expect(result).toEqual({});
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path/.skill-unit.yml');
    expect(config['test-dir']).toBe('skill-tests');
    expect(config.runner.tool).toBe('claude');
    expect(config.runner['max-turns']).toBe(10);
    expect(config.execution.timeout).toBe('120s');
  });

  it('merges config file with defaults', () => {
    const yaml = 'runner:\n  model: opus\n  max-turns: 20';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(yaml);

    const config = loadConfig('/mock/.skill-unit.yml');

    expect(config.runner.model).toBe('opus');
    expect(config.runner['max-turns']).toBe(20);
    expect(config.runner.tool).toBe('claude'); // default preserved
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('CONFIG_DEFAULTS', () => {
  it('has expected structure', () => {
    expect(CONFIG_DEFAULTS['test-dir']).toBe('skill-tests');
    expect(CONFIG_DEFAULTS.runner.tool).toBe('claude');
    expect(CONFIG_DEFAULTS.runner.model).toBeNull();
    expect(CONFIG_DEFAULTS.runner['max-turns']).toBe(10);
    expect(CONFIG_DEFAULTS.output.format).toBe('interactive');
  });

  it('uses concurrency (not runner-concurrency) in runner defaults', () => {
    expect(CONFIG_DEFAULTS.runner.concurrency).toBe(5);
    expect((CONFIG_DEFAULTS.runner as Record<string, unknown>)['runner-concurrency']).toBeUndefined();
  });

  it('does not have grader-concurrency in execution defaults', () => {
    expect((CONFIG_DEFAULTS.execution as Record<string, unknown>)['grader-concurrency']).toBeUndefined();
  });
});

describe('loadConfig backward compat', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps runner-concurrency to concurrency when loading old YAML', () => {
    const yaml = 'runner:\n  runner-concurrency: 3';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(yaml);

    const config = loadConfig('/mock/.skill-unit.yml');

    expect(config.runner.concurrency).toBe(3);
  });

  it('does not override explicit concurrency with runner-concurrency', () => {
    const yaml = 'runner:\n  runner-concurrency: 3\n  concurrency: 7';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(yaml);

    const config = loadConfig('/mock/.skill-unit.yml');

    expect(config.runner.concurrency).toBe(7);
  });
});
