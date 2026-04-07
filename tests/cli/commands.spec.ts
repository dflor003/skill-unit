import { describe, it, expect } from 'vitest';
import { lsCommand } from '../../src/cli/commands/ls.js';
import { compileCommand } from '../../src/cli/commands/compile.js';
import { testCommand } from '../../src/cli/commands/test.js';
import { reportCommand } from '../../src/cli/commands/report.js';

describe('CLI commands', () => {
  it('ls command is defined with correct meta', () => {
    expect(lsCommand.meta.name).toBe('ls');
    expect(lsCommand.meta.description).toBeDefined();
  });

  it('compile command is defined with correct meta', () => {
    expect(compileCommand.meta.name).toBe('compile');
    expect(compileCommand.meta.description).toBeDefined();
  });

  it('test command is defined with correct meta', () => {
    expect(testCommand.meta.name).toBe('test');
    expect(testCommand.meta.description).toBeDefined();
  });

  it('test command has required args', () => {
    expect(testCommand.args.all).toBeDefined();
    expect(testCommand.args.ci).toBeDefined();
    expect(testCommand.args['no-stream']).toBeDefined();
    expect(testCommand.args.tag).toBeDefined();
    expect(testCommand.args.model).toBeDefined();
  });

  it('report command is defined with correct meta', () => {
    expect(reportCommand.meta.name).toBe('report');
    expect(reportCommand.meta.description).toBeDefined();
  });

  it('report command requires run-dir arg', () => {
    expect(reportCommand.args['run-dir']).toBeDefined();
  });
});
