import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseResultsFile,
  generateSummary,
  generateReport,
  isResultsFilePassed,
  parseResultsJson,
  renderResultsMarkdown,
  validateGraderJson,
  normalizeGraderJson,
  GraderJsonError,
  type GraderResultJson,
} from '../../src/core/reporter.js';

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

describe('validateGraderJson', () => {
  const baseJson: GraderResultJson = {
    testId: 'SU-5',
    testName: 'Discovers and Runs Multiple Spec Files',
    passed: true,
    expectations: [
      { text: 'Discovers multiple specs', met: true, evidence: 'Turn 4' },
    ],
    negativeExpectations: [
      { text: 'Does not stop after first', met: true, evidence: 'Turn 9' },
    ],
  };

  it('accepts a well-formed payload', () => {
    expect(() => validateGraderJson(baseJson)).not.toThrow();
  });

  it.each([
    ['missing testId', { ...baseJson, testId: undefined }],
    ['missing passed', { ...baseJson, passed: undefined }],
    ['expectations not an array', { ...baseJson, expectations: 'nope' }],
    ['check missing met', { ...baseJson, expectations: [{ text: 'x' }] }],
    [
      'check met is a string',
      { ...baseJson, expectations: [{ text: 'x', met: 'true' }] },
    ],
  ])('rejects %s', (_label, payload) => {
    expect(() => validateGraderJson(payload)).toThrow(GraderJsonError);
  });

  it('rejects a non-object payload', () => {
    expect(() => validateGraderJson(null)).toThrow(GraderJsonError);
    expect(() => validateGraderJson('hello')).toThrow(GraderJsonError);
  });
});

