/** Formatting helpers for anything the dashboard derives from timestamps. */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Compact relative time: "just now", "4h", "3d", "2w", then a date.
 * Kept short deliberately — these sit inside dense rows where a full
 * "3 days ago" would push the label it belongs to onto a second line.
 */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const delta = Date.now() - then;
  if (delta < 0) return 'just now';
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`;
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`;
  if (delta < 5 * WEEK) return `${Math.floor(delta / WEEK)}w`;

  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Time-of-day greeting. Field work starts early, so dawn gets its own band. */
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "3 rovers" / "1 rover" — avoids the "1 rovers" tell of a generated UI. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}
