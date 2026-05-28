// Precedence:
//   2 if any test timed out (regardless of other failures)
//   1 if any test failed behaviorally
//   0 if everything passed
//
// Timeouts take precedence because a timeout-tainted run is inconclusive about
// skill behavior. A maintainer seeing exit 2 should fix the infra/budget first
// before drawing conclusions about any other failures in the same run.
export function computeExitCode(failed: number, timedOut: number): number {
  if (timedOut > 0) return 2;
  if (failed > 0) return 1;
  return 0;
}
