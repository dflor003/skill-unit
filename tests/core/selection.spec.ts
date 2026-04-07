import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadSelection, saveSelection } from '../../src/core/selection.js';

describe('selection persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-unit-sel-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty set when no file exists', () => {
    const sel = loadSelection(tmpDir);
    expect(sel.selectedTests.size).toBe(0);
  });

  it('saves and loads selection', () => {
    const sel = { selectedTests: new Set(['runner/TEST-1', 'runner/TEST-2']), viewMode: 'primary' as const };
    saveSelection(sel, tmpDir);

    const loaded = loadSelection(tmpDir);
    expect(loaded.selectedTests.size).toBe(2);
    expect(loaded.selectedTests.has('runner/TEST-1')).toBe(true);
    expect(loaded.viewMode).toBe('primary');
  });
});
