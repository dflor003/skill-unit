---
name: csv
description: Use when the user asks to "format as a table", "make a table from CSV", "convert CSV to markdown", or provides CSV data and wants it formatted. Triggers on any request to transform comma-separated or delimited data into a readable table.
---

# CSV Formatter

Formats CSV data into clean markdown tables.

## Behavior

1. Read CSV input from the user's message or a specified file.
2. Parse headers and rows.
3. Output a markdown table.

## Constraints

- Maximum 100 rows.
- If headers are missing, use column indices (Col1, Col2, etc.).