# CLI runs fixtures

Each top-level directory here is a self-contained `.workspace/runs/` snapshot
with its own timestamped run folders under `runs/`. Tests point the runs-index
helpers at one of these roots via `runsRoot`.

Two canned roots:

- `latest-is-2026-04-18/` — two runs, the newer one has a mix of pass and fail.
  Canonical happy-path fixture for the CLI tests.
- `empty/` — no `runs/` directory at all. Covers the "no runs yet" path.
