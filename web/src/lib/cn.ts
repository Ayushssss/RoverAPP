/**
 * Conditional class joiner.
 *
 * Deliberately not `tailwind-merge`: nothing here relies on a later utility
 * beating an earlier one — variants are composed, not overridden — so the
 * 6KB of conflict resolution would buy nothing.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
