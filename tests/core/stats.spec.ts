import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  recordRun,
  loadIndex,
  rebuildIndex,
  cleanupRuns,
  deleteRun,
  createEmptyIndex,
} from '../../src/core/stats.js';
import type { RunResult } from '../../src/types/run.js';

describe('stats', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-unit-stats-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeRunResult = (overrides?: Partial<RunResult>): RunResult => ({
    id: '2026-04-07-10-00-00',
    timestamp: '2026-04-07T10:00:00Z',
    testCount: 2,
    passed: 1,
    failed: 1,
    durationMs: 5000,
    cost: 0.05,
    tokens: 3000,
    tests: [
      {
        id: 'TEST-1',
        name: 'basic',
        specName: 'runner',
        status: 'passed',
        durationMs: 2000,
        passed: true,
        passedChecks: 2,
        failedChecks: 0,
        totalChecks: 2,
        expectationLines: [],
        negativeExpectationLines: [],
      },
      {
        id: 'TEST-2',
        name: 'error',
        specName: 'runner',
        status: 'failed',
        durationMs: 3000,
        passed: false,
        passedChecks: 1,
        failedChecks: 1,
        totalChecks: 2,
        expectationLines: [],
        negativeExpectationLines: [],
      },
    ],
    ...overrides,
  });

  describe('createEmptyIndex', () => {
    it('returns a valid empty index', () => {
      const index = createEmptyIndex();
      expect(index.version).toBe(1);
      expect(index.aggregate.totalRuns).toBe(0);
      expect(index.tests).toEqual({});
      expect(index.runs).toEqual([]);
    });
  });

  describe('recordRun', () => {
    it('creates index if it does not exist', () => {
      const result = makeRunResult();
      recordRun(result, tmpDir);

      const indexPath = path.join(tmpDir, 'index.json');
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      expect(index.aggregate.totalRuns).toBe(1);
      expect(index.aggregate.passRate).toBe(0.5);
    });

    it('updates existing index', () => {
      recordRun(makeRunResult(), tmpDir);
      recordRun(
        makeRunResult({ id: '2026-04-07-11-00-00', passed: 2, failed: 0 }),
        tmpDir
      );

      const index = loadIndex(tmpDir);
      expect(index.aggregate.totalRuns).toBe(2);
      expect(index.runs).toHaveLength(2);
    });

    it('saves run artifact directory', () => {
      const result = makeRunResult();
      recordRun(result, tmpDir);

      const runDir = path.join(tmpDir, 'runs', result.id);
      expect(fs.existsSync(runDir)).toBe(true);

      const runData = JSON.parse(
        fs.readFileSync(path.join(runDir, 'run.json'), 'utf-8')
      );
      expect(runData.testCount).toBe(2);
    });

    it('tracks per-test statistics', () => {
      recordRun(makeRunResult(), tmpDir);

      const index = loadIndex(tmpDir);
      expect(index.tests['runner/TEST-1']).toBeDefined();
      expect(index.tests['runner/TEST-1'].passCount).toBe(1);
      expect(index.tests['runner/TEST-2'].passCount).toBe(0);
    });
  });

  describe('loadIndex', () => {
    it('returns empty index when no file exists', () => {
      const index = loadIndex(tmpDir);
      expect(index.aggregate.totalRuns).toBe(0);
    });
  });

  describe('cleanupRuns', () => {
    it('keeps only the last N runs', () => {
      for (let i = 0; i < 5; i++) {
        recordRun(makeRunResult({ id: `run-${i}` }), tmpDir);
      }

      cleanupRuns(tmpDir, 2);

      const index = loadIndex(tmpDir);
      expect(index.runs).toHaveLength(2);

      const runsDir = path.join(tmpDir, 'runs');
      const remaining = fs.readdirSync(runsDir);
      expect(remaining).toHaveLength(2);
    });
  });

  describe('deleteRun', () => {
    it('removes run from index and filesystem', () => {
      // Arrange
      recordRun(makeRunResult({ id: 'run-a' }), tmpDir);
      recordRun(makeRunResult({ id: 'run-b' }), tmpDir);
      recordRun(makeRunResult({ id: 'run-c' }), tmpDir);

      // Act
      deleteRun(tmpDir, 'run-b');

      // Assert
      const index = loadIndex(tmpDir);
      expect(index.runs).toHaveLength(2);
      expect(index.runs.map((r) => r.id)).toEqual(['run-a', 'run-c']);
      expect(fs.existsSync(path.join(tmpDir, 'runs', 'run-b'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'runs', 'run-a'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'runs', 'run-c'))).toBe(true);
    });

    it('rebuilds aggregate stats after deletion', () => {
      // Arrange
      recordRun(makeRunResult({ id: 'run-a' }), tmpDir);
      recordRun(makeRunResult({ id: 'run-b' }), tmpDir);

      // Act
      deleteRun(tmpDir, 'run-a');

      // Assert
      const index = loadIndex(tmpDir);
      expect(index.aggregate.totalRuns).toBe(1);
    });

    it('handles deleting the last remaining run', () => {
      // Arrange
      recordRun(makeRunResult({ id: 'run-only' }), tmpDir);

      // Act
      deleteRun(tmpDir, 'run-only');

      // Assert
      const index = loadIndex(tmpDir);
      expect(index.runs).toHaveLength(0);
      expect(index.aggregate.totalRuns).toBe(0);
      expect(index.tests).toEqual({});
    });

    it('handles deleting a nonexistent run gracefully', () => {
      // Arrange
      recordRun(makeRunResult({ id: 'run-a' }), tmpDir);

      // Act -- should not throw
      deleteRun(tmpDir, 'does-not-exist');

      // Assert
      const index = loadIndex(tmpDir);
      expect(index.runs).toHaveLength(1);
    });
  });

  describe('rebuildIndex', () => {
    it('reconstructs index from run files', () => {
      recordRun(makeRunResult(), tmpDir);

      // Delete index
      fs.unlinkSync(path.join(tmpDir, 'index.json'));

      rebuildIndex(tmpDir);

      const index = loadIndex(tmpDir);
      expect(index.aggregate.totalRuns).toBe(1);
    });
  });
});
