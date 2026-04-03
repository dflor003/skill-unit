---
name: alpha
description: A simple skill that formats markdown tables from CSV input
---

# Alpha

Formats CSV data into clean markdown tables.

## Invocation

- **Slash command:** `/alpha`
- **Natural language:** "format this as a table", "make a table from this CSV"

## Behavior

1. Read CSV input from the user's message or a specified file.
2. Parse headers and rows.
3. Output a markdown table.

## Constraints

- Maximum 100 rows.
- If headers are missing, use column indices (Col1, Col2, etc.).