describe('normalizeGraderJson', () => {
  // Every variant below was observed in real grader output. Haiku understood
  // the schema but renamed fields on the way out. Normalization brings all
  // of these back onto the canonical shape so a drifted field name does not
  // cost us the run.

  it('accepts the canonical shape unchanged', () => {
    const input = {
      testId: 'SU-5',
      testName: 'name',
      passed: true,
      expectations: [{ text: 'x', met: true }],
      negativeExpectations: [{ text: 'y', met: true }],
    };
    expect(normalizeGraderJson(input)).toMatchObject({
      testId: 'SU-5',
      passed: true,
    });
  });

  it('accepts snake_case testId / testName', () => {
    const input = {
      test_id: 'SU-5',
      test_name: 'name',
      passed: true,
      expectations: [],
      negativeExpectations: [],
    };
    expect(normalizeGraderJson(input).testId).toBe('SU-5');
    expect(normalizeGraderJson(input).testName).toBe('name');
  });

  it.each([
    ['overallResult as pass string', { overallResult: 'pass' }, true],
    ['overall_result as fail string', { overall_result: 'fail' }, false],
    ['overallStatus string', { overallStatus: 'passed' }, true],
    ['overall_status string', { overall_status: 'failed' }, false],
    ['passFailStatus string', { passFailStatus: 'pass' }, true],
    ['overall_pass boolean', { overall_pass: true }, true],
    ['overallPass boolean', { overallPass: false }, false],
    ['bare status string', { status: 'fail' }, false],
    ['bare result string', { result: 'pass' }, true],
  ])('maps %s to canonical passed', (_label, verdictFields, expected) => {
    const input = {
      testId: 'x',
      testName: 'y',
      expectations: [{ text: 'a', met: true }],
      negativeExpectations: [],
      ...verdictFields,
    };
    expect(normalizeGraderJson(input).passed).toBe(expected);
  });

  it('unwraps expectations nested inside a grading wrapper', () => {
    // Seen in SU-1: `{ testId, testName, passed, grading: { expectations, ... } }`
    const input = {
      testId: 'SU-1',
      testName: 'name',
      passed: false,
      grading: {
        expectations: [{ description: 'a', met: false, evidence: 'e' }],
        negativeExpectations: [{ description: 'b', met: true }],
      },
    };
    const out = normalizeGraderJson(input);
    expect(out.expectations).toEqual([
      { text: 'a', met: false, evidence: 'e' },
    ]);
    expect(out.negativeExpectations).toEqual([{ text: 'b', met: true }]);
  });

  it.each([
    ['expectation alias', 'expectation'],
    ['description alias', 'description'],
    ['name alias', 'name'],
  ])('maps check text from the %s key', (_label, key) => {
    const input = {
      testId: 'x',
      testName: 'y',
      passed: true,
      expectations: [{ [key]: 'the text', met: true }],
      negativeExpectations: [],
    };
    expect(normalizeGraderJson(input).expectations[0].text).toBe('the text');
  });

  it.each([
    ['status=pass string', { status: 'pass' }, true],
    ['status=failed string', { status: 'failed' }, false],
    ['result=met string', { result: 'met' }, true],
    ['result=not met string', { result: 'not met' }, false],
    ['passed boolean', { passed: true }, true],
  ])(
    'maps check met field from %s',
    (_label, metField: Record<string, unknown>, expected: boolean) => {
      const input = {
        testId: 'x',
        testName: 'y',
        passed: expected,
        expectations: [{ text: 'a', ...metField }],
        negativeExpectations: [],
      };
      expect(normalizeGraderJson(input).expectations[0].met).toBe(expected);
    }
  );

  it('when no explicit verdict is provided should derive it from checks', () => {
    const allMet = {
      testId: 'x',
      testName: 'y',
      expectations: [
        { text: 'a', met: true },
        { text: 'b', met: true },
      ],
      negativeExpectations: [{ text: 'c', met: true }],
    };
    expect(normalizeGraderJson(allMet).passed).toBe(true);

    const oneUnmet = {
      testId: 'x',
      testName: 'y',
      expectations: [
        { text: 'a', met: true },
        { text: 'b', met: false },
      ],
      negativeExpectations: [{ text: 'c', met: true }],
    };
    expect(normalizeGraderJson(oneUnmet).passed).toBe(false);
  });

  it('drops check items that lack a text field', () => {
    // Defensive: if a grader emits a malformed item alongside good ones, we
    // keep the valid entries rather than failing the whole run.
    const input = {
      testId: 'x',
      testName: 'y',
      passed: true,
      expectations: [{ text: 'good', met: true }, { met: true }, null],
      negativeExpectations: [],
    };
    expect(normalizeGraderJson(input).expectations).toEqual([
      { text: 'good', met: true },
    ]);
  });

  it('throws when neither verdict nor checks are present', () => {
    expect(() =>
      normalizeGraderJson({
        testId: 'x',
        testName: 'y',
        expectations: [],
        negativeExpectations: [],
      })
    ).toThrow(GraderJsonError);
  });

  it('throws when testId is missing entirely', () => {
    expect(() =>
      normalizeGraderJson({
        testName: 'y',
        passed: true,
        expectations: [{ text: 'a', met: true }],
        negativeExpectations: [],
      })
    ).toThrow(GraderJsonError);
  });

  it('carries the evidence string through normalization', () => {
    const input = {
      testId: 'x',
      testName: 'y',
      passed: false,
      expectations: [
        {
          description: 'Discovers the spec',
          met: false,
          evidence: 'Turn 6: no discovery',
        },
      ],
      negativeExpectations: [],
    };
    expect(normalizeGraderJson(input).expectations[0].evidence).toBe(
      'Turn 6: no discovery'
    );
  });
});

describe('parseResultsJson', () => {
  it('parses a passing grader payload', () => {
    const content = JSON.stringify({
      testId: 'SU-5',
      testName: 'Runs all specs',
      passed: true,
      expectations: [
        { text: 'Finds specs', met: true, evidence: 'Turn 4' },
        { text: 'Runs specs', met: true },
      ],
      negativeExpectations: [
        { text: 'Does not stop early', met: true, evidence: 'Turn 9' },
      ],
    });
    const result = parseResultsJson(content);
    expect(result.testId).toBe('SU-5');
    expect(result.testName).toBe('Runs all specs');
    expect(result.passed).toBe(true);
    expect(result.passedChecks).toBe(3);
    expect(result.failedChecks).toBe(0);
    expect(result.totalChecks).toBe(3);
    expect(result.expectationLines).toContain('- ✓ Finds specs');
    expect(result.expectationLines).toContain('  → Turn 4');
    expect(result.negativeExpectationLines).toContain(
      '- ✓ Does not stop early'
    );
  });

  it('parses a failing payload with evidence on unmet checks', () => {
    const content = JSON.stringify({
      testId: 'SU-1',
      testName: 'Runs the tests',
      passed: false,
      expectations: [
        {
          text: 'Discovers the spec file',
          met: false,
          evidence: 'Turn 6: no discovery occurred',
        },
      ],
      negativeExpectations: [{ text: 'Does not fabricate', met: true }],
    });
    const result = parseResultsJson(content);
    expect(result.passed).toBe(false);
    expect(result.passedChecks).toBe(1);
    expect(result.failedChecks).toBe(1);
    expect(result.expectationLines).toEqual([
      '- ✗ Discovers the spec file',
      '  → Turn 6: no discovery occurred',
    ]);
  });

  it('throws GraderJsonError on malformed JSON', () => {
    expect(() => parseResultsJson('not json {')).toThrow(GraderJsonError);
  });

  it('throws GraderJsonError on schema violations', () => {
    expect(() => parseResultsJson(JSON.stringify({ testId: 'x' }))).toThrow(
      GraderJsonError
    );
  });
});

