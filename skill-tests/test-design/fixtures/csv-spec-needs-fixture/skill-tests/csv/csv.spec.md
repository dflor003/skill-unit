---
name: csv-tests
skill: csv
tags: [happy-path]
---

### CSV-1: Basic Table Formatting

Verifies that the skill can convert simple CSV input into a markdown table.

**Prompt:**

> can you turn this into a table? name,age Alice,30 Bob,25

**Expectations:**

- Output contains a markdown table
- Table has two data rows

---

### CSV-2: Respects the 100-Row Cap

Verifies that the skill honors its documented 100-row limit and does not produce tables larger than that when given more input than the cap allows.

**Fixtures:**

- ./fixtures/sample-data

**Prompt:**

> here's the data, can you tabulate it?

**Expectations:**

- Output table has at most 100 data rows
- The agent acknowledges when the input exceeds the cap
