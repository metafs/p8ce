import {
  eventPublicationState,
  type EventPublicationState,
} from "@/features/events/publication-state";
import { tokyoDateKey } from "@/lib/datetime";
import {
  eventTypeLabel,
  isApplyEventType,
  type EventType,
} from "@/features/revisions/schema";

export type Prefecture = "TOKYO" | "KANAGAWA";

/** REQ-DISCOVERY-002 names the two MVP Prefectures 東京都 and 神奈川県. */
const prefectureLabels: Record<Prefecture, string> = {
  TOKYO: "東京都",
  KANAGAWA: "神奈川県",
};

export function prefectureLabel(prefecture: Prefecture) {
  return prefectureLabels[prefecture];
}

export type DiscoveryFilters = {
  /** Inclusive Tokyo calendar day, `YYYY-MM-DD`. */
  from?: string | null;
  /** Inclusive Tokyo calendar day, `YYYY-MM-DD`. */
  to?: string | null;
  prefecture?: Prefecture | null;
  eventType?: EventType | null;
  /** Free text matched over the fields REQ-DISCOVERY-003 names (ADR-0020). */
  text?: string | null;
};

export type ArtistCreditRow = {
  event_revision_id: string;
  artist_id: string;
};

export type EventRow = {
  id: string;
  published_revision_id: string | null;
  cancelled_at: string | null;
  parent_event_id: string | null;
  owner_organization_id: string;
};

export type RevisionRow = {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType | null;
  application_deadline: string | null;
};

export type ScheduleRow = {
  event_revision_id: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  venue_id: string;
};

export type VenueRow = {
  id: string;
  name: string;
  prefecture: Prefecture;
};

export type DiscoveryScheduleView = {
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  venueId: string;
  venueName: string;
  prefecture: Prefecture;
};

export type DiscoveryEventSummary = {
  id: string;
  publishedRevisionId: string;
  title: string;
  description: string | null;
  eventType: EventType | null;
  typeLabel: string | null;
  state: EventPublicationState;
  organizationName: string | null;
  applicationDeadline: string | null;
  parentEventId: string | null;
  schedules: DiscoveryScheduleView[];
  /** Credited Artist names, carried for search (REQ-DISCOVERY-003). */
  artistNames: string[];
};

/**
 * Builds the public projection of an Event from its approved Revision. A
 * Festival carries no Schedules of its own, so `childSchedules` supplies the
 * Schedules of its child Events and the Festival's dates and past
 * determination derive from them (ADR-0009, REQ-DISCOVERY-001).
 */
