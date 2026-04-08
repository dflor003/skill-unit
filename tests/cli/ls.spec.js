#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runCli } = require('../helpers');

describe('cli ls', () => {
  describe('when no filters are provided', () => {
    it('should list all discovered specs', () => {
      // Act
      const { stdout, exitCode } = runCli('ls');

      // Assert
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('test-design-tests'));
      assert.ok(stdout.includes('test-design-pdd'));
      assert.ok(stdout.includes('skill-unit-runner-tests'));
      assert.ok(stdout.includes('TD-1'));
    });
  });

  describe('when filtered by name', () => {
    it('should show only the matching spec', () => {
      // Act
      const { stdout, exitCode } = runCli('ls', 'test-design-tests');

      // Assert
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('test-design-tests'));
      assert.ok(!stdout.includes('test-design-pdd'));
      assert.ok(!stdout.includes('skill-unit-runner-tests'));
    });
  });

  describe('when filtered by multiple names', () => {
    it('should show all matching specs', () => {
      // Act
      const { stdout } = runCli('ls', 'test-design-tests', 'test-design-pdd');

      // Assert
      assert.ok(stdout.includes('test-design-tests'));
      assert.ok(stdout.includes('test-design-pdd'));
      assert.ok(!stdout.includes('skill-unit-runner-tests'));
    });
  });

  describe('when filtered by tag', () => {
    it('should show only specs matching the tag', () => {
      // Act
      const { stdout } = runCli('ls', '--tag', 'integration');

      // Assert
      assert.ok(stdout.includes('skill-unit-runner-tests'));
      assert.ok(!stdout.includes('test-design-tests'));
    });
  });

  describe('when filtered by test case ID', () => {
    it('should show only matching test cases', () => {
      // Act
      const { stdout } = runCli('ls', '--test', 'TD-1,TD-3');

      // Assert
      assert.ok(stdout.includes('TD-1'));
      assert.ok(stdout.includes('TD-3'));
      assert.ok(!stdout.includes('TD-2'));
      assert.ok(!stdout.includes('TD-4'));
    });
  });

  describe('when filtered by file', () => {
    it('should show only the spec from that file', () => {
      // Act
      const { stdout } = runCli(
        'ls',
        '-f',
        'skill-tests/skill-unit/runner.spec.md'
      );

      // Assert
      assert.ok(stdout.includes('skill-unit-runner-tests'));
      assert.ok(!stdout.includes('test-design'));
    });
  });

  describe('when name matches nothing should report no specs found', () => {
    it('should print a no-specs-found message', () => {
      // Act
      const { stdout } = runCli('ls', 'nonexistent-suite-xyz');

      // Assert
      assert.ok(stdout.includes('No spec files found'));
    });
  });
});
