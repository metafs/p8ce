import { expect, test } from "@playwright/test";

// The anonymous critical journey for M5. Every step runs signed out: nothing
// here may depend on a session, and the fixtures come from supabase/seed.sql so
// the boundaries REQ-DISCOVERY-001 to 003 and REQ-EVENT-007 describe are
// reproducible rather than built through the UI first.

const multiVenue = "フィクスチャ 複数会場公演";
const openCall = "フィクスチャ 公募";
const festival = "フィクスチャ フェスティバル";
const festivalChild = "フィクスチャ フェスティバル参加公演";
const pastEvent = "フィクスチャ 過去公演";
const cancelledEvent = "フィクスチャ 中止公演";

const multiVenueId = "e0000001-0000-4000-8000-000000000001";
const festivalId = "e0000003-0000-4000-8000-000000000003";
const cancelledId = "e0000006-0000-4000-8000-000000000006";
const artistId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const kanagawaVenueId = "dddd0002-dddd-4ddd-8ddd-dddddddddddd";

test("a Visitor discovers Events without signing in", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/events");
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();
  await expect(page.getByRole("link", { name: openCall })).toBeVisible();

  // REQ-EVENT-007: past and cancelled Events stay listed, with their state.
  await expect(page.getByRole("link", { name: pastEvent })).toBeVisible();
  await expect(page.getByRole("link", { name: cancelledEvent })).toBeVisible();

  // REQ-DISCOVERY-002: region comes from each Schedule's Venue, so an Event
  // with Schedules in both Prefectures answers to either filter.
  await page.goto("/events?prefecture=TOKYO");
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();
  await page.goto("/events?prefecture=KANAGAWA");
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();

  // …and one Schedule has to satisfy the region and the date together: the
  // Kanagawa Schedule is a week after the Tokyo one.
  await page.goto("/events?prefecture=KANAGAWA&from=2030-05-08&to=2030-05-08");
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();
  await page.goto("/events?prefecture=KANAGAWA&from=2030-05-01&to=2030-05-01");
  await expect(page.getByRole("link", { name: multiVenue })).toHaveCount(0);

  // REQ-EVENT-003: a Schedule-free apply Event is a normal published state, and
  // it belongs to no region and no date.
  await page.goto("/events?prefecture=TOKYO");
  await expect(page.getByRole("link", { name: openCall })).toHaveCount(0);
  await page.goto("/events?type=open_call");
  await expect(page.getByRole("link", { name: openCall })).toBeVisible();

  // REQ-DISCOVERY-003: apply Events get a deadline-ordered listing of their own.
  await page.goto("/open-calls");
  await expect(page.getByRole("heading", { name: "募集中" })).toBeVisible();
  await expect(page.getByRole("link", { name: openCall })).toBeVisible();

  // REQ-DISCOVERY-001: only Schedules place an Event on the Calendar, so the
  // apply Event's deadline never appears there.
  await page.goto("/calendar?month=2030-07");
  await expect(page.getByRole("link", { name: festivalChild })).toBeVisible();
  await page.goto("/calendar?month=2030-06");
  await expect(page.getByRole("link", { name: openCall })).toHaveCount(0);

  // The day view lists a Festival's child Event on its day and names the
  // Festival, but never lists the Festival itself as a row (REQ-DISCOVERY-001).
  await page.goto("/calendar?from=2030-07-03");
  await expect(page.getByRole("heading", { name: "7.03 水曜日から" })).toBeVisible();
  await expect(page.getByRole("link", { name: festivalChild })).toBeVisible();
  await expect(page.getByRole("link", { name: festival, exact: true })).toBeVisible();
  await expect(page.locator(".row-title", { hasText: new RegExp(`^${festival}$`) })).toHaveCount(0);
  await page.goto("/calendar?view=month&month=2030-07");
  await expect(page.getByRole("link", { name: festivalChild })).toBeVisible();
});

