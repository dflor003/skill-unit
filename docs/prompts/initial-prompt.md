# Skill Unit - Skill Unit Testing Framework

Help me brainstorm and expand on an idea I had around building a structured, skill "unit testing" framework. There's a few of these kinds of skill "evaluators" floating around, but the problem I'm seeing is that most of them aren't that well-defined and (more importantly) reproducible. They often give vague descriptions of how you would do skill evaluation but I haven't found something that is consistently reproducible across any project that would give you quick and easy feedback when evaluating a skill. The first thing you should do is go online and search through any existing solutions that work the way I will describe below.

## Goals

- **Reproducibility:** We want this to be as easy as installing a unit testing framework like NUnit, JUnit, or Jest. There should be well-defined folders for test cases in a well-defined format to the point that anyone that's written a unit test in any language across should be able to jump in and write tests for any repo with claude skills without feeling lost. This is the number one goal.
- ***Quick Feedback:** We want to be able to run these tests and get feedback quickly as we evolve skills. This also implies that we should be able to support CI/CD scenarios out of the box without a whole lot of extra ceremony.
- **Prompt as the Source of Truth:** We want the prompt to be the source of truth for how the skill should behave. Test cases should be in the form of a prompt and expected output and artifacts. There may be several such prompt files for different scenarios or different aspects of the skill. In larger plugin marketplaces, there may be many such prompt files for different skills or agents in the marketplace.
- **Artifact Validation:** We want to be able to validate not just the output of the skill but also any artifacts it produces. This could include files, API calls, or other side effects. The testing framework should allow us to define expected artifacts and validate them against the actual artifacts produced during the test.
- **Setup/Teardown Support:** Most testing frameworks support setup and teardown functions to prepare the environment for testing and clean up afterward. We should allow this in the form of scripts that can be run before and after tests to set up any necessary state or clean up artifacts.

## Key Concepts

Here's a few things we need to incorporate into this framework:

- **Test Cases:** Each test case should be defined in a structured format. Lets discuss the pros and cons of various formats, but I'm leaning towards some kind of `*.spec.md` file that contains the prompt, expected outputs, and any expected artifacts. This keeps everything in one place and is easy to read and write.
- **Test Runner:** These tests should be runnable through a top-level "evaluator" agent that delegates to subagents to run the actual test cases. The evaluator agent's job is to discover all the test cases, see which ones apply to the scenario that the user wants to test (i.e. testing one skill vs running the entire suite, etc.), and then use a parallel subagent execution loop that passes the prompts down and waits for the results to come back. The evaluator agent can then aggregate the results and provide feedback to the user as to whether the subagent achieved the correct results or not.
- **Anti-bias layer:** The main reason to keep the evaluator separate from the subagent actually executing the prompt is to ensure that it's not aware of the fact that it's being evaluated or the expected output. We should take precautions to ensure that the subagent executing the prompt doesn't have access to the expected output or any information about the test case that could bias its response. This way, we can get a more accurate assessment of how well the skill performs under realistic conditions. We should have several guards in place to ensure this. Let's brainstorm the best way to do this. If a subagent call can restrict file access directly from the top-level evaluator, that would be ideal.
- **Structured Output:** The test results should be presented in a structured format that clearly indicates which tests passed and which failed, along with any relevant details about the failures and this format should be configurable depending on the use case. For CI, for example, maybe a JSON output is better or even an output that conforms to some existing standard. For a user running these inside a chat session, the output should be more human-readable and conversational.
- **Extensibility:** The framework should be designed in a way that allows for easy extension and customization. Users should be able to tweak the various input and output formats using some checked-in configuration file like `.skill-unit.yaml`. If we want to, for example, tweak the output format, there could be a prompt in `.skill-unit.yaml` that defines how the output should be structured and the evaluator agent can use that prompt to format the results accordingly.
- **PDD - Prompt Driven Development:** This framework should support a PDD workflow where users can write their test cases (prompts and expected outputs) before they even implement the skill. This way, the tests can serve as a form of documentation and a clear specification for how the skill should behave, which can guide the development process.
- **AI Assisted Test Case Generation:** We MUST also support AI-assisted test case generation where users can provide a high-level description of the scenarios they want to test and the framework can generate the corresponding prompts, expected outputs, and artifact validations automatically. This can help users get started quickly and ensure that they have comprehensive test coverage for their skills.
- **Skill Coverage:** We should include some way of evaluating the skill coverage of the test cases via an AI agent chat and identifying any gaps and additional prompts that should be added to the test suite to ensure comprehensive coverage of the skill's functionality. 

## Proposed Folder Structure

Here's a proposed folder structure for the skill unit testing framework:

```
/skill-tests/
  /.setup/
    setup.sh
    teardown.sh
  /<skill-1>/
    # By default we should recommend naming test cases by skill
    test-case-1.spec.md
    test-case-2.spec.md
  /sub-folder-1/<skill-2>/
    # Grouping by some top-level folder should be supported as well
    test-case-1.spec.md
  /sub-folder-2/<skill-3>/
    /some-folder
      # Any arbitrary grouping should be supported as well
      test-case-1.spec.md
```

**IMPORTANT:** The folder structure SHOULD NOT live side by side with the skill because then it may be discovered by the subagent while executing the prompt and can bias the output.

Users should be able to configure the testing framework to look for test cases in different folders or with different naming conventions, but this is a good default structure that we can recommend.

## Test Case Format

Let's discuss the most effective format for defining test cases. I'm leaning towards a markdown format (`*.spec.md`) that allows us to clearly separate the different components of the test case (prompt, expected output, expected artifacts) while still being easy to read and write.

## Skill Testing Guidelines

We must bake some skill testing guidelines into the framework to help support AI-assisted test case generation. These guidelines should include things like the following:

- For skills that can be automatically activated by the AI agent, the skill test case suite MUST include at least one test case that tests the skill activation AND there MUST be at least one test case that tests that the skill **does not** activate when it's not supposed to.
- Test cases should always be written from the human perspective. Users are vague and often don't specify all the details in their prompts, so the test cases should reflect that and not include any information that a user wouldn't reasonably include in a real prompt.
- Test cases MUST NOT lead a subagent to the correct answer. They should be designed in a way that allows for a variety of possible outputs, some of which may be correct and some of which may not be, to ensure that the skill is robust and can handle a wide range of inputs.
- For skills that can be invoked via slash command, there MUST be test cases for all of the different ways a user can invoke the slash command, including any variations in the command syntax or parameters.
- For skills that produce artifacts, there MUST be test cases that validate the artifacts produced by the skill, including cases where the skill produces incorrect or malformed artifacts to ensure that the validation logic is robust.

These are just a few guidelines I've brainstormed myself. Help me expand on this list.