describe('renderResultsMarkdown', () => {
  // The rendered markdown has to parse cleanly under the legacy parser so the
  // TUI drill-in and report.md stay backward-compatible. Each test below
  // checks both the rendered form AND a round-trip through parseResultsFile.
  it('renders canonical markdown for a passing test', () => {
    const data: GraderResultJson = {
      testId: 'SU-5',
      testName: 'Runs all specs',
      prompt: 'Run all tests',
      passed: true,
      expectations: [{ text: 'Finds specs', met: true, evidence: 'Turn 4' }],
      negativeExpectations: [
        { text: 'Does not stop early', met: true, evidence: 'Turn 9' },
      ],
    };
    const md = renderResultsMarkdown(data);
    expect(md).toContain('# Results: SU-5: Runs all specs');
    expect(md).toContain('**Verdict:** PASS');
    expect(md).toContain('- ✓ Finds specs');

    // Round-trip through the legacy parser -- same verdict and same line forms
    const parsed = parseResultsFile(md);
    expect(parsed.passed).toBe(true);
    expect(parsed.testId).toBe('SU-5');
    expect(isResultsFilePassed(md)).toBe(true);
  });

  it('renders FAIL verdict for a failing test', () => {
    const data: GraderResultJson = {
      testId: 'SU-1',
      testName: 'Runs the tests',
      passed: false,
      expectations: [
        { text: 'Discovers spec', met: false, evidence: 'Turn 6' },
      ],
      negativeExpectations: [],
    };
    const md = renderResultsMarkdown(data);
    expect(md).toContain('**Verdict:** FAIL');
    expect(isResultsFilePassed(md)).toBe(false);
  });
});

describe('generateReport with grader JSON', () => {
  // New grader contract: JSON is the source of truth, markdown is rendered
  // from it. Confirm the report picks up the JSON even when markdown drifts.
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-unit-reporter-'));
    fs.mkdirSync(path.join(tmpDir, 'results'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prefers the sibling .results.json over the .results.md when both exist', () => {
    // Arrange -- the markdown lies about the verdict (legacy drift); the
    // JSON is the source of truth. The report must trust the JSON.
    const jsonPayload: GraderResultJson = {
      testId: 'SU-5',
      testName: 'Runs all specs',
      passed: true,
      expectations: [{ text: 'ok', met: true }],
      negativeExpectations: [],
    };
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.SU-5.results.json'),
      JSON.stringify(jsonPayload)
    );
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.SU-5.results.md'),
      '# Results: SU-5\n\n**Verdict:** FAIL\n'
    );

    // Act
    const report = generateReport(tmpDir);

    // Assert
    const entry = report.grouped['spec'][0];
    expect(entry.passed).toBe(true);
    expect(entry.testId).toBe('SU-5');
  });

  it('falls back to markdown when JSON is malformed', () => {
    // Arrange -- legacy run scenario: no JSON, only markdown
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.SU-5.results.json'),
      '{ not valid json'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.SU-5.results.md'),
      '# Results: SU-5: Legacy\n\n**Verdict:** PASS\n'
    );

    // Act
    const report = generateReport(tmpDir);

    // Assert
    const entry = report.grouped['spec'][0];
    expect(entry.passed).toBe(true);
  });
});