test("a Visitor sees Festival structure, archive, and cancellation", async ({ page }) => {
  test.setTimeout(120_000);

  // ADR-0009: a Festival carries no Schedules of its own and shows the
  // programme its published children make up.
  await page.goto(`/events/${festivalId}`);
  await expect(page.getByRole("heading", { name: festival })).toBeVisible();
  await expect(page.getByRole("heading", { name: "プログラム" })).toBeVisible();
  const childLink = page.getByRole("link", { name: festivalChild });
  await expect(childLink).toBeVisible();

  // …and the child names the Festival it belongs to.
  await childLink.click();
  await expect(page.getByRole("heading", { name: festivalChild })).toBeVisible();
  await expect(page.getByRole("heading", { name: "フェスティバル", exact: true, level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: festival })).toBeVisible();

  // REQ-EVENT-007: a cancelled Event stays public and states why.
  await page.goto(`/events/${cancelledId}`);
  await expect(page.getByRole("heading", { name: cancelledEvent })).toBeVisible();
  await expect(page.getByText("会場の都合により中止します。")).toBeVisible();
  await expect(page.getByText("中止", { exact: true })).toBeVisible();

  // REQ-EVENT-002: the 主催 Organization is readable without signing in.
  await expect(page.getByText("Fixture Dance Organization")).toBeVisible();
});

test("a Visitor reaches Events through Artist and Venue pages", async ({ page }) => {
  test.setTimeout(120_000);

  // REQ-ARTIST-001 and REQ-VENUE-001 put both on the public surface, each
  // listing the approved Events it relates to.
  await page.goto(`/artists/${artistId}`);
  await expect(page.getByRole("heading", { name: "Fixture Dance Artist" })).toBeVisible();
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();

  await page.goto(`/venues/${kanagawaVenueId}`);
  await expect(page.getByRole("heading", { name: "Fixture Kanagawa Venue" })).toBeVisible();
  await expect(page.locator(".entity-profile").getByText("神奈川県")).toBeVisible();
  // The Venue relationship is expressed through Schedules, so this Venue lists
  // the Event whose second Schedule is there.
  await expect(page.getByRole("link", { name: multiVenue })).toBeVisible();
});

test("search engines read the approved Event as structured data", async ({ page }) => {
  // DH-26: one schema.org Event per Schedule, so each performance keeps its
  // own date and Venue, with the approved price and credited Artists.
  await page.goto(`/events/${multiVenueId}`);
  const performances = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent() ?? "null",
  );
  expect(performances).toHaveLength(2);
  for (const performance of performances) {
    expect(performance).toMatchObject({
      "@type": "Event",
      name: multiVenue,
      eventStatus: "https://schema.org/EventScheduled",
      organizer: { name: "Fixture Dance Organization" },
      offers: [{ price: "3500", priceCurrency: "JPY" }],
      contributor: [{ name: "Fixture Dance Artist" }],
    });
  }
  expect(performances.map((performance: { location: { address: { addressRegion: string } } }) =>
    performance.location.address.addressRegion).sort()).toEqual(["東京都", "神奈川県"]);

  // A cancelled Event keeps its markup and says so, instead of vanishing.
  await page.goto(`/events/${cancelledId}`);
  const cancelled = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent() ?? "null",
  );
  expect(cancelled).toMatchObject({ name: cancelledEvent, eventStatus: "https://schema.org/EventCancelled" });

  // A Festival takes its dates from its children and lists them.
  await page.goto(`/events/${festivalId}`);
  const festivalData = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent() ?? "null",
  );
  expect(festivalData).toMatchObject({ name: festival, subEvent: [{ name: festivalChild }] });
});

test("nothing unapproved is reachable anonymously", async ({ page }) => {
  // The workspace and the admin queues are behind authentication; a Visitor is
  // sent to the login page rather than shown review data (REQ-AUTH-001).
  await page.goto("/admin/events");
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/login/);
});
