#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { formatTimestamp } = require("../../skills/skill-unit/scripts/compiler");

describe("formatTimestamp", () => {
  describe("when given a date should format as YYYY-MM-DD-HH-MM-SS", () => {
    it("should produce the correct formatted string", () => {
      // Arrange
      const d = new Date(2026, 3, 5, 14, 30, 15); // April 5, 2026 14:30:15

      // Act
      const result = formatTimestamp(d);

      // Assert
      assert.equal(result, "2026-04-05-14-30-15");
    });

    it("should zero-pad single-digit values", () => {
      // Arrange
      const d = new Date(2026, 0, 1, 1, 2, 3); // Jan 1, 2026 01:02:03

      // Act
      const result = formatTimestamp(d);

      // Assert
      assert.equal(result, "2026-01-01-01-02-03");
    });
  });
});
