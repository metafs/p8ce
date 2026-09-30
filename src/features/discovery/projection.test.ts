import { describe, expect, it } from "vitest";

import {
  calendarDayItems,
  calendarEntries,
  filterSchedulesForFilters,
  isFreeOffers,
  prefectureLabel,
  matchesFilters,
  matchesText,
  openApplications,
  projectEvents,
  sortByDiscoveryOrder,
  type EventRow,
  type RevisionRow,
  type ScheduleRow,
  type VenueRow,
} from "./projection";

const now = new Date("2026-04-10T03:00:00.000Z"); // 2026-04-10 12:00 in Tokyo

const venues: VenueRow[] = [
  { id: "venue-tokyo", name: "Tokyo Venue", prefecture: "TOKYO" },
  { id: "venue-kanagawa", name: "Kanagawa Venue", prefecture: "KANAGAWA" },
];

function event(id: string, overrides: Partial<EventRow> = {}): EventRow {
  return {
    id,
    published_revision_id: `${id}-rev`,
    cancelled_at: null,
    parent_event_id: null,
    owner_organization_id: "org-1",
    ...overrides,
  };
}

function revision(id: string, overrides: Partial<RevisionRow> = {}): RevisionRow {
  return {
    id: `${id}-rev`,
    title: id,
    description: null,
    event_type: "performance",
    application_deadline: null,
    ...overrides,
  };
}

function schedule(
  eventId: string,
  starts_at: string,
  venue_id = "venue-tokyo",
  overrides: Partial<ScheduleRow> = {},
): ScheduleRow {
  return {
    event_revision_id: `${eventId}-rev`,
    starts_at,
    ends_at: null,
    all_day: false,
    venue_id,
    ...overrides,
  };
}

describe("projectEvents", () => {
  it("projects only Events that have an approved Revision", () => {
    const summaries = projectEvents({
      events: [event("a"), event("b", { published_revision_id: null })],
      revisions: [revision("a")],
      schedules: [],
      venues,
      now,
    });

    expect(summaries.map((summary) => summary.id)).toEqual(["a"]);
    expect(summaries[0].publishedRevisionId).toBe("a-rev");
  });

  it("drops an Event whose Revision row was not returned", () => {
    const summaries = projectEvents({
      events: [event("a")],
      revisions: [],
      schedules: [],
      venues,
      now,
    });

    expect(summaries).toEqual([]);
  });

  it("attaches Venue name and Prefecture to each Schedule, in date order", () => {
    const [summary] = projectEvents({
      events: [event("a")],
      revisions: [revision("a")],
      schedules: [
        schedule("a", "2026-05-02T10:00:00.000Z", "venue-kanagawa"),
        schedule("a", "2026-05-01T10:00:00.000Z", "venue-tokyo"),
      ],
      venues,
      now,
    });

    expect(summary.schedules.map((item) => [item.startsAt, item.prefecture])).toEqual([
      ["2026-05-01T10:00:00.000Z", "TOKYO"],
      ["2026-05-02T10:00:00.000Z", "KANAGAWA"],
    ]);
  });

  it("labels the Event Type and resolves the Organization name", () => {
    const [summary] = projectEvents({
      events: [event("a")],
      revisions: [revision("a", { event_type: "open_call" })],
      schedules: [],
      venues,
      organizations: [{ id: "org-1", name: "Fixture Dance Organization" }],
      now,
    });

    expect(summary.typeLabel).toBe("公募");
    expect(summary.organizationName).toBe("Fixture Dance Organization");
  });

  it("leaves the Organization name null when it was not readable", () => {
    const [summary] = projectEvents({
      events: [event("a")],
      revisions: [revision("a")],
      schedules: [],
      venues,
      now,
    });

    expect(summary.organizationName).toBeNull();
  });

  it("derives Festival dates from its published child Events", () => {
    const summaries = projectEvents({
      events: [
        event("fest"),
        event("child", { parent_event_id: "fest" }),
        event("draft-child", { parent_event_id: "fest", published_revision_id: null }),
      ],
      revisions: [
        revision("fest", { event_type: "festival" }),
        revision("child"),
      ],
      schedules: [
        schedule("child", "2026-05-03T10:00:00.000Z"),
        schedule("draft-child", "2026-05-09T10:00:00.000Z"),
      ],
      venues,
      now,
    });
    const festival = summaries.find((summary) => summary.id === "fest");

    expect(festival?.schedules.map((item) => item.startsAt))
      .toEqual(["2026-05-03T10:00:00.000Z"]);
  });

  it("marks a cancelled Event cancelled and a finished Event past", () => {
    const summaries = projectEvents({
      events: [
        event("cancelled", { cancelled_at: "2026-04-01T00:00:00.000Z" }),
        event("finished"),
        event("upcoming"),
      ],
      revisions: [revision("cancelled"), revision("finished"), revision("upcoming")],
      schedules: [
        schedule("cancelled", "2026-05-01T10:00:00.000Z"),
        schedule("finished", "2026-04-01T10:00:00.000Z"),
        schedule("upcoming", "2026-05-01T10:00:00.000Z"),
      ],
      venues,
      now,
    });

    expect(summaries.map((summary) => [summary.id, summary.state])).toEqual([
      ["cancelled", "cancelled"],
      ["finished", "past"],
      ["upcoming", "published"],
    ]);
  });
});

