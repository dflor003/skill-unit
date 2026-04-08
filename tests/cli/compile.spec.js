#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { runCli } = require('../helpers');

describe('cli compile', () => {
  describe('when compiling by name', () => {
    it('should produce a manifest for the matching spec', () => {
      // Arrange
      const outDir = path.join(process.env.TEMP || '/tmp', 'su-cli-test');

      // Act
      const { stdout, exitCode } = runCli(
        'compile',
        'test-design-tests',
        '--timestamp',
        'unit-test',
        '--out-dir',
        outDir
      );

      // Assert
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes('Compiled 1 manifest'));
    });
  });
});