describe('isResultsFilePassed', () => {
  // Each case below is a real phrasing observed in grader output. Haiku drifts
  // across keywords, emojis, and boldness no matter how the grader.md template
  // is worded, so the parser has to absorb the variance.

  describe('when the verdict clearly passes', () => {
    it.each([
      ['canonical bold verdict', '**Verdict:** PASS'],
      ['heading verdict', '## Verdict: PASS'],
      ['Status keyword', '**Status:** ✅ PASS'],
      ['Result keyword', '**Result:** ✅ PASS'],
      ['heading verdict with emoji', '## Verdict: ✅ PASS'],
      ['past-tense PASSED', '**Status:** ✅ PASSED'],
      ['emoji between colon and token', '**Verdict:** ✅ PASS'],
    ])('returns true for %s', (_label, line) => {
      expect(isResultsFilePassed(`${line}\n\nsome body`)).toBe(true);
    });
  });

  describe('when the verdict clearly fails', () => {
    it.each([
      ['canonical bold verdict', '**Verdict:** FAIL'],
      ['Status FAIL', '**Status:** ❌ FAIL'],
      ['Status FAILED', '**Status:** ❌ FAILED'],
      ['Result FAILED', '**Result:** ❌ FAILED'],
      ['Overall Result compound keyword', '**Overall Result:** ❌ FAILED'],
      ['token wrapped in extra bold', '**Status:** ❌ **FAIL**'],
    ])('returns false for %s', (_label, line) => {
      expect(isResultsFilePassed(`${line}\n\nsome body`)).toBe(false);
    });
  });

  // PARTIAL PASS is the grader hedging -- not a clean pass. Treat as fail so
  // the framework never records a half-passing test as passing.
  it('when verdict is "PARTIAL PASS" should treat as fail', () => {
    expect(isResultsFilePassed('**Verdict:** ⚠️ PARTIAL PASS\n\nbody')).toBe(
      false
    );
  });

  it('when both PASS and FAIL appear on the verdict line, FAIL wins', () => {
    // Defensive: if a grader writes "**Status:** FAIL (expected PASS)" or
    // similar, we do not want the stray PASS token to flip the verdict.
    expect(
      isResultsFilePassed('**Status:** ❌ FAIL (expected PASS)\n\nbody')
    ).toBe(false);
  });

  it('when no verdict line is present should return false', () => {
    expect(isResultsFilePassed('Just some markdown\nwith no verdict.')).toBe(
      false
    );
  });
});

describe('generateReport testId recovery from filename', () => {
  // When the grader writes a heading that does not match the content-based
  // testId regex (e.g. "# Results: PDD-2" with no name, or "# Grading Results:
  // TD-4"), the parser previously returned testId="unknown". Downstream code
  // then could not match the graded result back to the test, and the recorded
  // runs-list pass/fail count disagreed with the drill-in and live views.
  // The filename always encodes the testId, so we fall back to it.
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-unit-reporter-'));
    fs.mkdirSync(path.join(tmpDir, 'results'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('when heading lacks a name separator should use testId from filename', () => {
    // Arrange
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.PDD-2.results.md'),
      '# Results: PDD-2\n## Verdict: PASS\n'
    );

    // Act
    const report = generateReport(tmpDir);

    // Assert
    const entry = report.grouped['spec'][0];
    expect(entry.testId).toBe('PDD-2');
    expect(entry.passed).toBe(true);
  });

  it('when heading uses a non-canonical prefix should still recover the testId', () => {
    // Arrange (grader sometimes writes "# Grading Results:" instead of "# Results:")
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.TD-4.results.md'),
      '# Grading Results: TD-4\n**Verdict:** FAIL\n'
    );

    // Act
    const report = generateReport(tmpDir);

    // Assert
    const entry = report.grouped['spec'][0];
    expect(entry.testId).toBe('TD-4');
    expect(entry.passed).toBe(false);
  });

  it('when heading is canonical should prefer the content testId', () => {
    // Arrange
    fs.writeFileSync(
      path.join(tmpDir, 'results', 'spec.TEST-1.results.md'),
      '# Results: TEST-1: basic-usage\n**Verdict:** PASS\n'
    );

    // Act
    const report = generateReport(tmpDir);

    // Assert
    const entry = report.grouped['spec'][0];
    expect(entry.testId).toBe('TEST-1');
    expect(entry.testName).toBe('basic-usage');
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
