#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runCli } = require('../helpers');

describe('cli test', () => {
  describe('when invoked with no filters should require explicit opt-in', () => {
    it('should exit with code 1 and mention --all', () => {
      // Act
      const { exitCode, stderr } = runCli('test');

      // Assert
      assert.equal(exitCode, 1);
      assert.ok(stderr.includes('--all'));
    });
  });
});
