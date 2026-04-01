---
name: skill-unit-spec-parsing
skill: skill-unit
tags: [self-test, parsing]
---

### SU-1: activation-via-slash-command

**Prompt:**
> /skill-unit

**Expectations:**
- The skill-unit skill activated
- The agent attempted to discover and run test spec files
- The agent presented results or indicated no tests were found

---

### SU-2: activation-via-natural-language

**Prompt:**
> Can you test my skills for me?

**Expectations:**
- The skill-unit skill activated
- The agent attempted to discover test spec files

**Negative Expectations:**
- The agent did not ask what programming language to use
- The agent did not try to write unit tests in a programming language

---

### SU-3: negative-activation

**Prompt:**
> Write a unit test for my login function in Jest

**Expectations:**
- The agent treated this as a standard coding request
- The agent attempted to write JavaScript/TypeScript tests

**Negative Expectations:**
- The skill-unit skill did not activate
- The agent did not look for spec.md files

---

### SU-4: handles-no-tests-found

**Prompt:**
> Run the skill tests in the empty-project directory

**Expectations:**
- The agent reported that no test spec files were found
- The agent suggested how to create test spec files or run the setup script

**Negative Expectations:**
- The agent did not crash or error out
- The agent did not fabricate test results
