#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runCli } = require("../helpers");

describe("cli", () => {
  describe("when invoked with no arguments", () => {
    it("should print help and exit 0", () => {
      // Act
      const { stdout, exitCode } = runCli();

      // Assert
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes("skill-unit"));
      assert.ok(stdout.includes("test"));
      assert.ok(stdout.includes("compile"));
      assert.ok(stdout.includes("ls"));
      assert.ok(stdout.includes("report"));
    });
  });

  describe("when invoked with an unknown command should exit with error", () => {
    it("should exit with code 1", () => {
      // Act
      const { exitCode } = runCli("bogus");

      // Assert
      assert.equal(exitCode, 1);
    });
  });
});
