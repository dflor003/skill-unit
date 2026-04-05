#!/usr/bin/env node
"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

process.env.NO_COLOR = "1";
delete process.env.FORCE_COLOR;

const { MdStream } = require("../../skills/skill-unit/scripts/logger");

describe("MdStream", () => {
  function createFakeStream() {
    const chunks = [];
    return {
      stream: { isTTY: false, write(data) { chunks.push(data); } },
      chunks,
    };
  }

  describe("when writing complete lines", () => {
    it("should emit each line immediately", () => {
      // Arrange
      const { stream, chunks } = createFakeStream();
      const md = new MdStream(stream);

      // Act
      md.write("line one\nline two\n");
      md.end();

      // Assert
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0], "line one\n");
      assert.equal(chunks[1], "line two\n");
    });
  });

  describe("when writing partial lines across chunks", () => {
    it("should buffer and emit once the line is complete", () => {
      // Arrange
      const { stream, chunks } = createFakeStream();
      const md = new MdStream(stream);

      // Act
      md.write("partial ");
      const chunksAfterPartial = chunks.length;
      md.write("line\ncomplete\n");

      // Assert
      assert.equal(chunksAfterPartial, 0);
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0], "partial line\n");
      assert.equal(chunks[1], "complete\n");
    });
  });

  describe("when end() is called with buffered content", () => {
    it("should flush the remaining buffer", () => {
      // Arrange
      const { stream, chunks } = createFakeStream();
      const md = new MdStream(stream);

      // Act
      md.write("no trailing newline");
      md.end();

      // Assert
      assert.equal(chunks.length, 1);
      assert.equal(chunks[0], "no trailing newline\n");
    });
  });

  describe("when content spans a code block across chunks", () => {
    it("should track code block state across chunk boundaries", () => {
      // Arrange
      const { stream, chunks } = createFakeStream();
      const md = new MdStream(stream);

      // Act
      md.write("```js\n");
      md.write("const x = 1;\n");
      md.write("```\n");
      md.end();

      // Assert
      assert.equal(chunks.length, 3);
      assert.ok(chunks[1].includes("const x = 1;"));
    });
  });

  describe("when end() is called multiple times should be idempotent", () => {
    it("should not emit duplicate content", () => {
      // Arrange
      const { stream, chunks } = createFakeStream();
      const md = new MdStream(stream);

      // Act
      md.write("text\n");
      md.end();
      md.end();

      // Assert
      assert.equal(chunks.length, 1);
    });
  });
});
