#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildManifest, CONFIG_DEFAULTS } = require("../../skills/skill-unit/scripts/compiler");

describe("buildManifest", () => {
  describe("when given a parsed spec with test cases", () => {
    it("should produce a valid manifest without expectations", () => {
      // Arrange
      const spec = {
        path: path.resolve("skill-tests/test-design/test-design.spec.md"),
        frontmatter: {
          name: "test-design-tests",
          skill: "test-design",
          tags: ["slash-command"],
          "global-fixtures": "./fixtures/csv-skill",
        },
        testCases: [
          { id: "TD-1", name: "Test One", prompt: "Do something", expectations: ["Did it"] },
          {
            id: "TD-2",
            name: "Test Two",
            prompt: "Do another thing",
            expectations: ["Did that"],
            "fixture-paths": ["./fixtures/extra"],
          },
        ],
      };

      // Act
      const manifest = buildManifest(spec, CONFIG_DEFAULTS, { timestamp: "2026-04-05-12-00-00" });

      // Assert
      assert.equal(manifest["spec-name"], "test-design-tests");
      assert.equal(manifest.timestamp, "2026-04-05-12-00-00");
      assert.equal(manifest.timeout, "120s");
      assert.equal(manifest.runner.tool, "claude");
      assert.equal(manifest.runner["max-turns"], 10);
      assert.equal(manifest["test-cases"].length, 2);
      assert.equal(manifest["test-cases"][0].id, "TD-1");
      assert.equal(manifest["test-cases"][0].prompt, "Do something");
      assert.ok(!("expectations" in manifest["test-cases"][0]));
      assert.ok(manifest["test-cases"][1]["fixture-paths"]);
    });
  });

  describe("when spec has no name field should fall back to filename", () => {
    it("should use the spec filename without extension as the name", () => {
      // Arrange
      const spec = {
        path: path.resolve("skill-tests/my-skill/my-skill.spec.md"),
        frontmatter: {},
        testCases: [],
      };

      // Act
      const manifest = buildManifest(spec, CONFIG_DEFAULTS, { timestamp: "test" });

      // Assert
      assert.equal(manifest["spec-name"], "my-skill");
    });
  });

  describe("when CLI overrides are provided", () => {
    it("should apply model, timeout, and max-turns overrides", () => {
      // Arrange
      const spec = {
        path: path.resolve("skill-tests/x/x.spec.md"),
        frontmatter: { name: "x" },
        testCases: [],
      };
      const overrides = {
        timestamp: "test",
        modelOverride: "opus",
        timeoutOverride: "60s",
        maxTurnsOverride: 5,
      };

      // Act
      const manifest = buildManifest(spec, CONFIG_DEFAULTS, overrides);

      // Assert
      assert.equal(manifest.runner.model, "opus");
      assert.equal(manifest.timeout, "60s");
      assert.equal(manifest.runner["max-turns"], 5);
    });
  });
});
