#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  resolveSkillPath,
} = require('../../skills/skill-unit/scripts/compiler');

describe('resolveSkillPath', () => {
  describe('when skill exists under skills/ directory', () => {
    it('should return the relative path to the skill directory', () => {
      // Arrange
      const skillName = 'skill-unit';

      // Act
      const result = resolveSkillPath(skillName, process.cwd());

      // Assert
      assert.equal(result, path.join('skills', 'skill-unit'));
    });
  });

  describe('when skill does not exist should return null', () => {
    it('should return null', () => {
      // Act
      const result = resolveSkillPath('nonexistent-skill-xyz', process.cwd());

      // Assert
      assert.equal(result, null);
    });
  });

  describe('when skill name is null should return null', () => {
    it('should return null', () => {
      // Act
      const result = resolveSkillPath(null, process.cwd());

      // Assert
      assert.equal(result, null);
    });
  });
});
