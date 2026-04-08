#!/usr/bin/env node
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseYaml } = require('../../skills/skill-unit/scripts/compiler');

describe('parseYaml', () => {
  describe('when parsing scalar values', () => {
    it('should parse string values', () => {
      // Arrange
      const input = 'name: my-tests\nskill: commit';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.name, 'my-tests');
      assert.equal(result.skill, 'commit');
    });

    it('should parse boolean values', () => {
      // Arrange
      const input = 'show-passing-details: true\nenabled: false';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result['show-passing-details'], true);
      assert.equal(result.enabled, false);
    });

    it('should parse integer values', () => {
      // Arrange
      const input = 'max-turns: 10\ntimeout: 120';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result['max-turns'], 10);
      assert.equal(result.timeout, 120);
    });

    it('should parse path-like string values without coercion', () => {
      // Arrange
      const input = 'global-fixtures: ./fixtures/base-project';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result['global-fixtures'], './fixtures/base-project');
    });
  });

  describe('when parsing quoted strings', () => {
    it('should strip double quotes', () => {
      // Arrange
      const input = 'name: "my tests"';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.name, 'my tests');
    });

    it('should strip single quotes', () => {
      // Arrange
      const input = "path: './fixtures'";

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.path, './fixtures');
    });
  });

  describe('when parsing inline lists', () => {
    it('should parse comma-separated items', () => {
      // Arrange
      const input = 'tags: [happy-path, slash-command, fixtures]';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.deepEqual(result.tags, [
        'happy-path',
        'slash-command',
        'fixtures',
      ]);
    });

    it('should parse an empty list', () => {
      // Arrange
      const input = 'tags: []';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.deepEqual(result.tags, []);
    });

    it('should strip quotes from list items', () => {
      // Arrange
      const input = 'tools: ["Bash(docker *)", "Read"]';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.deepEqual(result.tools, ['Bash(docker *)', 'Read']);
    });
  });

  describe('when parsing block lists', () => {
    it('should collect indented dash items', () => {
      // Arrange
      const input = 'allowed-tools:\n  - Read\n  - Write\n  - Edit';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.deepEqual(result['allowed-tools'], ['Read', 'Write', 'Edit']);
    });
  });

  describe('when parsing nested objects', () => {
    it('should parse one level of nesting', () => {
      // Arrange
      const input = 'runner:\n  tool: claude\n  model: sonnet\n  max-turns: 50';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.deepEqual(result.runner, {
        tool: 'claude',
        model: 'sonnet',
        'max-turns': 50,
      });
    });

    it('should parse nested objects containing block lists', () => {
      // Arrange
      const input =
        'runner:\n  tool: claude\n  allowed-tools:\n    - Read\n    - Write';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.runner.tool, 'claude');
      assert.deepEqual(result.runner['allowed-tools'], ['Read', 'Write']);
    });
  });

  describe('when input contains comments and blank lines', () => {
    it('should skip comment lines and blanks', () => {
      // Arrange
      const input =
        '# This is a comment\nname: foo\n\n# Another comment\nskill: bar';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.name, 'foo');
      assert.equal(result.skill, 'bar');
    });

    it('should strip inline comments from values', () => {
      // Arrange
      const input = 'timeout: 60s # per test';

      // Act
      const result = parseYaml(input);

      // Assert
      assert.equal(result.timeout, '60s');
    });
  });
});
