import { describe, it, expect } from 'vitest';
import { parseResultsFile, generateSummary } from '../../src/core/reporter.js';

describe('parseResultsFile', () => {
  it('parses a passing results file', () => {
    const content = `# Results: TEST-1: basic-usage

**Verdict:** PASS

- ✓ File was created at correct path
- ✓ Output contains expected text
`;
    const result = parseResultsFile(content);
    expect(result.testId).toBe('TEST-1');
    expect(result.testName).toBe('basic-usage');
    expect(result.passed).toBe(true);
    expect(result.passedChecks).toBe(2);
    expect(result.failedChecks).toBe(0);
  });

  it('parses heading-style verdict (## Verdict: PASS)', () => {
    // Arrange
    const content = `# Results: TD-1 — Generated Test Case
## Verdict: PASS
## Expectation Results
`;

    // Act
    const result = parseResultsFile(content);

    // Assert
    expect(result.passed).toBe(true);
  });

  it('parses heading-style result (## Result: PASS)', () => {
    // Arrange
    const content = `# Test Result: TD-2 -- Detects Existing Spec
## Result: PASS
## Score: 5 / 5
`;

    // Act
    const result = parseResultsFile(content);

    // Assert
    expect(result.passed).toBe(true);
  });

  it('parses bold-wrapped result (**Result: FAIL**)', () => {
    // Arrange
    const content = `# Results: TD-1 — Some Test
**Result: FAIL**
`;

    // Act
    const result = parseResultsFile(content);

    // Assert
    expect(result.passed).toBe(false);
  });

  it('parses heading-style verdict FAIL (## Verdict: FAIL)', () => {
    // Arrange
    const content = `# Results: TD-1 — Some Test
## Verdict: FAIL
`;

    // Act
    const result = parseResultsFile(content);

    // Assert
    expect(result.passed).toBe(false);
  });

  it('parses a failing results file', () => {
    const content = `# Results: TEST-2: error-case

**Verdict:** FAIL

- ✓ File was created
- ✗ Output does not contain expected text
  → Expected "success" but found "error"
`;
    const result = parseResultsFile(content);
    expect(result.passed).toBe(false);
    expect(result.passedChecks).toBe(1);
    expect(result.failedChecks).toBe(1);
  });
});

describe('generateSummary', () => {
  it('produces terminal summary with pass/fail counts', () => {
    const runResult = {
      id: '2026-04-07-10-00-00',
      timestamp: '2026-04-07T10:00:00Z',
      testCount: 3,
      passed: 2,
      failed: 1,
      durationMs: 5000,
      cost: 0.05,
      tokens: 3000,
      tests: [],
    };
    const summary = generateSummary(runResult);
    expect(summary).toContain('2 passed');
    expect(summary).toContain('1 failed');
    expect(summary).toContain('3 total');
  });
});
