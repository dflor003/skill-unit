#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.NO_COLOR = "1";
delete process.env.FORCE_COLOR;

const { formatMd } = require("../../skills/skill-unit/scripts/logger");

describe("formatMd", () => {
  describe("when NO_COLOR is set should return text unchanged", () => {
    it("should preserve all markdown syntax as-is", () => {
      // Arrange
      const input = "# Heading\n\n**bold** and `code`\n\n- bullet";

      // Act
      const result = formatMd(input);

      // Assert
      assert.equal(result, input);
    });
  });

  describe("when formatting content with code blocks", () => {
    it("should preserve content inside code blocks", () => {
      // Arrange
      const input = "Before\n\n```js\nconst x = 1;\n```\n\nAfter";

      // Act
      const result = formatMd(input);

      // Assert
      assert.ok(result.includes("const x = 1;"));
      assert.ok(result.includes("Before"));
      assert.ok(result.includes("After"));
    });

    it("should not format inline markers inside code blocks", () => {
      // Arrange
      const input = "```\n**not bold** and `not code`\n```";

      // Act
      const result = formatMd(input);

      // Assert
      assert.ok(result.includes("**not bold**"));
      assert.ok(result.includes("`not code`"));
    });
  });

  describe("when given empty input should return empty string", () => {
    it("should return an empty string", () => {
      // Act
      const result = formatMd("");

      // Assert
      assert.equal(result, "");
    });
  });

  describe("when formatting headings should preserve all heading levels", () => {
    it("should keep H1, H2, and H3 content", () => {
      // Arrange
      const input = "# H1\n## H2\n### H3";

      // Act
      const result = formatMd(input);

      // Assert
      assert.ok(result.includes("# H1"));
      assert.ok(result.includes("## H2"));
      assert.ok(result.includes("### H3"));
    });
  });
});
