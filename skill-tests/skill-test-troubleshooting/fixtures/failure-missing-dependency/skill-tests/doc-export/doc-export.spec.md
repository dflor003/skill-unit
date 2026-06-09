---
name: doc-export-tests
skill: doc-export
tags: [happy-path]
---

### DE-1: Exports Markdown to PDF

The skill should convert a Markdown file to PDF and report the output path.

**Prompt:**

> export notes.md to PDF

**Expectations:**

- Activates the doc-export skill
- Reports the path to a generated PDF

**Negative Expectations:**

- Does not crash with an unhandled error
