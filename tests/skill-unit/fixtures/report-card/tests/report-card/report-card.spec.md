---
name: report-card-tests
skill: report-card
tags: [happy-path, activation, fixtures]
global-fixtures: ./fixtures/basic-class
---

### RC-1: activation-natural-language

**Prompt:**
> How are the students doing?

**Expectations:**
- The agent read the students.json file
- The output includes a markdown table with Student, Average, and Grade columns
- Alice's average is 91.7
- Bob's average is 72.3
- Charlie's average is 98.3
- The class average is 87.4
- Students are sorted alphabetically (Alice, Bob, Charlie)

**Negative Expectations:**
- The agent did not create or modify any files
- The agent did not make up student names not in the data

---

### RC-2: activation-direct-request

**Prompt:**
> Generate a report card for the class

**Expectations:**
- The agent read the students.json file
- The output contains the class name "Computer Science 101"
- Letter grades are assigned correctly: Alice gets A-, Bob gets C-, Charlie gets A+

**Negative Expectations:**
- The agent did not ask which file to read
- The agent did not write any files

---

### RC-3: negative-activation

**Prompt:**
> Write me a Python function that calculates student grade averages

**Expectations:**
- The agent produced Python code with a function definition
- The code includes logic for calculating averages

**Negative Expectations:**
- The agent did not read students.json
- The agent did not produce a formatted grade report table

---

### RC-4: missing-data

**Prompt:**
> Show me the class grades

**Expectations:**
- The agent attempted to read students.json
- The agent informed the user that no student data was found or the file does not exist

**Negative Expectations:**
- The agent did not fabricate student data
- The agent did not create a students.json file