describe("prefectureLabel", () => {
  it("names the two MVP Prefectures as REQ-DISCOVERY-002 does", () => {
    expect(prefectureLabel("TOKYO")).toBe("東京都");
    expect(prefectureLabel("KANAGAWA")).toBe("神奈川県");
  });
});

describe("matchesFilters", () => {
  const summaries = projectEvents({
    events: [event("tokyo"), event("both"), event("apply")],
    revisions: [
      revision("tokyo"),
      revision("both", { event_type: "workshop" }),
      revision("apply", {
        event_type: "open_call",
        application_deadline: "2026-05-20T00:00:00.000Z",
      }),
    ],
    schedules: [
      schedule("tokyo", "2026-05-01T10:00:00.000Z", "venue-tokyo"),
      schedule("both", "2026-05-02T10:00:00.000Z", "venue-tokyo"),
      schedule("both", "2026-06-02T10:00:00.000Z", "venue-kanagawa"),
    ],
    venues,
    now,
  });
  const find = (id: string) =>
    summaries.find((summary) => summary.id === id) as (typeof summaries)[number];

  it("keeps every Event when no filter is set", () => {
    expect(summaries.every((summary) => matchesFilters(summary, {}))).toBe(true);
  });

  it("matches an Event with Schedules in both Prefectures under either filter", () => {
    expect(matchesFilters(find("both"), { prefecture: "TOKYO" })).toBe(true);
    expect(matchesFilters(find("both"), { prefecture: "KANAGAWA" })).toBe(true);
    expect(matchesFilters(find("tokyo"), { prefecture: "KANAGAWA" })).toBe(false);
  });

  it("excludes a Schedule-free apply Event from region and date results", () => {
    expect(matchesFilters(find("apply"), { prefecture: "TOKYO" })).toBe(false);
    expect(matchesFilters(find("apply"), { from: "2026-05-01" })).toBe(false);
    expect(matchesFilters(find("apply"), { eventType: "open_call" })).toBe(true);
  });

  it("filters on Tokyo calendar days inclusively at both ends", () => {
    expect(matchesFilters(find("tokyo"), { from: "2026-05-01", to: "2026-05-01" })).toBe(true);
    expect(matchesFilters(find("tokyo"), { from: "2026-05-02" })).toBe(false);
    expect(matchesFilters(find("tokyo"), { to: "2026-04-30" })).toBe(false);
  });

  it("uses the Tokyo day, not the UTC day, at the boundary", () => {
    // 2026-05-01T15:30Z is 2026-05-02 00:30 in Tokyo.
    const [lateNight] = projectEvents({
      events: [event("late")],
      revisions: [revision("late")],
      schedules: [schedule("late", "2026-05-01T15:30:00.000Z")],
      venues,
      now,
    });

    expect(matchesFilters(lateNight, { from: "2026-05-02", to: "2026-05-02" })).toBe(true);
    expect(matchesFilters(lateNight, { from: "2026-05-01", to: "2026-05-01" })).toBe(false);
  });

  it("requires the same Schedule to satisfy both region and date", () => {
    // The Kanagawa Schedule is in June, so May + Kanagawa matches nothing.
    expect(matchesFilters(find("both"), {
      prefecture: "KANAGAWA",
      from: "2026-05-01",
      to: "2026-05-31",
    })).toBe(false);
  });

  it("retains only the matching Schedules for a filtered Event", () => {
    const both = find("both");

    expect(filterSchedulesForFilters(both.schedules, {
      prefecture: "KANAGAWA",
      from: "2026-06-01",
      to: "2026-06-30",
    }).map((item) => [item.startsAt, item.prefecture])).toEqual([
      ["2026-06-02T10:00:00.000Z", "KANAGAWA"],
    ]);
  });

  it("filters by Event Type", () => {
    expect(matchesFilters(find("both"), { eventType: "workshop" })).toBe(true);
    expect(matchesFilters(find("both"), { eventType: "performance" })).toBe(false);
  });
});

