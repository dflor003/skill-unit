import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { showCommand } from '../../src/cli/commands/show.js';

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

type RunInput = Parameters<NonNullable<typeof showCommand.run>>[0];

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    showCommand.run!({
      args,
      rawArgs: [],
      cmd: showCommand,
      subCommand: undefined,
    } as unknown as RunInput)
  );
}

describe('cli show', () => {
  it('is defined with the expected meta', () => {
    // Assert
    expect(showCommand.meta.name).toBe('show');
  });

  it('when given "latest" should resolve to the newest run and print its summary', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': 'latest',
      'failed-only': false,
      full: false,
    });

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).toContain('WG-1');
    expect(out).not.toContain('EX-1');
  });

  it('when --failed-only should only list failing tests', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'failed-only': true,
      full: false,
    });

    // Assert
    expect(out).toContain('EX-2');
    expect(out).not.toContain('EX-1 ');
  });

  it('when --full should print the full report.md', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      'run-id': '2026-04-17-10-00-00',
      'failed-only': false,
      full: true,
    });

    // Assert
    expect(out).toContain('# Test Run: 2026-04-17-10-00-00');
    expect(out).toContain('structured error message');
  });

  it('when the run id is unknown should exit non-zero with a helpful message', async () => {
    // Arrange
    const exitCalls: number[] = [];
    const originalExit = process.exit;
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
          'run-id': 'nope',
          'failed-only': false,
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
