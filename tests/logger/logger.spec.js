#!/usr/bin/env node
"use strict";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.NO_COLOR = "1";
delete process.env.FORCE_COLOR;

const logger = require("../../skills/skill-unit/scripts/logger");

describe("createLogger", () => {
  describe("when creating a new logger should return all log level methods", () => {
    it("should have debug, verbose, info, success, warn, and error methods", () => {
      // Act
      const log = logger("test-scope");

      // Assert
      assert.equal(typeof log.debug, "function");
      assert.equal(typeof log.verbose, "function");
      assert.equal(typeof log.info, "function");
      assert.equal(typeof log.success, "function");
      assert.equal(typeof log.warn, "function");
      assert.equal(typeof log.error, "function");
    });
  });
});