describe("sortByDiscoveryOrder", () => {
  it("puts upcoming dates first, then undated, then finished most recent first", () => {
    const summaries = projectEvents({
      events: [event("finished"), event("undated"), event("soon"), event("later")],
      revisions: [
        revision("finished"),
        revision("undated", { event_type: "open_call" }),
        revision("soon"),
        revision("later"),
      ],
      schedules: [
        schedule("finished", "2026-04-01T10:00:00.000Z"),
        schedule("soon", "2026-04-20T10:00:00.000Z"),
        schedule("later", "2026-06-20T10:00:00.000Z"),
      ],
      venues,
      now,
    });

    expect(sortByDiscoveryOrder(summaries).map((summary) => summary.id))
      .toEqual(["soon", "later", "undated", "finished"]);
  });
});

describe("openApplications", () => {
  it("lists only open apply Events, soonest deadline first", () => {
    const summaries = projectEvents({
      events: [event("late"), event("soon"), event("closed"), event("show")],
      revisions: [
        revision("late", {
          event_type: "residency",
          application_deadline: "2026-06-01T00:00:00.000Z",
        }),
        revision("soon", {
          event_type: "audition",
          application_deadline: "2026-05-01T00:00:00.000Z",
        }),
        revision("closed", {
          event_type: "open_call",
          application_deadline: "2026-04-01T00:00:00.000Z",
        }),
        revision("show"),
      ],
      schedules: [],
      venues,
      now,
    });

    expect(openApplications(summaries).map((summary) => summary.id))
      .toEqual(["soon", "late"]);
  });
});

describe("sortByDiscoveryOrder", () => {
  it("uses the application deadline for archived apply Events", () => {
    const summaries = projectEvents({
      events: [event("audition"), event("performance")],
      revisions: [
        revision("audition", {
          event_type: "audition",
          application_deadline: "2026-09-01T00:00:00.000Z",
        }),
        revision("performance"),
      ],
      schedules: [
        schedule("audition", "2026-10-10T10:00:00.000Z"),
        schedule("performance", "2026-03-15T10:00:00.000Z"),
      ],
      venues,
      now,
    });

    expect(sortByDiscoveryOrder(summaries).map((summary) => summary.id))
      .toEqual(["audition", "performance"]);
  });
});

describe("calendarDayItems", () => {
  it("places an Event on every Tokyo day it runs and omits Events with no Schedule", () => {
    const summaries = projectEvents({
      events: [event("twice"), event("undated")],
      revisions: [
        revision("twice"),
        revision("undated", {
          event_type: "open_call",
          application_deadline: "2026-05-05T00:00:00.000Z",
        }),
      ],
      schedules: [
        schedule("twice", "2026-05-01T10:00:00.000Z"),
        schedule("twice", "2026-05-03T10:00:00.000Z"),
      ],
      venues,
      now,
    });

    const days = calendarDayItems(calendarEntries({ events: summaries }));
    expect(days.map((day) => day.day)).toEqual(["2026-05-01", "2026-05-03"]);
    expect(days.map((day) => day.items.map((item) => item.entry.event.id))).toEqual([["twice"], ["twice"]]);
    expect(days[0].items[0].schedules.map((item) => item.startsAt)).toEqual(["2026-05-01T10:00:00.000Z"]);
  });

  it("never places an application deadline on the calendar", () => {
    const summaries = projectEvents({
      events: [event("apply")],
      revisions: [revision("apply", {
        event_type: "open_call",
        application_deadline: "2026-05-05T00:00:00.000Z",
      })],
      schedules: [],
      venues,
      now,
    });

    expect(calendarDayItems(calendarEntries({ events: summaries }))).toEqual([]);
  });

  it("orders a day by first start and keeps two shows of one Event in one item", () => {
    const summaries = projectEvents({
      events: [event("late"), event("early")],
      revisions: [revision("late"), revision("early")],
      schedules: [
        schedule("late", "2026-05-01T10:00:00.000Z"),
        schedule("early", "2026-05-01T05:00:00.000Z"),
        schedule("early", "2026-05-01T09:00:00.000Z"),
      ],
      venues,
      now,
    });

    const [day] = calendarDayItems(calendarEntries({ events: summaries }));
    expect(day.items.map((item) => item.entry.event.id)).toEqual(["early", "late"]);
    expect(day.items[0].schedules).toHaveLength(2);
  });
});

