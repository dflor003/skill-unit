---
name: skill-unit-self-tests
skill: skill-unit
tags: [self-test, end-to-end]
global-fixtures: ./fixtures/report-card
---

### SU-1: discovers-and-runs-spec-file

**Prompt:**
> Run the skill tests

**Expectations:**
- The agent discovered tests/report-card/report-card.spec.md
- The agent executed test prompts via the configured CLI runner
- The agent produced a results summary with pass/fail counts
- A timestamped results file was written to tests/report-card/results/

**Negative Expectations:**
- The agent did not skip any test cases in the spec file
- The agent did not fabricate test results without executing prompts

---

### SU-2: correct-results-format

**Prompt:**
> Run the skill tests and show me the results

**Expectations:**
- The results summary groups output by folder path (tests/report-card/)
- The results summary shows the spec file name (report-card.spec.md)
- Each test case is listed with its ID and name
- Passing tests show expectation counts
- The summary includes total passed and total failed counts

**Negative Expectations:**
- The results are not presented as raw unformatted text
- The agent did not omit the folder structure from the output

---

### SU-3: grades-expectations-accurately

**Prompt:**
> Test my skills

**Expectations:**
- The agent graded each expectation individually as pass or fail
- Failed expectations include a specific reason describing the mismatch
- A test case with all expectations met is marked as PASS
- A test case with any expectation not met is marked as FAIL

**Negative Expectations:**
- The agent did not mark all tests as passing without evaluating them
- The agent did not skip grading negative expectations

---

### SU-4: writes-timestamped-results-file

**Prompt:**
> Evaluate the skill tests

**Expectations:**
- A results file was written to tests/report-card/results/
- The results file name starts with a timestamp in YYYY-MM-DD-HH-MM-SS format
- The results file contains a header with the spec file name and timestamp
- The results file contains a section for each test case with PASS or FAIL verdict
- Each expectation in the results file is marked with a check or cross symbol

**Negative Expectations:**
- The agent did not write results to a location other than the results/ subfolder
- The results file name does not lack a timestamp prefix
