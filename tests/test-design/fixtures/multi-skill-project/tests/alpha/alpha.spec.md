---
name: alpha-tests
skill: alpha
tags: [slash-command]
---

### A-1: basic-csv-formatting

**Prompt:**
> turn this into a table: name,age\nAlice,30\nBob,25

**Expectations:**
- Output contains a markdown table
- Table has headers "name" and "age"
- Table contains two data rows
