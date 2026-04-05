#!/usr/bin/env node
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.NO_COLOR = "1";
delete process.env.FORCE_COLOR;

const logger = require("../../skills/skill-unit/scripts/logger");

describe("setLevel", () => {
  beforeEach(() => {
    logger.setLevel("info");
  });

  describe("when given valid level names should not throw", () => {
    it("should accept all valid levels", () => {
      // Act & Assert (no throw)
      logger.setLevel("debug");
      logger.setLevel("verbose");
      logger.setLevel("info");
      logger.setLevel("success");
      logger.setLevel("warn");
      logger.setLevel("error");
    });
  });

  describe("when given an invalid level should fall back to info", () => {
    it("should not throw", () => {
      // Act & Assert (no throw)
      logger.setLevel("nonsense");
    });
  });
});
