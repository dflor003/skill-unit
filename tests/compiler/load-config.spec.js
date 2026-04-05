#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { loadConfig } = require("../../skills/skill-unit/scripts/compiler");

describe("loadConfig", () => {
  describe("when config file does not exist should return defaults", () => {
    it("should return all default values", () => {
      // Act
      const config = loadConfig("/nonexistent/path/.skill-unit.yml");

      // Assert
      assert.equal(config["test-dir"], "skill-tests");
      assert.equal(config.runner.tool, "claude");
      assert.equal(config.runner["max-turns"], 10);
      assert.equal(config.execution.timeout, "120s");
    });
  });

  describe("when loading the template config", () => {
    it("should merge template values with defaults", () => {
      // Arrange
      const templatePath = path.resolve("skills/skill-unit/templates/.skill-unit.yml");

      // Act
      const config = loadConfig(templatePath);

      // Assert
      assert.equal(config["test-dir"], "skill-tests");
      assert.equal(config.runner.tool, "claude");
      assert.equal(config.runner["max-turns"], 50);
      assert.equal(config.output.format, "interactive");
    });
  });
});
