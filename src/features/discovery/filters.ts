import { isEventType } from "@/features/revisions/schema";

import { isCalendarDay, weekStart } from "./calendar";
import type { DiscoveryFilters, Prefecture } from "./projection";

export type SearchParamsInput = Record<string, string | string[] | undefined>;

export const prefectures = ["TOKYO", "KANAGAWA"] as const;

const tokyoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function single(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim() : "";
}

function isPrefecture(value: string): value is Prefecture {
  return prefectures.some((prefecture) => prefecture === value);
}

/**
 * Reads discovery filters out of the query string. A value that is not a
 * Tokyo calendar date, a known Prefecture, or a known Event Type is dropped
 * rather than rejected: a Visitor who edits or shares a URL should still get
 * the list, not an error page.
 */
export function parseDiscoveryFilters(params: SearchParamsInput): DiscoveryFilters {
  const from = single(params.from);
  const to = single(params.to);
  const prefecture = single(params.prefecture);
  const eventType = single(params.type);
  // Any text is a valid search, so unlike the others this is kept as given
  // rather than checked against a known set. The length cap keeps a pasted
  // document out of the query string; ADR-0020 normalizes at match time.
  const text = single(params.q).slice(0, 200);

  return {
    from: tokyoDatePattern.test(from) ? from : null,
    to: tokyoDatePattern.test(to) ? to : null,
    prefecture: isPrefecture(prefecture) ? prefecture : null,
    eventType: isEventType(eventType) ? eventType : null,
    text: text || null,
  };
}

/**
 * The canonical query string for a set of filters, so a filtered view can be
 * linked to and shared. Empty filters produce an empty string rather than a
 * bare "?".
 */
export function filterQueryString(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();

  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.prefecture) params.set("prefecture", filters.prefecture);
  if (filters.eventType) params.set("type", filters.eventType);
  if (filters.text) params.set("q", filters.text);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasActiveFilter(filters: DiscoveryFilters): boolean {
  return Boolean(
    filters.from || filters.to || filters.prefecture || filters.eventType || filters.text,
  );
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CalendarView = "day" | "month";

export type CalendarQuery = {
  view: CalendarView;
  /** Requested first day of the day view; resolved against today later. */
  from: string | null;
  /** Requested first day of the date strip. */
  strip: string | null;
  /** Requested month of the month view, `YYYY-MM`. */
  month: string | null;
  prefecture: Prefecture | null;
  eventType: DiscoveryFilters["eventType"];
  venueId: string | null;
  free: boolean;
};

/**
 * Reads the Calendar's query string. The day view is the default; a `month`
 * without a `view` still opens the month view, so links made before the day
 * view existed keep working. Unknown values are dropped, as with the 探す
 * filters.
 */
export function parseCalendarQuery(params: SearchParamsInput): CalendarQuery {
  const view = single(params.view);
  const month = single(params.month);
  const from = single(params.from);
  const strip = single(params.strip);
  const venue = single(params.venue);
  const shared = parseDiscoveryFilters({ prefecture: params.prefecture, type: params.type });

  return {
    view: view === "month" || (view !== "day" && Boolean(month)) ? "month" : "day",
    // Real days only: `2026-02-30` would roll over to March and leave the
    // strip starting on a Monday. The strip is also aligned to its Sunday.
    from: isCalendarDay(from) ? from : null,
    strip: isCalendarDay(strip) ? weekStart(strip) : null,
    month: /^\d{4}-\d{2}$/.test(month) ? month : null,
    prefecture: shared.prefecture ?? null,
    eventType: shared.eventType ?? null,
    venueId: uuidPattern.test(venue) ? venue.toLowerCase() : null,
    free: single(params.free) === "1",
  };
}

/**
 * The Calendar URL for a query, keeping only what differs from the defaults so
 * shared links stay short.
 */
export function calendarHref(query: Partial<CalendarQuery>): string {
  const params = new URLSearchParams();

  if (query.view === "month") params.set("view", "month");
  if (query.view === "month" && query.month) params.set("month", query.month);
  if (query.view !== "month" && query.from) params.set("from", query.from);
  if (query.view !== "month" && query.strip) params.set("strip", query.strip);
  if (query.prefecture) params.set("prefecture", query.prefecture);
  if (query.eventType) params.set("type", query.eventType);
  if (query.venueId) params.set("venue", query.venueId);
  if (query.free) params.set("free", "1");

  const search = params.toString();
  return search ? `/calendar?${search}` : "/calendar";
}

export function hasCalendarFilter(query: Pick<CalendarQuery, "prefecture" | "eventType" | "venueId" | "free">) {
  return Boolean(query.prefecture || query.eventType || query.venueId || query.free);
}
