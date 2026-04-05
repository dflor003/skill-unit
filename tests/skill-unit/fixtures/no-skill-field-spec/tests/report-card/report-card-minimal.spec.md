---
name: report-card-minimal
tags: [happy-path]
global-fixtures: ./fixtures/basic-class
---

### RCM-1: Produces Grade Report

Verifies the skill generates a formatted grade report from student data.

**Prompt:**
> Summarize the class grades

**Expectations:**
- Output contains a markdown table with student names and grades
- A class average is included
