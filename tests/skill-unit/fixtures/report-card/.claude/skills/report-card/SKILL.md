---
name: report-card
description: This skill should be used when the user asks to "summarize grades", "show me the class report", "generate a report card", "how are the students doing", or mentions student grades, class performance, or grade summaries. It reads a students.json file and produces a formatted grade report.
---

# Report Card Generator

Read a `students.json` file from the current directory and produce a formatted grade summary.

## Process

1. Read `students.json` from the current working directory.
2. For each student, calculate their average grade from the `grades` array (round to 1 decimal place).
3. Assign a letter grade based on the average:
   - 97-100: A+
   - 93-96: A
   - 90-92: A-
   - 87-89: B+
   - 83-86: B
   - 80-82: B-
   - 77-79: C+
   - 73-76: C
   - 70-72: C-
   - 67-69: D+
   - 63-66: D
   - 60-62: D-
   - Below 60: F
4. Calculate the overall class average (round to 1 decimal place).
5. Present the results in this exact format:

```
## {class name}

| Student | Average | Grade |
|---------|---------|-------|
| {name}  | {avg}   | {letter} |

Class average: {class_avg}
```

## Rules

- Sort students alphabetically by name.
- Always use exactly 1 decimal place for averages (e.g., 92.0, not 92).
- If `students.json` does not exist, inform the user that no student data was found.
- Do not create or modify any files. This skill is read-only.
