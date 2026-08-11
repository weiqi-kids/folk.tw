/**
 * Build-time release policy for pre-written content.
 *
 * Content may be prepared months ahead, but a page is public only after its
 * optional `publish_at` date (an ISO calendar date in Asia/Taipei).  Entries
 * without `publish_at` remain published for backwards compatibility.
 *
 * Keep this module deliberately data-source agnostic: festivals, campaigns,
 * and future content manifests can all use the same predicate without
 * importing an Astro route or duplicating date comparisons.
 */
import { todayInTaipei } from './daily.ts';

export type ScheduledContent = {
  publish_at?: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A release date must be a date-only ISO value; no time-zone guessing. */
export function isReleaseDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Whether an item may be rendered for the supplied Taipei calendar date.
 * Invalid non-empty dates fail closed; the release gate reports the bad data.
 */
export function isReleased(item: ScheduledContent, today = todayInTaipei().iso): boolean {
  const publishAt = item.publish_at;
  if (publishAt == null || publishAt === '') return true;
  if (!isReleaseDate(publishAt)) return false;
  return publishAt <= today;
}

/** Filter a collection to entries allowed in this build. */
export function releasedItems<T extends object>(items: readonly T[], today?: string): T[] {
  const cutoff = today ?? todayInTaipei().iso;
  return items.filter((item) => isReleased(item as ScheduledContent, cutoff));
}

/**
 * Return scheduled entries not yet public.  This is useful for CI/reporting;
 * it is intentionally not used by page templates, so future items cannot
 * accidentally become an internal link.
 */
export function unreleasedItems<T extends object>(items: readonly T[], today?: string): T[] {
  const cutoff = today ?? todayInTaipei().iso;
  return items.filter((item) => !isReleased(item as ScheduledContent, cutoff));
}