export function projectEvents(input: {
  events: readonly EventRow[];
  revisions: readonly RevisionRow[];
  schedules: readonly ScheduleRow[];
  venues: readonly VenueRow[];
  organizations?: readonly { id: string; name: string }[];
  artistCredits?: readonly ArtistCreditRow[];
  artists?: readonly { id: string; name: string }[];
  now?: Date;
}): DiscoveryEventSummary[] {
  const revisionById = new Map(input.revisions.map((row) => [row.id, row]));
  const venueById = new Map(input.venues.map((row) => [row.id, row]));
  const organizationById = new Map(
    (input.organizations ?? []).map((row) => [row.id, row.name]),
  );

  const artistNameById = new Map(
    (input.artists ?? []).map((row) => [row.id, row.name]),
  );
  const artistNamesByRevision = new Map<string, string[]>();
  for (const credit of input.artistCredits ?? []) {
    const name = artistNameById.get(credit.artist_id);
    if (!name) continue;
    const names = artistNamesByRevision.get(credit.event_revision_id) ?? [];
    names.push(name);
    artistNamesByRevision.set(credit.event_revision_id, names);
  }

  const schedulesByRevision = new Map<string, DiscoveryScheduleView[]>();
  for (const schedule of input.schedules) {
    const venue = venueById.get(schedule.venue_id);
    if (!venue) continue;

    const views = schedulesByRevision.get(schedule.event_revision_id) ?? [];
    views.push({
      startsAt: schedule.starts_at,
      endsAt: schedule.ends_at,
      allDay: schedule.all_day,
      venueId: venue.id,
      venueName: venue.name,
      prefecture: venue.prefecture,
    });
    schedulesByRevision.set(schedule.event_revision_id, views);
  }
  for (const views of schedulesByRevision.values()) {
    views.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  const publishedRevisionByEvent = new Map(
    input.events
      .filter((event) => event.published_revision_id)
      .map((event) => [event.id, event.published_revision_id as string]),
  );

  const childSchedulesByParent = new Map<string, DiscoveryScheduleView[]>();
  for (const event of input.events) {
    if (!event.parent_event_id) continue;
    const revisionId = publishedRevisionByEvent.get(event.id);
    if (!revisionId) continue;

    const views = childSchedulesByParent.get(event.parent_event_id) ?? [];
    views.push(...(schedulesByRevision.get(revisionId) ?? []));
    childSchedulesByParent.set(event.parent_event_id, views);
  }
  for (const views of childSchedulesByParent.values()) {
    views.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  const summaries: DiscoveryEventSummary[] = [];

  for (const event of input.events) {
    const revisionId = event.published_revision_id;
    if (!revisionId) continue;
    const revision = revisionById.get(revisionId);
    if (!revision) continue;

    const ownSchedules = schedulesByRevision.get(revisionId) ?? [];
    const schedules = revision.event_type === "festival"
      ? childSchedulesByParent.get(event.id) ?? ownSchedules
      : ownSchedules;

    summaries.push({
      id: event.id,
      publishedRevisionId: revisionId,
      title: revision.title,
      description: revision.description,
      eventType: revision.event_type,
      typeLabel: revision.event_type ? eventTypeLabel(revision.event_type) : null,
      state: eventPublicationState({
        eventType: revision.event_type,
        cancelledAt: event.cancelled_at,
        applicationDeadline: revision.application_deadline,
        schedules: schedules.map((schedule) => ({
          starts_at: schedule.startsAt,
          ends_at: schedule.endsAt,
          all_day: schedule.allDay,
        })),
      }, input.now),
      organizationName: organizationById.get(event.owner_organization_id) ?? null,
      applicationDeadline: revision.application_deadline,
      parentEventId: event.parent_event_id,
      schedules,
      artistNames: artistNamesByRevision.get(revisionId) ?? [],
    });
  }

  return summaries;
}

/**
 * REQ-DISCOVERY-001 filters on Schedule dates only; an application deadline is
 * never a calendar date. REQ-DISCOVERY-002 derives the region from each
 * Schedule's Venue, so an Event with Schedules in both Prefectures matches each
 * Prefecture filter once, and a Schedule-free `apply` Event matches no region.
 */
/**
 * NFKC folds full-width Latin and half-width kana onto their ordinary forms, so
 * 「Ｙａｍａｄａ」 and "Yamada" are one term; lowercasing then removes the Latin
 * case distinction. Japanese has no case, so this is a no-op for it (ADR-0020).
 */
function normalizeForSearch(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

/**
 * Terms are separated by whitespace of either width and combined with AND. A
 * term may match a different field from its neighbour, so 「山田 渋谷」 finds an
 * Event crediting 山田 at a Venue in 渋谷 (REQ-DISCOVERY-003, ADR-0020).
 */
export function matchesText(
  event: DiscoveryEventSummary,
  text: string,
): boolean {
  const terms = normalizeForSearch(text).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = [
    event.title,
    event.description,
    event.organizationName,
    ...event.artistNames,
    ...event.schedules.map((schedule) => schedule.venueName),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeForSearch);

  return terms.every((term) => haystack.some((value) => value.includes(term)));
}

export function matchesFilters(
  event: DiscoveryEventSummary,
  filters: DiscoveryFilters,
): boolean {
  if (filters.eventType && event.eventType !== filters.eventType) return false;
  if (filters.text && !matchesText(event, filters.text)) return false;

  return filterSchedulesForFilters(event.schedules, filters).length > 0
    || !needsScheduleFilters(filters);
}

function needsScheduleFilters(filters: DiscoveryFilters) {
  return Boolean(filters.from || filters.to || filters.prefecture);
}

export function filterSchedulesForFilters(
  schedules: readonly DiscoveryScheduleView[],
  filters: DiscoveryFilters,
): DiscoveryScheduleView[] {
  if (!needsScheduleFilters(filters)) return [...schedules];

  return schedules.filter((schedule) => {
    if (filters.prefecture && schedule.prefecture !== filters.prefecture) return false;

    const day = tokyoDateKey(schedule.startsAt);
    if (!day) return false;
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  });
}

function firstScheduleStart(event: DiscoveryEventSummary) {
  return event.schedules[0]?.startsAt ?? null;
}

function discoverySortInstant(event: DiscoveryEventSummary) {
  if (event.state !== "published" && event.eventType && isApplyEventType(event.eventType)) {
    return event.applicationDeadline;
  }
  return firstScheduleStart(event);
}

/**
 * Upcoming Events first by their next date, then Events with no date, then
 * finished and cancelled Events most recent first, so the archive that
 * REQ-EVENT-007 keeps public does not crowd out what is still open.
 */
export function sortByDiscoveryOrder(
  events: readonly DiscoveryEventSummary[],
): DiscoveryEventSummary[] {
  const rank = (event: DiscoveryEventSummary) => {
    if (event.state === "published") return firstScheduleStart(event) ? 0 : 1;
    return 2;
  };

  return [...events].sort((left, right) => {
    const rankDifference = rank(left) - rank(right);
    if (rankDifference !== 0) return rankDifference;

    const leftStart = discoverySortInstant(left);
    const rightStart = discoverySortInstant(right);
    if (leftStart && rightStart && leftStart !== rightStart) {
      return rank(left) === 2
        ? rightStart.localeCompare(leftStart)
        : leftStart.localeCompare(rightStart);
    }

    return left.title.localeCompare(right.title, "ja");
  });
}

/**
 * REQ-DISCOVERY-003 gives `apply` Events a deadline-ordered listing of their
 * own. Events whose deadline has passed drop out; the calendar never sees these
 * dates (REQ-DISCOVERY-001).
 */
export function openApplications(
  events: readonly DiscoveryEventSummary[],
): DiscoveryEventSummary[] {
  return events
    .filter((event) =>
      event.eventType
      && isApplyEventType(event.eventType)
      && event.state === "published"
      && event.applicationDeadline)
    .sort((left, right) =>
      (left.applicationDeadline as string).localeCompare(
        right.applicationDeadline as string,
      ));
}

export type TicketOfferRow = {
  event_revision_id: string;
  price_type: string;
  label: string | null;
  currency: string | null;
  amount_minor: number | string | null;
  min_amount_minor: number | string | null;
  max_amount_minor: number | string | null;
  display_order: number;
};

export type AccessLinkRow = {
  event_revision_id: string;
  kind: string;
  label: string | null;
  url: string;
  display_order: number;
};

/** Calendar-only filters on top of the shared discovery filters. */
export type CalendarFilters = DiscoveryFilters & {
  venueId?: string | null;
  /** Only Events whose every Ticket Offer is free. */
  free?: boolean;
};

export type CalendarEntry = {
  event: DiscoveryEventSummary;
  festival: { id: string; title: string } | null;
  offers: TicketOfferRow[];
  accessLinks: AccessLinkRow[];
  free: boolean;
};

export type CalendarDayItem = {
  entry: CalendarEntry;
  /** The Event's Schedules on this day, after the region and venue filters. */
  schedules: DiscoveryScheduleView[];
};

export type CalendarDay = { day: string; items: CalendarDayItem[] };

/** Free means at least one Ticket Offer, and every one of them `free`. */
export function isFreeOffers(offers: readonly { price_type: string }[]) {
  return offers.length > 0 && offers.every((offer) => offer.price_type === "free");
}

function byRevision<T extends { event_revision_id: string; display_order: number }>(rows: readonly T[]) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.event_revision_id) ?? [];
    list.push(row);
    map.set(row.event_revision_id, list);
  }
  for (const list of map.values()) list.sort((left, right) => left.display_order - right.display_order);
  return map;
}

