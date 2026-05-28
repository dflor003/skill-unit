import { describe, it, expect } from 'vitest';
import { computeExitCode } from '../../src/core/exit-code.js';

describe('computeExitCode', () => {
  it('returns 0 when nothing failed and nothing timed out', () => {
    expect(computeExitCode(0, 0)).toBe(0);
  });

  it('returns 1 when something failed and nothing timed out', () => {
    expect(computeExitCode(3, 0)).toBe(1);
  });

  it('returns 2 when something timed out, even if nothing else failed', () => {
    expect(computeExitCode(0, 1)).toBe(2);
  });

  it('returns 2 when both failed and timed out are non-zero (timeout takes precedence)', () => {
    expect(computeExitCode(2, 1)).toBe(2);
  });
});
