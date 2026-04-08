#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveToolPermissions,
} = require('../../skills/skill-unit/scripts/compiler');

describe('resolveToolPermissions', () => {
  describe('when no overrides are provided', () => {
    it('should return built-in defaults', () => {
      // Arrange
      const config = {};
      const spec = {};

      // Act
      const { allowed, disallowed } = resolveToolPermissions(config, spec);

      // Assert
      assert.deepEqual(allowed, [
        'Read',
        'Write',
        'Edit',
        'Bash',
        'Glob',
        'Grep',
        'Agent',
        'Skill',
      ]);
      assert.deepEqual(disallowed, ['AskUserQuestion']);
    });
  });

  describe('when config specifies allowed-tools', () => {
    it('should fully replace the built-in allowed list', () => {
      // Arrange
      const config = { runner: { 'allowed-tools': ['Read', 'Glob'] } };

      // Act
      const { allowed } = resolveToolPermissions(config, {});

      // Assert
      assert.deepEqual(allowed, ['Read', 'Glob']);
    });
  });

  describe('when config specifies disallowed-tools', () => {
    it('should fully replace the built-in disallowed list', () => {
      // Arrange
      const config = { runner: { 'disallowed-tools': ['Bash', 'Write'] } };

      // Act
      const { disallowed } = resolveToolPermissions(config, {});

      // Assert
      assert.deepEqual(disallowed, ['Bash', 'Write']);
    });
  });

  describe('when spec has allowed-tools (full replace)', () => {
    it('should replace resolved list and ignore allowed-tools-extra', () => {
      // Arrange
      const config = {};
      const spec = {
        'allowed-tools': ['Read', 'Grep'],
        'allowed-tools-extra': ['Bash'],
      };

      // Act
      const { allowed } = resolveToolPermissions(config, spec);

      // Assert
      assert.deepEqual(allowed, ['Read', 'Grep']);
    });
  });

  describe('when spec has allowed-tools-extra', () => {
    it('should union with the resolved allowed list', () => {
      // Arrange
      const config = {};
      const spec = { 'allowed-tools-extra': ['Bash(docker *)'] };

      // Act
      const { allowed } = resolveToolPermissions(config, spec);

      // Assert
      assert.ok(allowed.includes('Bash(docker *)'));
      assert.ok(allowed.includes('Read'));
    });

    it('should not create duplicates when tool is already in the list', () => {
      // Arrange
      const config = {};
      const spec = { 'allowed-tools-extra': ['Read'] };

      // Act
      const { allowed } = resolveToolPermissions(config, spec);

      // Assert
      const readCount = allowed.filter((t) => t === 'Read').length;
      assert.equal(readCount, 1);
    });
  });

  describe('when a tool appears in both allowed and disallowed', () => {
    it('should remove it from allowed (disallow wins)', () => {
      // Arrange
      const config = {};
      const spec = {
        'allowed-tools-extra': ['Bash(rm -rf *)'],
        'disallowed-tools-extra': ['Bash(rm -rf *)'],
      };

      // Act
      const { allowed, disallowed } = resolveToolPermissions(config, spec);

      // Assert
      assert.ok(!allowed.includes('Bash(rm -rf *)'));
      assert.ok(disallowed.includes('Bash(rm -rf *)'));
    });
  });

  describe('when all three levels override', () => {
    it('should apply spec over config over built-in', () => {
      // Arrange
      const config = { runner: { 'allowed-tools': ['Read', 'Write', 'Glob'] } };
      const spec = { 'allowed-tools': ['Read'] };

      // Act
      const { allowed } = resolveToolPermissions(config, spec);

      // Assert
      assert.deepEqual(allowed, ['Read']);
    });
  });
});
