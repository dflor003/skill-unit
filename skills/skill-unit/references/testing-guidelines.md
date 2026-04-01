# Skill Testing Guidelines

Best practices for writing skill test cases with skill-unit. These guidelines apply whether you are writing tests by hand or generating them with AI assistance.

---

## Activation Testing

Skills with auto-activation triggers must be tested for both correct activation and correct non-activation.

**Positive activation test:** A realistic prompt that a real user might type should trigger the skill. The expectation confirms the skill's behavior was observed in the response.

**Negative activation test:** A prompt adjacent to the skill's domain — superficially similar but intentionally out of scope — should NOT trigger the skill, or should trigger a graceful decline. This confirms the activation boundary is correctly defined.

**Minimum requirement:** At least one positive activation test and at least one negative activation test per skill suite.

Example: A `commit` skill should activate on "commit my changes" but not activate on "what does my last commit say?"

---

## Prompt Realism

The test-executor subagent has no knowledge it is being tested. Its behavior accurately reflects how the skill performs for real users only if the prompts resemble what real users actually send.

**Write from the human perspective.** The prompt is what the user typed, not a test specification. It should read as a genuine user request — incomplete, informal, and free of implementation vocabulary.

**Do not include skill names.** A prompt that says "use the commit skill" is testing keyword matching, not intent recognition. Real users do not know skill names.

**Do not include tool names or hints.** Prompts like "run git commit for me" reveal implementation details a user would not provide. The skill should infer the right action from intent.

**Do not lead the subagent toward the expected answer.** If the prompt implies what should happen, you are measuring whether the subagent follows instructions, not whether the skill works.

**Include natural language variation.** Across test cases, vary phrasing. Include typos, abbreviations, and casual requests. This validates robustness across the full range of realistic user input.

Good prompts:
- "commit my stuff"
- "make a commit pls"
- "hey can you commit the changes i made"

Avoid:
- "Please use the git commit command to commit the staged files with a descriptive message"
- "Run the commit skill on my changes"

---

## Slash Command Coverage

Skills invokable via slash command must cover three invocation patterns:

1. **Bare command:** `/skill-name` with no arguments. The skill must handle the absence of arguments gracefully — either by inferring intent from context or by asking a clarifying question.

2. **With arguments:** `/skill-name some argument`. Cover typical argument patterns and verify the skill correctly applies the argument.

3. **Edge cases:** Empty arguments, unexpected argument types, arguments that conflict with repo state. Verify the skill handles these without crashing or producing incorrect output.

---

## Behavioral Coverage

A complete test suite covers four behavioral regions:

**Happy paths:** The skill is invoked in ideal conditions with well-formed input. Confirm the expected outcome is produced correctly.

**Failure modes:** The skill is invoked when something is wrong — a missing file, bad input, conflicting repository state, or unavailable dependency. Confirm the skill detects the problem and responds appropriately (informing the user, declining gracefully, or recovering).

**Boundary conditions:** Tests at the edges of the skill's scope. What happens with an empty repository? With a file that is at the maximum size? With a prompt that is just barely inside (or just barely outside) the skill's domain?

**Graceful decline:** At least one test where the user asks for something adjacent to but outside the skill's purpose. The skill should decline clearly and helpfully rather than attempting something it was not designed for.

---

## Expectation Quality

Expectations are evaluated by a grader subagent reading the test-executor's response. Well-written expectations give the grader clear, objective criteria.

**Describe observable outcomes, not implementation details.**

The grader cannot see which tools were called — it reads the response. Write expectations that can be confirmed from the response text and observable side effects.

Good: "Commit message references the nature of the changes"
Avoid: "Called `git commit -m` with a non-empty string"

**Make each expectation independently verifiable.**

Each bullet should check exactly one observable condition. Combined expectations hide which condition failed when the test does not pass.

Good:
```
- Commit was created successfully
- Commit message is descriptive and non-generic
```

Avoid:
```
- Commit was created with a descriptive, non-generic message
```

**Prefer behavioral assertions over tool-call assertions.**

The grader evaluates behavior. Tool-call assertions ("ran `git commit`") are implementation detail and fragile. Behavioral assertions ("a new commit appears in git log") are what the user actually cares about and what the grader can reliably verify.

**Negative expectations should be specific.**

"Did not push" is clear. "Did not do anything bad" is not gradeable. Each negative expectation should name the specific behavior that must not have occurred.

---

## Idempotency

Running the same prompt against the same repository state twice should produce consistent results. If a test passes on one run and fails on the next with no changes to the skill or the repo, the test is measuring noise rather than skill behavior.

Write prompts and fixture states that produce deterministic behavior. Avoid prompts that depend on external state (current time, network resources, randomness) unless the skill explicitly handles non-determinism.

If a skill produces correct but non-deterministic output (e.g., varied phrasing), write expectations that describe the invariant properties rather than the exact text.

---

## Interaction Style

Some skills are defined by how they interact — a skill that should always ask a clarifying question before acting, or one that should always respond in a specific format. Test these behavioral contracts explicitly.

**Tone:** If the skill has a defined tone (concise, detailed, formal, casual), include expectations that verify the tone was maintained.

**Format:** If the skill should produce output in a specific format (markdown list, numbered steps, code block), include a format expectation.

**Clarifying questions:** If the skill should ask a clarifying question when input is ambiguous, include a test with an ambiguous prompt and an expectation that a clarifying question was asked before action was taken. Include a complementary test with unambiguous input confirming the skill does NOT ask an unnecessary clarifying question.

---

## Context Sensitivity

Skills that adapt to project state should be tested across different contexts.

**Empty vs. populated repository:** A skill that summarizes changes behaves differently on an empty repo than one with 50 commits. Test both.

**Different languages or frameworks:** A code-generation skill should be tested with TypeScript projects, Python projects, and projects with no identifiable language — each context may produce different behavior.

**Different team configurations:** Skills that read or write configuration files should be tested with the config present, with the config absent, and with a malformed config.

Cover the contexts that are most likely to surface bugs or inconsistent behavior, not just the ideal scenario.

---

## Test Suite Organization

**Group by skill.** Place all spec files for a skill in a subdirectory named after the skill (e.g., `tests/commit/`). This keeps related tests together and makes targeted runs easier.

**Use consistent ID prefixes.** All test cases in a spec file should share a prefix derived from the skill or file name. This makes results output scannable and prevents ID collisions across suites.

Convention: `SKILLPREFIX-N` (e.g., `COM-1`, `COM-2`, `BRN-1`).

**Keep spec files focused.** One spec file should test one aspect of a skill (activation, slash command usage, failure modes). Large monolithic spec files are harder to maintain and produce noisy failure output.

**Use fixtures for filesystem state.** Do not rely on the current repo state for tests that require specific files. Declare a fixture folder in frontmatter. This makes tests portable and reproducible across machines and CI environments.

**Check results files into the repo.** Timestamped results files are the historical record of skill behavior. Committing them enables regression tracking via `git log` and PR diffs.

---

## Minimum Coverage Requirements

Every skill test suite must include at least:

| Requirement | Description |
|-------------|-------------|
| One happy-path test | The skill works correctly under normal conditions |
| One failure-mode test | The skill handles an error or bad input gracefully |
| One activation test | A realistic prompt triggers the skill |
| One negative-activation test | An adjacent prompt does NOT trigger the skill |
| One graceful-decline test | The skill declines a request outside its scope clearly and helpfully |

These five tests form the minimum viable coverage for a skill. Additional tests for boundary conditions, slash command variants, interaction style, and context sensitivity are strongly recommended.
