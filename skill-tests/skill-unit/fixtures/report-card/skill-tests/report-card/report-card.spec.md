---
name: report-card-tests
skill: report-card
tags: [happy-path, fixtures]
global-fixtures: ./fixtures/basic-class
---

### RC-1: Generates a Grade Report From Student Data

Verifies that the skill reads student data and produces a formatted grade summary with averages and letter grades.

**Prompt:**

> How are the students doing?

**Expectations:**

- Output contains a markdown table with student names, averages, and letter grades
- Students are sorted alphabetically by name
- Averages are shown with one decimal place
- A class average is included

**Negative Expectations:**

- Does not create or modify any files
- Does not fabricate student data that is not in the input
