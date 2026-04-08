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
  async run({ rawArgs }) {
    // Only handle the no-subcommand case; if a subcommand was provided it runs separately
    const knownSubCommands = ['ls', 'compile', 'test', 'report'];
    const hasSubCommand = rawArgs.some((a) => knownSubCommands.includes(a));
    if (hasSubCommand) return;

    // When invoked with no subcommand, detect TTY and either start TUI or show help
    if (process.stdout.isTTY) {
      const { render } = await import('ink');
      const React = await import('react');
      const { App } = await import('../tui/app.js');

      // Enter alternate screen buffer (full-screen mode)
      process.stdout.write('\x1b[?1049h');
      process.stdout.write('\x1b[H');

      const instance = render(React.createElement(App));

      // Restore main screen buffer on exit
      instance.waitUntilExit().then(() => {
        process.stdout.write('\x1b[?1049l');
      });
      return;
    } else {
      // Non-interactive: show help
      console.log('Usage: skill-unit <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  ls       List discovered spec files and test cases');
      console.log('  compile  Parse spec files and write manifest JSON files');
      console.log('  test     Run tests from spec files');
      console.log(
        '  report   Generate a report from an existing test run directory'
      );
      console.log('');
      console.log(
        'Run `skill-unit <command> --help` for command-specific help.'
      );
    }
  },
});

runMain(main);
