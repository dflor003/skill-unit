import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { gradingCommand } from '../../src/cli/commands/grading.js';

const HAPPY = path.join(
  'tests',
  'fixtures',
  'runs',
  'latest-is-2026-04-18',
  'runs'
);

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join('');
}

type RunInput = Parameters<NonNullable<typeof gradingCommand.run>>[0];

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    gradingCommand.run!({
      args,
      rawArgs: [],
      cmd: gradingCommand,
      subCommand: undefined,
    } as unknown as RunInput)
  );
}

describe('cli grading', () => {
  it('when called without --full should print the verdict + results.md checks', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: false,
    });

    // Assert
    expect(out).toContain('EX-2');
    expect(out).toContain('fail');
    expect(out).toContain('structured error message');
    expect(out).not.toContain('Grader turn 1:');
  });

  it('when called with --full should append the grader transcript', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: true,
    });

    // Assert
    expect(out).toContain('structured error message');
    expect(out).toContain('Grader turn 1:');
  });

  it('when the test has no grader-transcript file and --full is set should say so', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-1',
      full: true,
    });

    // Assert
    expect(out).toContain('EX-1');
    expect(out).toContain('no grader transcript');
  });
});
