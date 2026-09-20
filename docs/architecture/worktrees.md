# Worktree Architecture

## Overview

Feature work happens in git worktrees under `.worktrees/<branch>`, managed by
[worktrunk](https://worktrunk.dev) rather than raw `git worktree` commands or a
bespoke CLI. The main checkout stays free for the user, and an agent working a
branch gets a tree it can commit and push from without asking.

## Why worktrunk instead of rolling our own

Earlier iterations of this workflow in other repos were repo-specific skills
wrapping raw `git worktree`, each re-deriving the same lifecycle rules. Worktrunk
already solves the mechanics, and two of its answers are ones we would otherwise
have had to invent:

- **Hook approval.** A project's hook config is arbitrary shell code from a repo
  that may have just been cloned. Worktrunk refuses to run project hooks until
  the user approves each command, stores approvals in
  `~/.config/worktrunk/approvals.toml`, and re-prompts when a command template
  changes. Its own skill instructs agents to escalate rather than pass `--yes`.
- **Native worktree tooling.** It ships a `WorktreeCreate` hook so a harness
  `EnterWorktree` call produces an ordinary worktrunk worktree in the configured
  layout, instead of a parallel set of worktrees the tool cannot see.

It also ships skills for Claude Code, Codex, Gemini CLI, OpenCode and Pi, which
covers the multi-harness goal without us maintaining prose per harness.

The cost is a binary dependency. Worktrunk is a Rust CLI installed per machine,
so it will not be present in a CI container or a fresh sandbox. Nothing in the
build, test, or release path depends on it; it is a developer-workflow tool only.

## Setup

One time per machine. None of it belongs to an agent, and the approval step
explicitly must not be automated:

```bash
winget install max-sixty.worktrunk   # or brew / cargo, see worktrunk.dev
git-wt config plugins claude install # adds the worktrunk + wt-switch-create skills
git-wt config approvals add          # the user reviews the hook commands
```

On Windows the binary is `git-wt`, not `wt`. Windows Terminal owns `wt` on
PATH, so winget installs worktrunk under both names and `wt` loses.

Worktrunk refuses to run a project's hooks until the user approves each command,
storing approvals in `~/.config/worktrunk/approvals.toml` and re-prompting
whenever a command template changes. `.config/wt.toml` is arbitrary shell code
from the repository, so whether to trust it is a security decision belonging to
the user. An agent must escalate rather than pass `--yes`.

Then add the placement key below, which is the one piece that cannot be
committed.

## Placement

Worktrees live at `.worktrees/<branch>`, which `.gitignore` already covers.

This is **not** worktrunk's default. Its default is a sibling directory
(`../skill-unit.<branch>`), which lands outside the repo root and therefore
outside the agent harness's working directory, prompting for permission on
every command. Keeping worktrees inside the repo avoids that entirely.

Placement is configured by the `worktree-path` key, which is a **user-config**
key. Setting it in the project's `.config/wt.toml` is silently ignored, with
only a warning from `git-wt hook show` to reveal it. It therefore cannot be
committed and each machine must set it under a project scope:

```toml
[projects."github.com/dflor003/skill-unit"]
worktree-path = ".worktrees/{{ branch | sanitize }}"
```

This is the one piece of the setup that is not reproducible from the repo, and
the most likely thing to be wrong on a new machine.

## Setup hooks

`.config/wt.toml` is committed and declares what a fresh worktree needs:

```toml
[[pre-start]]
install = "npm ci"

[[pre-start]]
build = "npm run build"
```

Two decisions are encoded there:

- **`pre-start`, not `post-start`.** Worktrunk recommends `post-start`, which
  runs in the background so worktree creation returns immediately. That suits a
  human who will start typing in a few seconds. It does not suit an agent, whose
  first action in a fresh tree is typically `npm test` or `npm run typecheck`,
  which fail confusingly against a half-written `node_modules`. Blocking trades
  creation latency for a predictable starting state.
- **Two `[[pre-start]]` tables, not one table with two keys.** The array-of-
  tables form is a sequential pipeline. A single table runs its entries
  concurrently, and the build requires the install to have finished.

## CLI resolution and the `npm link` hazard

This repo's own skill invokes the CLI through
`skills/skill-unit/scripts/run-cli.sh`, which originally resolved `skill-unit`
from `PATH` first.

`npm link` is global. It points the `skill-unit` binary at exactly one checkout's
`dist/`. With worktrees, that produced a silent failure: running `/skill-unit`
from a worktree would exercise the **main checkout's** build rather than the code
under test, with no error and plausible-looking output. This is the same class of
bug as a shared port between two dev servers, and it is worse than a crash
because the result looks like a passing test of the wrong code.

The wrapper now resolves in this order:

1. `<git root>/dist/cli/index.js`, when the enclosing git root's `package.json`
   is named `skill-unit`
2. `skill-unit` on `PATH`
3. `npx --no-install skill-unit`

Step 1 uses `git rev-parse --show-toplevel`, which returns the _worktree_ root
inside a worktree, so each tree resolves to its own build. The package-name guard
keeps the branch from ever firing in a consumer's project, where the behaviour
must remain unchanged. `npm run build` is consequently required in any tree you
intend to run the skill from, which is why it is a `pre-start` hook.

## Permissions

Permission rules match on the **command string**, never on the working
directory. A bare `git push` is byte-identical whether it runs in the main
checkout or inside a worktree, so no rule can tell them apart. Worktree-scoped
autonomy is therefore expressed through the command form instead:

- **Bare `git push` is denied**, so the natural invocation fails everywhere.
- `git -C *.worktrees/* <subcommand> ...` is allow-listed for `push`, `add`,
  `commit`, `status`, `log`, `diff`, `fetch`, `rebase` and `branch`. Naming the
  worktree in the command is what a rule can match on. The leading `*` means
  both relative and absolute paths work, provided they use forward slashes.
- Raw `git worktree add|remove|move|prune` is denied, so worktrunk is the only
  lifecycle path and placement and hooks stay consistent.

The blanket `Bash(git -C *)` deny that preceded this had to be removed. Deny
beats allow, so while it was present every worktree-scoped allow above was dead
and the rules did nothing but emit startup warnings.

### Accepted risk: wildcards before the subcommand

Every `git -C *.worktrees/* <subcommand>` rule puts a wildcard in **option
position**, and Claude Code warns about each one at startup:

> has a wildcard before the rest of the command, so it also matches any options
> inserted at that position and approves them without a prompt. For git, options
> such as `-c` and `--exec-path` can run arbitrary commands.

The warning is correct. `git -C .worktrees/x -c core.fsmonitor=<script> push origin main`
matches the allow rule and runs without a prompt. Writing the `-C` target
literally (`Bash(git -C .worktrees/readme push *)`) would close the hole and
silence the warning, at the cost of one rule set per worktree.

This was weighed and the wildcard form kept deliberately, trading the injection
surface for not having to maintain per-worktree rules. Do not "fix" the warnings
by reinstating a `Bash(git -C *)` deny, which silently disables the rules
instead. Revisit only by moving to literal paths or a `PreToolUse` hook.

### What the rules do not do

Per Claude Code's own documentation, a Bash rule "isn't a security boundary
around the program". Specifically, `deny: Bash(git push *)` does **not** stop:

```
git -C . push origin main
git -c push.default=current push origin main
git 'push' origin main
```

So an agent pushing from the main checkout is prevented by the CLAUDE.md
instruction, not by the deny list. The rules raise the floor; they are not a
guarantee. The same applies to `git add` and `git commit`, which remain
allow-listed globally and are governed by instruction alone.

## Windows: `git-wt remove` fails with "Git for Windows is required"

Worktrunk runs hooks and background work through Git Bash, and locates it in
`find_git_bash()` (`src/shell_exec.rs`) by a heuristic that does not hold here:

1. `which("git")`, then take git.exe's **grandparent** directory
2. look for `<grandparent>\bin\bash.exe`, then `<grandparent>\usr\bin\bash.exe`
3. otherwise fall back to the hardcoded `C:\Program Files\Git\bin\bash.exe` and
   `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`

The heuristic assumes git.exe sits at `<root>\cmd\git.exe` or `<root>\bin\git.exe`,
so the grandparent is the install root. Git Bash prepends `/mingw64/bin` to
PATH, so inside a Git Bash session, and in anything launched from one including
an agent's shell tool, `which("git")` resolves to `<root>\mingw64\bin\git.exe`.
Its grandparent is `<root>\mingw64`, which contains neither `bin\bash.exe` nor
`usr\bin\bash.exe`. Every step then misses and worktrunk reports:

```
Git for Windows is required but not found.
Install from https://git-scm.com/download/win
```

Two conditions must both hold, which is why this is easy to misdiagnose:

- The session's PATH puts `mingw64\bin` ahead of `cmd`, which Git Bash always
  does. The Machine PATH here lists `Git\cmd` first, so a native PowerShell or
  cmd session is expected to resolve git differently and work.
- Git is installed **outside** `C:\Program Files\Git`, so the fallback misses.
  Here it lives at `C:\DeveloperTools\Git`.

Git being "on PATH" is therefore not the question, and checking `git --version`
proves nothing: three Git directories are on the Machine PATH already
(`Git\cmd`, `Git\mingw64\bin`, `Git\usr\bin`) and the failure still occurs. The
directory that matters, `<root>\bin`, is the one absent.

The failure is also asymmetric. `git-wt switch --create` succeeds, because
creation needs no shell. `git-wt remove` fails, and a half-completed removal can
delete the branch while leaving the directory registered on disk.

The remedy is to put `<root>\bin` ahead of `mingw64\bin`, which makes
`which("git")` resolve to `<root>\bin\git.exe` whose grandparent is the install
root:

```bash
export PATH="/c/DeveloperTools/Git/bin:$PATH"   # in ~/.bashrc
```

Verified by a create-and-remove cycle that reproducibly fails without the entry
and completes with it. This is arguably a worktrunk bug, since `bash.exe` is
reachable at `<root>\usr\bin\bash.exe` on PATH the whole time; the heuristic
just never looks there.

## Windows: `git-wt remove` can half-succeed, and it reports success

Distinct from the detection failure above, and it survives that fix. Removal
runs in the **background**, so the CLI prints only:

```
◎ Removing <branch> worktree (--force) & branch in background
```

and returns. A failure after that point never reaches the terminal. Observed on
a worktree whose `pre-start` hooks had just run `npm ci` and `tsc`:

- the worktree was **deregistered** from git, so `git worktree list` no longer
  showed it
- `.worktrees/<folder>` **remained on disk**
- the branch **remained**

The real error was only in the log:

```
.git/wt/logs/<folder>-<id>/internal/remove.log
error: failed to delete 'C:/.../.worktrees/<folder>': Permission denied
```

No process held the directory (`Get-CimInstance Win32_Process` found zero
`node.exe` at all), and a plain `rm -rf` succeeded moments later, so the lock is
transient. Antivirus or the just-finished build touching files is the likely
cause. Do not go hunting PIDs before retrying the delete.

Because the first attempt already deregistered the worktree, **re-running
`git-wt remove` does not finish the job**: it reports no such branch or worktree
and skips the remaining steps. Finish by hand:

```bash
rm -rf .worktrees/<folder>
git branch -d <branch>      # -d suffices when the branch has no unique commits
```

Practical consequence: after any `git-wt remove`, verify rather than trust the
CLI. `git worktree list` plus `ls .worktrees/` plus `git branch --list` is the
check, and the log above is where the reason lives.

## Commit autonomy

The main checkout keeps the repo default: no `git add` or `git commit` without
an explicit request. Inside `.worktrees/`, an agent commits, pushes, and opens a
Draft PR on its own, since the branch is isolated and the PR is where review
happens. Marking a PR Ready for Review and merging it remain the user's.
