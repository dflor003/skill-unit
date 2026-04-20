import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { runsCommand } from '../../src/cli/commands/runs.js';

const HAPPY = path.join(
  'tests',
  'fixtures',
  'runs',
  'latest-is-2026-04-18',
  'runs'
);
const EMPTY = path.join('tests', 'fixtures', 'runs', 'empty', 'runs');

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

type RunInput = Parameters<NonNullable<typeof runsCommand.run>>[0];

async function invoke(args: Record<string, unknown>): Promise<string> {
  return captureStdout(() =>
    runsCommand.run!({
      args,
      rawArgs: [],
      cmd: runsCommand,
      subCommand: undefined,
    } as unknown as RunInput)
  );
}

describe('cli runs', () => {
  it('is defined with the expected meta', () => {
    // Assert
    expect(runsCommand.meta.name).toBe('runs');
    expect(runsCommand.meta.description).toBeDefined();
  });

  it('when the runs root has entries should list them newest first', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      limit: '10',
      'failed-only': false,
    });

    // Assert
    const newerIdx = out.indexOf('2026-04-18-12-00-00');
    const olderIdx = out.indexOf('2026-04-17-10-00-00');
    expect(newerIdx).toBeGreaterThanOrEqual(0);
    expect(olderIdx).toBeGreaterThan(newerIdx);
  });

  it('when --limit 1 should only print the newest run', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      limit: '1',
      'failed-only': false,
    });

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).not.toContain('2026-04-17-10-00-00');
  });

  it('when --failed-only should include both seeded runs (both had failures)', async () => {
    // Act
    const out = await invoke({
      'runs-root': HAPPY,
      limit: '10',
      'failed-only': true,
    });

    // Assert
    expect(out).toContain('2026-04-18-12-00-00');
    expect(out).toContain('2026-04-17-10-00-00');
  });

  it('when the runs root is missing should print an informational message', async () => {
    // Act
    const out = await invoke({
      'runs-root': EMPTY,
      limit: '10',
      'failed-only': false,
    });

    // Assert
    expect(out).toContain('No runs yet');
  });
});
