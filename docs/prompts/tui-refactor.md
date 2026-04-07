# TUI Refactor

Read through the README.md and some of the plan documents to get context on where we are so far in this project. Initially, the idea was to provide a skill with a workflow that could be used by agents to perform skill testing. Over the past few iterations, we've been moving more and more functionality directly into CLI tooling which is working pretty well now. I think we are at a point now where it makes sense to fully embrace the terminal-first nature of the skill-unit framework and pivot over to a full TUI.

## The Vision

Here's what I'm envisioning for this pivot.

### Dual-Use CLI/TUI Tooling

- Human users should be able to run the CLI tool and be presented with a full TUI that lets them browse through their tests, run individual tests, and keep track of the agent transcripts coming from each parallel execution session
- AI agents should be able to use the CLI as a tool to run test cases on behalf of human users or as part of autonomous skill writing/editing workflows

### Plugin as Companion to CLI

- The `skill-unit` skill becomes a companion tool that gives AI agents the knowledge of how the Skill Unit Framework works and assists agents with how to use it effectively on the user's behalf.
- The `test-design` skill will assist users with the real hard part that the CLI can't handle: proper skill test case design.

## TUI Features

Here's what I want in the human-facing TUI:

### Dashboard/Search

When a user runs `skill-unit` by itself with no parameters, that should start the TUI mode and land on the "Dashboard"

- The initial screen should boot right into a scrollable list view of all the tests in the repo with an auto-focused search box that a user can immediately type into to find the test case they want
- The search should support partial matching on test case names and tags. If a user wants to filter by tag, they should be able to do something like `tag:e2e` and get all the tests tagged as e2e
- There should be a way to run all tests from this dashboard
- There should be a way to select multiple tests and then trigger a run
- Test selection should persist across runs
- From there, we should have some keybinding (maybe Tab?) to be able to swap to other modes listed below

**Important:** This screen is where I envision users will spend the most time so we should focus on a good DevX here

### Run Manager

As tests are run, there should be some way of viewing and managing past runs.

- Initially there will be no runs so there should be some empty state
- Run manager should read from the `.workspace` folder and give you quick access to things like the transcript for a given run, logs, results, etc.
- There should be a cleanup option to clean all but the last X runs (maybe 10?).
- We should embed some stats for each run

### Statistics

Part of the reason for the TUI is to be able to bubble up aggregate test statistics to the user running the tests. I'm not quite sure yet how I want to store these across runs long term, so lets discuss some options, but I think the info will be valuable. We should have aggregate test data as well as as per-test data in here. At a bare minimum I want: 

- Test duration
- Test token cost
- Test dollar cost
- Success rate
- Last time the test was run

### Options Screen

We should have an easy way for users to edit the `.skill-unit.yml` options. This screen would essentially be a TUI over that file

### Test Runner

Once a user selects the tests they want to run, the test runner kicks in. This should be the crown jewel of the whole flow.

Right now, we only support running one spec at a time. In the TUI view, once you kick off a test run, it should show you a multi panel view where you can do the following:

**Progress Tracker Panel:** Keeps track of the overall progress of the run with all the tests that are part of this run in a hierarchical view kind of like in a BDD framework like Jest. The currently running tests should have a spinner and complete tests should have a pass/fail indicator. We should also be able to differentiate tests that are pending, timedout, tests that are currently running, and tests that are currently being graded via some icon scheme.

**Session Panels:** This should actually be several panels (one for each parallel run) that contain the current stream of either the chat transcript for a run that is in progress or the grader's chat stream while a grader is grading a run. It should leverage either our cli markdown renderer or an off-the-shelf markdown renderer if we can find one. Users should be able to somehow switch between the various sessions using keyboard navigation. They should have some way of monitoring multiple sessions at once, but also be able to "maximize" a session to get a bigger view of it.

Once a run is complete, it should proceed to generate the report. It should stay on this screen so the user can review any results or transcripts from any of the sessions for any of the test cases, but they should also have an option to view the report.

### Report View

When viewing the report, they should be able to see it rendered using the markdown renderer. Right now ours supports a subset of the markdown syntax, but if we find an off-the-shelf terminal markdown renderer, we can switch to that. We need to be able to render the `<detail>` blocks in the final report and be able to expand/collapse them. If that's not possible or too difficult, we can probably adjust the reporting format or have a separate format for TUI only.

## CLI Features

When used by AI agents, they don't need all the fancy TUI features, so we should have a flag that we can pass or maybe detect non-interactive sessions somehow to bypass the TUI and go straight into a good CLI tool. Passing certain arguments should also implicitly bypass the TUI and just go straight into what they want to do.

Look through our existing commands for what's supported now and lets start with that. Most of this functionality is already there in some way or form so we just need to preserve this behavior.

### Minor Enhancements

I do want to incorporate a few tweaks into the CLI:

- Users should be able to add some flag to skip streaming the user conversation. This would be more for the AI agent invocation usecase to avoid bogging down context
- The output right now is a bit hard to follow at times. We should tweak the logging format to be a bit more minimal. Lets use other frameworks for inspiration here.
- Once we adopt a proper framework for the CLI and TUI bits, we should move commands to use that framework's argument parsing mechanisms.
- There should be a flag to put the CLI in "CI" mode where the output is kept CI-friendly. Maybe this can double as the AI agent mode as well, but not quite sure yet.

## Deployment Mechanism

Since we're going full TUI/CLI, I want this to be published as an npm package that anyone can pull down. This means a full CI/CD npm package deployment cycle which we also need to factor into the plan. I want feature branch builds to run our unit & skill tests. Once everything is green, then the next step is to merge to `main`. Off main, I want to at least be able to publish some kind of pre-release package version of this. I'm not sure yet how this would work with NPM so I want to explore some options here. Ideally, publishing to the actual NPM registry can be done via some release process, but I don't want it to be fully automated. Instead, I'd like to be able to control when the package gets published so that it only publishes when I'm ready.

## Constraints

- All code should be in TypeScript with strict type checking
- We should use a proper testing framework that supports code coverage reporting
- We should strive for a high level of code coverage

## Key Decisions to make

Lets come up with a plan to get all of the above goals achieved. In particular, we need to decide on the following:

- CLI framework for argument parsing and such
- TUI framework (I've heard Ink is pretty good)
- Do we stick with NodeJS or look into Bun? I've been doing some research on it on the side and it looks promising. We should look into whether this makes our lives easier.

Lets do some brainstorming to fill in the details.