describe("calendarEntries", () => {
  it("shows Festival children naming their Festival, never the Festival itself", () => {
    const summaries = projectEvents({
      events: [event("festival"), event("child", { parent_event_id: "festival" })],
      revisions: [revision("festival", { event_type: "festival", title: "Festival" }), revision("child")],
      schedules: [schedule("child", "2026-05-01T10:00:00.000Z")],
      venues,
      now,
    });

    const entries = calendarEntries({ events: summaries });
    expect(entries.map((entry) => entry.event.id)).toEqual(["child"]);
    expect(entries[0].festival).toEqual({ id: "festival", title: "Festival" });
  });

  it("narrows Schedules to the region and the Venue", () => {
    const summaries = projectEvents({
      events: [event("both")],
      revisions: [revision("both")],
      schedules: [
        schedule("both", "2026-05-01T10:00:00.000Z", "venue-tokyo"),
        schedule("both", "2026-05-08T10:00:00.000Z", "venue-kanagawa"),
      ],
      venues,
      now,
    });

    const kanagawa = calendarEntries({ events: summaries, filters: { prefecture: "KANAGAWA" } });
    expect(calendarDayItems(kanagawa).map((day) => day.day)).toEqual(["2026-05-08"]);
    const tokyoVenue = calendarEntries({ events: summaries, filters: { venueId: "venue-tokyo" } });
    expect(calendarDayItems(tokyoVenue).map((day) => day.day)).toEqual(["2026-05-01"]);
    expect(calendarEntries({ events: summaries, filters: { venueId: "elsewhere" } })).toEqual([]);
  });

  it("treats an Event as free only when every Ticket Offer is free", () => {
    const summaries = projectEvents({
      events: [event("free"), event("mixed"), event("none")],
      revisions: [revision("free"), revision("mixed"), revision("none")],
      schedules: [
        schedule("free", "2026-05-01T10:00:00.000Z"),
        schedule("mixed", "2026-05-01T10:00:00.000Z"),
        schedule("none", "2026-05-01T10:00:00.000Z"),
      ],
      venues,
      now,
    });
    const offer = (eventId: string, price_type: string, display_order = 0) => ({
      event_revision_id: `${eventId}-rev`,
      price_type,
      label: null,
      currency: null,
      amount_minor: null,
      min_amount_minor: null,
      max_amount_minor: null,
      display_order,
    });
    const offers = [offer("free", "free"), offer("mixed", "free"), offer("mixed", "fixed", 1)];

    expect(isFreeOffers([])).toBe(false);
    expect(calendarEntries({ events: summaries, offers, filters: { free: true } })
      .map((entry) => entry.event.id)).toEqual(["free"]);
    expect(calendarEntries({ events: summaries, offers })).toHaveLength(3);
  });
});

describe("matchesText", () => {
  const summaries = projectEvents({
    events: [event("yamada"), event("other")],
    revisions: [
      revision("yamada", {
        title: "ソロ公演 Yamada",
        description: "コンテンポラリーダンスの新作",
      }),
      revision("other", { title: "別の公演", description: null }),
    ],
    schedules: [
      schedule("yamada", "2026-05-01T10:00:00.000Z", "venue-tokyo"),
      schedule("other", "2026-05-01T10:00:00.000Z", "venue-kanagawa"),
    ],
    venues,
    organizations: [{ id: "org-1", name: "Fixture Dance Organization" }],
    artistCredits: [{ event_revision_id: "yamada-rev", artist_id: "artist-1" }],
    artists: [{ id: "artist-1", name: "山田太郎" }],
    now,
  });
  const find = (id: string) =>
    summaries.find((summary) => summary.id === id) as (typeof summaries)[number];

  it("searches every field REQ-DISCOVERY-003 names", () => {
    expect(matchesText(find("yamada"), "ソロ公演")).toBe(true);
    expect(matchesText(find("yamada"), "山田")).toBe(true);
    expect(matchesText(find("yamada"), "Tokyo Venue")).toBe(true);
    expect(matchesText(find("yamada"), "Fixture Dance")).toBe(true);
    expect(matchesText(find("yamada"), "コンテンポラリー")).toBe(true);
  });

  // Japanese has no word boundaries, so a prefix of a longer word has to match:
  // a tokenizing index would not find コンテンポラリーダンス from コンテンポラリー.
  it("matches inside a word rather than on a token boundary", () => {
    expect(matchesText(find("yamada"), "ポラリーダ")).toBe(true);
  });

  it("folds width and case before comparing", () => {
    expect(matchesText(find("yamada"), "ＹＡＭＡＤＡ")).toBe(true);
    expect(matchesText(find("yamada"), "yamada")).toBe(true);
  });

  it("requires every term, which may land on different fields", () => {
    expect(matchesText(find("yamada"), "山田 Tokyo")).toBe(true);
    expect(matchesText(find("yamada"), "山田 Kanagawa")).toBe(false);
  });

  it("keeps an Event that matches nothing out", () => {
    expect(matchesText(find("other"), "山田")).toBe(false);
  });

  it("treats a blank search as no search", () => {
    expect(matchesText(find("other"), "   ")).toBe(true);
  });

  it("composes with the other filters", () => {
    expect(matchesFilters(find("yamada"), { text: "山田", prefecture: "TOKYO" })).toBe(true);
    expect(matchesFilters(find("yamada"), { text: "山田", prefecture: "KANAGAWA" })).toBe(false);
    expect(matchesFilters(find("yamada"), { text: "存在しない" })).toBe(false);
  });
});
