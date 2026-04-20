import { describe, it, expect } from 'vitest';
import { lsCommand } from '../../src/cli/commands/ls.js';
import { compileCommand } from '../../src/cli/commands/compile.js';
import { testCommand } from '../../src/cli/commands/test.js';
import { reportCommand } from '../../src/cli/commands/report.js';
import { runsCommand } from '../../src/cli/commands/runs.js';
import { showCommand } from '../../src/cli/commands/show.js';
import { transcriptCommand } from '../../src/cli/commands/transcript.js';
import { gradingCommand } from '../../src/cli/commands/grading.js';
import { initCommand } from '../../src/cli/commands/init.js';

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

  it('runs command is defined with correct meta', () => {
    expect(runsCommand.meta.name).toBe('runs');
    expect(runsCommand.meta.description).toBeDefined();
  });

  it('show command is defined with correct meta', () => {
    expect(showCommand.meta.name).toBe('show');
    expect(showCommand.meta.description).toBeDefined();
  });

  it('transcript command is defined with correct meta', () => {
    expect(transcriptCommand.meta.name).toBe('transcript');
    expect(transcriptCommand.meta.description).toBeDefined();
  });

  it('grading command is defined with correct meta', () => {
    expect(gradingCommand.meta.name).toBe('grading');
    expect(gradingCommand.meta.description).toBeDefined();
  });

  it('init command is defined with correct meta', () => {
    expect(initCommand.meta.name).toBe('init');
    expect(initCommand.meta.description).toBeDefined();
  });
});
