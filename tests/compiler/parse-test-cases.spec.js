#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseTestCases } = require("../../skills/skill-unit/scripts/compiler");

describe("parseTestCases", () => {
  describe("when parsing a complete test case", () => {
    it("should extract id, name, prompt, expectations, and negative expectations", () => {
      // Arrange
      const body = `
### COM-1: basic commit

**Prompt:**
> Create a commit for the staged changes

**Expectations:**
- Ran git commit
- Commit message is descriptive

**Negative Expectations:**
- Did not run git push
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases.length, 1);
      assert.equal(cases[0].id, "COM-1");
      assert.equal(cases[0].name, "basic commit");
      assert.equal(cases[0].prompt, "Create a commit for the staged changes");
      assert.deepEqual(cases[0].expectations, ["Ran git commit", "Commit message is descriptive"]);
      assert.deepEqual(cases[0]["negative-expectations"], ["Did not run git push"]);
    });
  });

  describe("when parsing multiple test cases", () => {
    it("should split on ### headings and parse each independently", () => {
      // Arrange
      const body = `
### TC-1: first test

**Prompt:**
> Do the first thing

**Expectations:**
- First expectation

---

### TC-2: second test

**Prompt:**
> Do the second thing

**Expectations:**
- Second expectation
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases.length, 2);
      assert.equal(cases[0].id, "TC-1");
      assert.equal(cases[1].id, "TC-2");
    });
  });

  describe("when test case has per-test fixtures", () => {
    it("should include fixture-paths array", () => {
      // Arrange
      const body = `
### TD-2: fixture test

**Fixtures:**
- ./fixtures/existing-spec
- ./fixtures/extra-data

**Prompt:**
> Work on the tests

**Expectations:**
- Discovers existing spec
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.deepEqual(cases[0]["fixture-paths"], [
        "./fixtures/existing-spec",
        "./fixtures/extra-data",
      ]);
    });
  });

  describe("when test case has no negative expectations should omit the field", () => {
    it("should omit negative-expectations from the result", () => {
      // Arrange
      const body = `
### TC-1: simple

**Prompt:**
> Hello

**Expectations:**
- Says hello back
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases[0]["negative-expectations"], undefined);
    });
  });

  describe("when prompt spans multiple lines", () => {
    it("should join blockquote lines with newlines", () => {
      // Arrange
      const body = `
### TC-1: multi

**Prompt:**
> First line of the prompt.
> Second line of the prompt.

**Expectations:**
- Something
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases[0].prompt, "First line of the prompt.\nSecond line of the prompt.");
    });
  });

  describe("when heading has no colon should skip the section", () => {
    it("should not include it as a test case", () => {
      // Arrange
      const body = `
### Not a test case

Just some text.

### TC-1: real test

**Prompt:**
> Do something

**Expectations:**
- Did it
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases.length, 1);
      assert.equal(cases[0].id, "TC-1");
    });
  });

  describe("when description text appears between heading and sections", () => {
    it("should still parse the prompt and expectations correctly", () => {
      // Arrange
      const body = `
### TD-1: has description

This is a description paragraph explaining the test case.

**Prompt:**
> Do the thing

**Expectations:**
- Did the thing
`;

      // Act
      const cases = parseTestCases(body);

      // Assert
      assert.equal(cases[0].id, "TD-1");
      assert.equal(cases[0].prompt, "Do the thing");
    });
  });
});
