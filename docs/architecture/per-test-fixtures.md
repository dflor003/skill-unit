# Per-Test Fixtures

## Overview

Test cases within a single spec file often need different filesystem states. Previously, fixtures were declared once in the spec frontmatter and applied identically to every test case. This made it impossible to test multiple scenarios (e.g., "skill exists with no tests" vs. "skill exists with existing tests") within the same spec file without splitting into separate files.

Per-test fixtures solve this by allowing individual test cases to declare additional fixture paths that layer on top of the global fixture.

## How It Works

### Frontmatter: `global-fixtures`

The frontmatter field was renamed from `fixtures` to `global-fixtures` to clarify its scope. It defines the base fixture copied into every test case's workspace.

```yaml
---
name: my-tests
skill: my-skill
global-fixtures: ./fixtures/base-project
---
```

### Per-test: `**Fixtures:**` section

Individual test cases can declare an optional `**Fixtures:**` section containing a bullet list of fixture paths. These are copied into the workspace after the global fixture, in list order.

```markdown
### TC-2: Detects Existing Config

Purpose statement...

**Fixtures:**

- ./fixtures/existing-config

**Prompt:**

> ...
```

### Copy order

1. Global fixture copied first (establishes the base state)
2. Per-test fixtures copied in list order on top of the global fixture
3. Per-test fixtures can add new files or override files from the global fixture

If a test case has no `**Fixtures:**` section, it uses only the global fixture. If there is no global fixture either, the workspace starts empty.

## Manifest Format

The manifest JSON was updated to support this:

- `fixture-path` renamed to `global-fixture-path` (with legacy `fixture-path` fallback in the runner)
- Each test case object can include an optional `fixture-paths` array of resolved paths

```json
{
  "global-fixture-path": "skill-tests/my-skill/fixtures/base-project",
  "test-cases": [
    { "id": "TC-1", "prompt": "..." },
    {
      "id": "TC-2",
      "prompt": "...",
      "fixture-paths": ["skill-tests/my-skill/fixtures/existing-config"]
    }
  ]
}
```

## Runner Changes

The runner (`src/core/runner.ts`) creates each workspace by:

1. Creating the `work/` directory
2. Copying `global-fixture-path` into it (if present)
3. Iterating over the test case's `fixture-paths` array (if present) and copying each on top
4. Logging each layer for debugging

The runner supports legacy manifests that use `fixture-path` instead of `global-fixture-path`.

## Design Decisions

### Why rename `fixtures` to `global-fixtures`?

The original name was ambiguous. When per-test fixtures were introduced, `fixtures` in frontmatter could be confused with test-level fixtures. `global-fixtures` makes the scope explicit: this fixture applies to all tests in the file.

### Why additive layering instead of override?

Per-test fixtures add to the global fixture rather than replacing it. This keeps per-test fixtures small (only the delta) and avoids duplicating the base state across multiple fixture folders. If a test case needs a completely different state, omit the global fixture and put everything in the per-test fixture.

### Why a bullet list instead of a single path?

A test case might need multiple independent fixture layers (e.g., a skill fixture plus a config fixture). A bullet list supports composition without requiring a merged fixture folder.

## Related

- Fixture neutrality rules and test-design-specific decisions are documented in `docs/architecture/test-design.md`.
