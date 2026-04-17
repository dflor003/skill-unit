---
paths: 'tests/**'
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
it('should return the resolved path', () => {
  // Arrange
  const input = './fixtures/base';
  const specDir = path.resolve('skill-tests/my-skill');

  // Act
  const result = resolveFixturePath(input, specDir, process.cwd());

  // Assert
  assert.equal(
    result,
    path.join('skill-tests', 'my-skill', 'fixtures', 'base')
  );
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

## Ink TUI Tests: avoid stale-closure flakes

ink's `useInput` hook re-binds its event listener inside a `useEffect` whose deps include the user's handler closure. After a state update, React commits the new render BEFORE the effect re-binds the listener with the up-to-date closure. The rendered frame can show new state while the input listener still holds a stale closure. CI loses this race more often than local machines, producing flakes that look impossible.

Symptom: a test sends two `stdin.write` calls with `vi.waitFor(() => expect(lastFrame()).toContain(...))` between them, the frame assertion passes, but the second keystroke seems to do nothing.

```tsx
stdin.write('A');
await vi.waitFor(() => expect(lastFrame()).toContain('(2 selected)'));
stdin.write('\r'); // may fire stale listener whose `selected` is still empty
```

**Fix in production code, not just the test.** Read state through refs inside the `useInput` callback so the handler is correct even on the stale subscriber. This also makes the handler robust to fast keypresses in real use (paste, autorepeat).

```tsx
const selectedRef = useRef(selected);
selectedRef.current = selected;

useInput((input, key) => {
  const selected = selectedRef.current; // always current
  // ...
});
```

If you can't change the component (third-party, etc.), let the effect flush in the test:

```tsx
await vi.waitFor(() => expect(lastFrame()).toContain('(2 selected)'));
await new Promise((resolve) => setImmediate(resolve)); // let useInput re-bind
stdin.write('\r');
```
