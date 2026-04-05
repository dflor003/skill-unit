---
paths: "tests/**"
---

# Unit Test Conventions

Unit tests use Node.js built-in `node:test` and `node:assert/strict`. No external test dependencies.

## File Organization

### One top-level describe per file

Each test file must have exactly one top-level `describe` block. If you need multiple top-level describes, split them into separate files.

### Group by module via folders

Tests are organized into folders matching the module they test:

```
tests/
  helpers.js                   # shared utilities (not a test file)
  cli/                         # CLI subcommand tests
    cli.spec.js                #   describe("cli", ...)
    ls.spec.js                 #   describe("cli ls", ...)
    test.spec.js               #   describe("cli test", ...)
    compile.spec.js            #   describe("cli compile", ...)
  compiler/                    # compiler.js function tests
    parse-yaml.spec.js         #   describe("parseYaml", ...)
    parse-spec.spec.js         #   describe("parseFrontmatter", ...)
    parse-test-cases.spec.js   #   describe("parseTestCases", ...)
    resolve-tools.spec.js      #   describe("resolveToolPermissions", ...)
    ...
  logger/                      # logger.js function tests
    logger.spec.js             #   describe("createLogger", ...)
    format-md.spec.js          #   describe("formatMd", ...)
    ...
```

Name the file after the thing being tested. Name the folder after the module.

### Shared helpers

Put reusable test utilities (e.g., CLI runner, fake stream factory) in `tests/helpers.js`. This file is not a test file and has no `describe` blocks.

## Test Structure

### Arrange/Act/Assert

Every test body must use explicit `// Arrange`, `// Act`, and `// Assert` comment blocks. Omit `// Arrange` only when there is no setup (e.g., testing a null input).

```js
it("should return the resolved path", () => {
  // Arrange
  const input = "./fixtures/base";
  const specDir = path.resolve("skill-tests/my-skill");

  // Act
  const result = resolveFixturePath(input, specDir, process.cwd());

  // Assert
  assert.equal(result, path.join("skill-tests", "my-skill", "fixtures", "base"));
});
```

### Naming: when/should

Test names follow the pattern `when <condition> should <expectation>`.

- The top-level `describe` names the thing being tested.
- Nested `describe` blocks state the condition (`when ...`).
- `it` blocks state what should happen (`should ...`).

The hierarchy reads as a sentence: `parseYaml > when parsing inline lists > should parse comma-separated items`.

```js
describe("parseYaml", () => {
  describe("when parsing inline lists", () => {
    it("should parse comma-separated items", () => { ... });
    it("should parse an empty list", () => { ... });
  });
});
```

### Inlining single-test describes

When a `describe("when ...")` block contains a single `it`, the condition can be merged into the describe name to reduce nesting:

```js
// Instead of this:
describe("when given null input", () => {
  it("should return null", () => { ... });
});

// Do this:
describe("when given null input should return null", () => {
  it("should return null", () => { ... });
});
```

### Nesting and beforeEach

Use nested `describe` blocks with `beforeEach` when multiple tests share setup. The `beforeEach` composes across nesting levels.

```js
describe("cli ls", () => {
  describe("when filtered by tag", () => {
    it("should show only specs matching the tag", () => { ... });
  });

  describe("when filtered by multiple names", () => {
    it("should show all matching specs", () => { ... });
  });
});
```

## Running Tests

```bash
npm test              # runs all unit tests
npm run test:skills   # runs skill-level integration tests (costs tokens)
```
