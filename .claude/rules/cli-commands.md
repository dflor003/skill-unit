---
paths: 'src/cli/**/*.ts'
---

# CLI Command Rules

## Positional-args detector: keep `knownValues` in sync with string flags

The `test` command in `src/cli/commands/test.ts` collects non-flag entries from `rawArgs` as additional spec-name filters. It excludes values of known string flags via a `knownValues` array.

**When you add a new string-typed arg to `args: { ... }`, you MUST also add `args.<flagName>` to the `knownValues` array.** Otherwise the flag's value is mistaken for a positional spec-name filter and silently matches no specs.

Example failure mode: `--junit test-results/junit.xml` with `--all` ran zero tests and logged `No spec files found matching filters`, because `test-results/junit.xml` was treated as a spec-name filter.

```typescript
// When adding a new flag:
args: {
  // ...
  'my-new-flag': { type: 'string', description: '...' },
},
run({ args, rawArgs }) {
  const knownValues = [
    args.config,
    args.name,
    // ...
    args['my-new-flag'], // <-- add here too
  ].filter(Boolean);
}
```

Boolean flags (`type: 'boolean'`) do not need to be added — they have no value to confuse with a positional arg.
