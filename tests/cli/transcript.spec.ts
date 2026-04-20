import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { transcriptCommand } from '../../src/cli/commands/transcript.js';

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

type RunInput = Parameters<NonNullable<typeof transcriptCommand.run>>[0];

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    transcriptCommand.run!({
      args,
      rawArgs: [],
      cmd: transcriptCommand,
      subCommand: undefined,
    } as unknown as RunInput)
  );
}

describe('cli transcript', () => {
  it('when called without --full should print only a verdict + reason summary', async () => {
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
    expect(out).not.toContain('example-tests.EX-2.transcript.md');
    expect(out).not.toContain('Turn 1 (user): Process this input please');
  });

  it('when called with --full should include the transcript content', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'test-id': 'EX-2',
      full: true,
    });

    // Assert
    expect(out).toContain('Turn 1 (user):');
    expect(out).toContain('freeform apology' || 'I am sorry');
    expect(out).toContain('I am sorry');
  });

  it('when the test id is unknown should exit 1 with a helpful message', async () => {
    // Arrange
    const originalExit = process.exit;
    const exitCalls: number[] = [];
    process.exit = ((code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error(`__exit_${code ?? 0}`);
    }) as never;

    try {
      // Act
      let caught: Error | undefined;
      try {
        await invoke({
          'runs-root': HAPPY,
          'run-id': '2026-04-17-10-00-00',
          'test-id': 'ZZ-9',
          full: false,
        });
      } catch (err) {
        caught = err as Error;
      }

      // Assert
      expect(caught?.message).toBe('__exit_1');
      expect(exitCalls).toEqual([1]);
    } finally {
      process.exit = originalExit;
    }
  });
});