/**
 * The Events a Calendar shows. A Festival itself never appears: the Calendar
 * shows its child Events, each naming the Festival (REQ-DISCOVERY-001). The
 * region and venue filters narrow each Event's Schedules, so an Event is
 * placed only on the days it runs in that region or at that Venue
 * (REQ-DISCOVERY-002). Date bounds are left to the caller.
 */
export function calendarEntries(input: {
  events: readonly DiscoveryEventSummary[];
  offers?: readonly TicketOfferRow[];
  accessLinks?: readonly AccessLinkRow[];
  filters?: CalendarFilters;
}): CalendarEntry[] {
  const filters = input.filters ?? {};
  const eventById = new Map(input.events.map((event) => [event.id, event]));
  const offersByRevision = byRevision(input.offers ?? []);
  const linksByRevision = byRevision(input.accessLinks ?? []);
  const entries: CalendarEntry[] = [];

  for (const event of input.events) {
    if (event.eventType === "festival") continue;
    if (filters.eventType && event.eventType !== filters.eventType) continue;
    if (filters.text && !matchesText(event, filters.text)) continue;

    const offers = offersByRevision.get(event.publishedRevisionId) ?? [];
    const free = isFreeOffers(offers);
    if (filters.free && !free) continue;

    const schedules = event.schedules.filter((schedule) =>
      (!filters.prefecture || schedule.prefecture === filters.prefecture)
      && (!filters.venueId || schedule.venueId === filters.venueId));
    if (schedules.length === 0) continue;

    const parent = event.parentEventId ? eventById.get(event.parentEventId) : null;

    entries.push({
      event: { ...event, schedules },
      festival: parent ? { id: parent.id, title: parent.title } : null,
      offers,
      accessLinks: linksByRevision.get(event.publishedRevisionId) ?? [],
      free,
    });
  }

  return entries;
}

/**
 * Groups calendar entries onto the Tokyo days their Schedules fall on. An Event
 * with several Schedules appears once on each of those days, carrying that
 * day's Schedules; within a day, items run in order of their first start.
 */
export function calendarDayItems(entries: readonly CalendarEntry[]): CalendarDay[] {
  const byDay = new Map<string, CalendarDayItem[]>();

  for (const entry of entries) {
    const schedulesByDay = new Map<string, DiscoveryScheduleView[]>();
    for (const schedule of entry.event.schedules) {
      const day = tokyoDateKey(schedule.startsAt);
      if (!day) continue;
      const list = schedulesByDay.get(day) ?? [];
      list.push(schedule);
      schedulesByDay.set(day, list);
    }

    for (const [day, schedules] of schedulesByDay) {
      const items = byDay.get(day) ?? [];
      items.push({ entry, schedules });
      byDay.set(day, items);
    }
  }

  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, items]) => ({
      day,
      items: items.sort((left, right) =>
        left.schedules[0].startsAt.localeCompare(right.schedules[0].startsAt)
        || left.entry.event.title.localeCompare(right.entry.event.title, "ja")),
    }));
}
