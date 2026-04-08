/**
 * Parse a timestamp string into a Date. Handles both ISO strings and the
 * "YYYY-MM-DD-HH-MM-SS" format produced by the compiler's formatTimestamp().
 */
function parseTimestamp(ts: string): Date {
  const d = new Date(ts);
  if (!isNaN(d.getTime())) return d;

  // Fall back to "YYYY-MM-DD-HH-MM-SS" format
  const parts = ts.split('-');
  if (parts.length >= 6) {
    return new Date(
      +parts[0],
      +parts[1] - 1,
      +parts[2],
      +parts[3],
      +parts[4],
      +parts[5]
    );
  }
  return d; // invalid, caller should check
}

/**
 * Format a timestamp string as a locale-aware date/time string.
 * Example output: "04/07/2026 10:31 AM"
 */
export function formatTimestamp(ts: string): string {
  if (!ts) return '-';
  const d = parseTimestamp(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a timestamp string as a locale-aware date only (no time).
 * Example output: "04/07/2026"
 */
export function formatDate(ts: string): string {
  if (!ts) return '-';
  const d = parseTimestamp(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}
