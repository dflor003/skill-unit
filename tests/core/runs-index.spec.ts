import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  listRuns,
  resolveRunId,
  loadRunIndex,
  loadTest,
  UnknownRunError,
  UnknownTestError,
} from '../../src/core/runs-index.js';

const HAPPY = path.join('tests', 'fixtures', 'runs', 'latest-is-2026-04-18');
const EMPTY = path.join('tests', 'fixtures', 'runs', 'empty');

describe('runs-index', () => {
  describe('listRuns', () => {
    it('when runs root has entries should return them newest first', () => {
      // Act
      const runs = listRuns(path.join(HAPPY, 'runs'));

      // Assert
      expect(runs.map((r) => r.id)).toEqual([
        '2026-04-18-12-00-00',
        '2026-04-17-10-00-00',
      ]);
    });

    it('when runs root is missing should return an empty list', () => {
      // Act
      const runs = listRuns(path.join(EMPTY, 'runs'));

      // Assert
      expect(runs).toEqual([]);
    });
  });

  describe('resolveRunId', () => {
    it('when given "latest" should return the newest directory name', () => {
      // Act
      const id = resolveRunId('latest', path.join(HAPPY, 'runs'));

      // Assert
      expect(id).toBe('2026-04-18-12-00-00');
    });

    it('when given an exact id should return it unchanged', () => {
      // Act
      const id = resolveRunId('2026-04-17-10-00-00', path.join(HAPPY, 'runs'));

      // Assert
      expect(id).toBe('2026-04-17-10-00-00');
    });

    it('when the id does not exist should throw UnknownRunError listing available runs', () => {
      // Act + Assert
      expect(() => resolveRunId('nope', path.join(HAPPY, 'runs'))).toThrow(
        UnknownRunError
      );
      try {
        resolveRunId('nope', path.join(HAPPY, 'runs'));
      } catch (err) {
        expect((err as Error).message).toContain('2026-04-18-12-00-00');
        expect((err as Error).message).toContain('2026-04-17-10-00-00');
      }
    });

    it('when "latest" is used on an empty root should throw UnknownRunError', () => {
      // Act + Assert
      expect(() => resolveRunId('latest', path.join(EMPTY, 'runs'))).toThrow(
        UnknownRunError
      );
    });
  });

  describe('loadRunIndex', () => {
    it('when the run has pass and fail tests should aggregate verdict + paths', () => {
      // Arrange
      const runId = '2026-04-17-10-00-00';

      // Act
      const index = loadRunIndex(runId, path.join(HAPPY, 'runs'));

      // Assert
      expect(index.runId).toBe(runId);
      expect(index.passed).toBe(1);
      expect(index.failed).toBe(1);
      expect(index.total).toBe(2);
      const ex1 = index.tests.find((t) => t.testId === 'EX-1');
      const ex2 = index.tests.find((t) => t.testId === 'EX-2');
      expect(ex1?.passed).toBe(true);
      expect(ex2?.passed).toBe(false);
      expect(ex2?.failureReason).toContain('structured error message');
      expect(
        ex2?.transcriptPath.endsWith('example-tests.EX-2.transcript.md')
      ).toBe(true);
      expect(
        ex2?.graderTranscriptPath?.endsWith(
          'example-tests.EX-2.grader-transcript.md'
        )
      ).toBe(true);
    });
  });

  describe('loadTest', () => {
    it('when the test exists should return its aggregated entry', () => {
      // Act
      const test = loadTest(
        '2026-04-17-10-00-00',
        'EX-2',
        path.join(HAPPY, 'runs')
      );

      // Assert
      expect(test.testId).toBe('EX-2');
      expect(test.passed).toBe(false);
    });

    it('when the test id is unknown should throw UnknownTestError listing available ids', () => {
      // Act + Assert
      try {
        loadTest('2026-04-17-10-00-00', 'ZZ-9', path.join(HAPPY, 'runs'));
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownTestError);
        expect((err as Error).message).toContain('EX-1');
        expect((err as Error).message).toContain('EX-2');
      }
    });
  });
});
