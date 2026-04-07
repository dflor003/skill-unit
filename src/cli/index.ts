#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { lsCommand } from './commands/ls.js';
import { compileCommand } from './commands/compile.js';
import { testCommand } from './commands/test.js';
import { reportCommand } from './commands/report.js';

const main = defineCommand({
  meta: {
    name: 'skill-unit',
    description: 'Structured, reproducible unit testing for AI agent skills',
  },
  subCommands: {
    ls: lsCommand,
    compile: compileCommand,
    test: testCommand,
    report: reportCommand,
  },
  run({ rawArgs }) {
    // Only handle the no-subcommand case; if a subcommand was provided it runs separately
    const knownSubCommands = ['ls', 'compile', 'test', 'report'];
    const hasSubCommand = rawArgs.some((a) => knownSubCommands.includes(a));
    if (hasSubCommand) return;

    // When invoked with no subcommand, detect TTY and either start TUI or show help
    if (process.stdout.isTTY) {
      console.log('TUI mode not yet implemented');
      // TODO (Task 14): Start interactive TUI here
    } else {
      // Non-interactive: show help
      console.log('Usage: skill-unit <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  ls       List discovered spec files and test cases');
      console.log('  compile  Parse spec files and write manifest JSON files');
      console.log('  test     Run tests from spec files');
      console.log('  report   Generate a report from an existing test run directory');
      console.log('');
      console.log('Run `skill-unit <command> --help` for command-specific help.');
    }
  },
});

runMain(main);
