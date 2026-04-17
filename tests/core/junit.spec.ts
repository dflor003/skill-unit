import { describe, it, expect } from 'vitest';
import { generateJUnitXml } from '../../src/core/junit.js';
import type { RunResult } from '../../src/types/run.js';

function baseRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    id: '2026-04-17T12-00-00',
    timestamp: '2026-04-17T12-00-00',
    testCount: 0,
    passed: 0,
    failed: 0,
    durationMs: 0,
    cost: 0,
    tokens: 0,
    tests: [],
    ...overrides,
  };
}

describe('generateJUnitXml', () => {
  it('emits a testsuites root with aggregate totals', () => {
    // Arrange
    const run = baseRun({
      testCount: 2,
      passed: 1,
      failed: 1,
      durationMs: 5500,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          status: 'passed',
          durationMs: 2500,
          passed: true,
          passedChecks: 2,
          failedChecks: 0,
          totalChecks: 2,
          expectationLines: [],
          negativeExpectationLines: [],
        },
        {
          id: 'A-2',
          name: 'a2',
          specName: 'spec-a',
          status: 'failed',
          durationMs: 3000,
          passed: false,
          passedChecks: 1,
          failedChecks: 1,
          totalChecks: 2,
          expectationLines: ['- \u2717 did not match'],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toMatch(
      /<testsuites[^>]*name="skill-unit"[^>]*tests="2"[^>]*failures="1"[^>]*time="5.500"/
    );
  });

  it('groups test cases under one testsuite per spec', () => {
    // Arrange
    const run = baseRun({
      testCount: 3,
      passed: 3,
      failed: 0,
      durationMs: 6000,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          status: 'passed',
          durationMs: 2000,
          passed: true,
          passedChecks: 1,
          failedChecks: 0,
          totalChecks: 1,
          expectationLines: [],
          negativeExpectationLines: [],
        },
        {
          id: 'B-1',
          name: 'b1',
          specName: 'spec-b',
          status: 'passed',
          durationMs: 2000,
          passed: true,
          passedChecks: 1,
          failedChecks: 0,
          totalChecks: 1,
          expectationLines: [],
          negativeExpectationLines: [],
        },
        {
          id: 'B-2',
          name: 'b2',
          specName: 'spec-b',
          status: 'passed',
          durationMs: 2000,
          passed: true,
          passedChecks: 1,
          failedChecks: 0,
          totalChecks: 1,
          expectationLines: [],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toMatch(/<testsuite[^>]*name="spec-a"[^>]*tests="1"/);
    expect(xml).toMatch(/<testsuite[^>]*name="spec-b"[^>]*tests="2"/);
  });

  it('emits a failure node with details for failed tests', () => {
    // Arrange
    const run = baseRun({
      testCount: 1,
      passed: 0,
      failed: 1,
      durationMs: 1200,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          status: 'failed',
          durationMs: 1200,
          passed: false,
          passedChecks: 0,
          failedChecks: 2,
          totalChecks: 2,
          expectationLines: ['- \u2717 expected foo', '- \u2717 expected bar'],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('<failure');
    expect(xml).toContain('message="0/2 checks passed"');
    expect(xml).toContain('expected foo');
    expect(xml).toContain('expected bar');
  });

  it('emits an error node for status=error tests', () => {
    // Arrange
    const run = baseRun({
      testCount: 1,
      passed: 0,
      failed: 1,
      durationMs: 500,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          status: 'error',
          durationMs: 500,
          passed: false,
          passedChecks: 0,
          failedChecks: 0,
          totalChecks: 0,
          expectationLines: [],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('<error');
  });

  it('escapes XML special characters in names and messages', () => {
    // Arrange
    const run = baseRun({
      testCount: 1,
      passed: 0,
      failed: 1,
      durationMs: 1000,
      tests: [
        {
          id: 'A-1',
          name: 'a & b <c>',
          specName: 'spec-a',
          status: 'failed',
          durationMs: 1000,
          passed: false,
          passedChecks: 0,
          failedChecks: 1,
          totalChecks: 1,
          expectationLines: ['- \u2717 <bad> & "weird"'],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('name="a &amp; b &lt;c&gt;"');
    expect(xml).toContain('&lt;bad&gt; &amp; &quot;weird&quot;');
    expect(xml).not.toContain('<bad>');
  });

  it('includes file= attribute on testcase when specPath is present', () => {
    // Arrange
    const run = baseRun({
      testCount: 1,
      passed: 1,
      failed: 0,
      durationMs: 1000,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          specPath: 'skill-tests/skill-unit/spec-a.spec.md',
          status: 'passed',
          durationMs: 1000,
          passed: true,
          passedChecks: 1,
          failedChecks: 0,
          totalChecks: 1,
          expectationLines: [],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('file="skill-tests/skill-unit/spec-a.spec.md"');
  });

  it('omits file= attribute on testcase when specPath is missing', () => {
    // Arrange
    const run = baseRun({
      testCount: 1,
      passed: 1,
      failed: 0,
      durationMs: 1000,
      tests: [
        {
          id: 'A-1',
          name: 'a1',
          specName: 'spec-a',
          status: 'passed',
          durationMs: 1000,
          passed: true,
          passedChecks: 1,
          failedChecks: 0,
          totalChecks: 1,
          expectationLines: [],
          negativeExpectationLines: [],
        },
      ],
    });

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).not.toMatch(/<testcase[^>]*file=/);
  });

  it('renders zero-test runs without empty suites', () => {
    // Arrange
    const run = baseRun();

    // Act
    const xml = generateJUnitXml(run);

    // Assert
    expect(xml).toContain('<testsuites');
    expect(xml).toMatch(/tests="0"/);
    expect(xml).not.toContain('<testsuite ');
  });
});
