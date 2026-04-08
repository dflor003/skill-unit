#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFrontmatter,
} = require('../../skills/skill-unit/scripts/compiler');

describe('parseFrontmatter', () => {
  describe('when content has valid frontmatter delimiters', () => {
    it('should extract frontmatter fields and body', () => {
      // Arrange
      const content =
        '---\nname: my-tests\nskill: commit\n---\n\n### TC-1: test\n\nBody here.';

      // Act
      const { frontmatter, body } = parseFrontmatter(content);

      // Assert
      assert.equal(frontmatter.name, 'my-tests');
      assert.equal(frontmatter.skill, 'commit');
      assert.ok(body.includes('### TC-1: test'));
    });
  });

  describe('when content has no frontmatter delimiters should return empty frontmatter', () => {
    it('should return empty frontmatter and full content as body', () => {
      // Arrange
      const content = 'Just a plain markdown file.';

      // Act
      const { frontmatter, body } = parseFrontmatter(content);

      // Assert
      assert.deepEqual(frontmatter, {});
      assert.equal(body, content);
    });
  });

  describe('when content has only an opening delimiter should return empty frontmatter', () => {
    it('should return empty frontmatter', () => {
      // Arrange
      const content = '---\nname: broken';

      // Act
      const { frontmatter } = parseFrontmatter(content);

      // Assert
      assert.deepEqual(frontmatter, {});
    });
  });
});
