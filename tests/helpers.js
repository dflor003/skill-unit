'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const CLI = path.resolve('skills/skill-unit/scripts/cli.js');

/**
 * Run the skill-unit CLI with the given arguments and return stdout, stderr,
 * and exit code. Colors are disabled for deterministic assertions.
 */
function runCli(...args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
      timeout: 5000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status,
    };
  }
}

module.exports = { runCli };
