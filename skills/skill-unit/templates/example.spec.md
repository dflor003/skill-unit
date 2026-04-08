---
name: my-skill-tests
skill: my-skill
tags: [happy-path]
# timeout: 60s
# global-fixtures: ./fixtures/basic-repo
# setup: setup.sh
# teardown: teardown.sh
---

### TEST-1: basic-usage

**Prompt:**

> Replace this with the prompt a real user would send to invoke your skill's core behavior.
> Write it from the user's perspective — vague, natural, no skill names or hints.

**Expectations:**

- Replace this with an observable outcome (e.g., "Response acknowledged the user's request")
- Add more bullets — one independently verifiable outcome per bullet

**Negative Expectations:**

- Did not take an action that would be incorrect or out of scope
- Add more bullets for behaviors that must NOT have occurred

---

### TEST-2: activation-test

**Prompt:**

> Replace this with a realistic prompt that SHOULD trigger your skill.
> It must read like something a real user would type — no skill names, no hints.

**Expectations:**

- Skill activated and performed its intended behavior
- Response demonstrates the skill's core purpose was engaged

**Negative Expectations:**

- Did not ignore the request or respond as if the skill was not loaded

---

### TEST-3: negative-activation-test

**Prompt:**

> Replace this with a prompt that is adjacent to your skill's domain but should NOT trigger it.
> This tests that your skill's activation boundary is correctly defined.

**Expectations:**

- Responded helpfully without invoking the skill's core behavior
- Did not perform the skill's primary action when it was not warranted

**Negative Expectations:**

- Did not incorrectly activate the skill for this out-of-scope request
