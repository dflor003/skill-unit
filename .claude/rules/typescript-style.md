---
paths: "**/*.ts, **/*.tsx"
---

# TypeScript Style Rules

## No inline type imports

Do not use `import('module').Type` syntax for type annotations. Use a top-level `import type` statement instead.

```typescript
// Wrong
let proc: import('node:child_process').ChildProcess | null = null;
function foo(config: import('./types').Config): void {}

// Correct
import type { ChildProcess } from 'node:child_process';
import type { Config } from './types';

let proc: ChildProcess | null = null;
function foo(config: Config): void {}
```

If the module is already imported for a value (e.g., `spawn`), add the type to the same import using `import { spawn, type ChildProcess } from 'node:child_process'`.
