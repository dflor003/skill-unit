#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { resolveFixturePath } = require("../../skills/skill-unit/scripts/compiler");

describe("resolveFixturePath", () => {
  describe("when given a relative path should resolve from spec directory", () => {
    it("should return a path relative to repo root", () => {
      // Arrange
      const fixturePath = "./fixtures/base";
      const specDir = path.resolve("skill-tests/my-skill");
      const repoRoot = process.cwd();

      // Act
      const result = resolveFixturePath(fixturePath, specDir, repoRoot);

      // Assert
      assert.equal(result, path.join("skill-tests", "my-skill", "fixtures", "base"));
    });
  });

  describe("when given null input should return null", () => {
    it("should return null", () => {
      // Act
      const result = resolveFixturePath(null, "/some/dir", "/root");

      // Assert
      assert.equal(result, null);
    });
  });
});
