import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { loadHistoricalRun } from '../../src/tui/hooks/use-historical-run.js';

describe('loadHistoricalRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when given a valid run directory', () => {
    it('should load transcripts and results', () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'my-spec.TEST-1.transcript.md',
        'my-spec.TEST-1.results.md',
        'my-spec.TEST-2.transcript.md',
        'my-spec.TEST-2.results.md',
      ] as unknown as fs.Dirent[]);
      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: fs.PathOrFileDescriptor) => {
        const p = String(filePath);
        if (p.includes('TEST-1.transcript')) return '## Turn 1\nHello world';
        if (p.includes('TEST-1.results')) return '# Results: TEST-1: basic test\n\n**Verdict:** PASS';
        if (p.includes('TEST-2.transcript')) return '## Turn 1\nGoodbye';
        if (p.includes('TEST-2.results')) return '# Results: TEST-2: advanced test\n\n**Verdict:** FAIL';
        return '';
      });

      // Act
      const result = loadHistoricalRun('.workspace/runs/2026-04-07-10-00-00', {
        id: '2026-04-07-10-00-00',
        timestamp: '2026-04-07T10:00:00Z',
        testCount: 2,
        passed: 1,
        failed: 1,
        duration: 30000,
        cost: 0.10,
        tokens: 5000,
      });

      // Assert
      expect(result.tests).toHaveLength(2);
      expect(result.tests[0].transcript.length).toBeGreaterThan(0);
      expect(result.tests[0].status).toBe('passed');
      expect(result.tests[1].status).toBe('failed');
      expect(result.status).toBe('complete');
      expect(result.activeTestId).toBe('TEST-1');
    });
  });

  describe('when run directory has no results dir', () => {
    it('should return empty tests', () => {
      // Arrange
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      // Act
      const result = loadHistoricalRun('.workspace/runs/missing', {
        id: 'missing',
        timestamp: '2026-04-07T10:00:00Z',
        testCount: 0,
        passed: 0,
        failed: 0,
        duration: 0,
        cost: 0,
        tokens: 0,
      });

      // Assert
      expect(result.tests).toHaveLength(0);
      expect(result.activeTestId).toBeNull();
    });
  });
});
