import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// DH-13: the critical journeys meet WCAG 2.2 AA as far as axe can tell, stay
// usable by keyboard, and reflow at 320 CSS px. Rules the design follows are
// in docs/design/ui.md (アクセシビリティ).

const password = "DanceHub123!";
const organizationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const multiVenueId = "e0000001-0000-4000-8000-000000000001";

const publicPages = [
  "/",
  "/events",
  "/events?prefecture=TOKYO&type=performance",
  "/calendar",
  "/calendar?month=2030-05",
  "/calendar?from=2030-07-03",
  "/open-calls",
  `/events/${multiVenueId}`,
  "/events/e0000003-0000-4000-8000-000000000003",
  "/events/e0000006-0000-4000-8000-000000000006",
  "/artists/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "/venues/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "/listing-policy",
  "/terms",
  "/privacy",
  "/operator",
  "/listing-requests?kind=withdrawal",
  "/login",
  "/login?error=invalid-credentials",
  "/password/forgot",
  "/password/forgot?sent=1",
  "/events/00000000-0000-4000-8000-000000000000",
];

const organizerPages = [
  "/workspace",
  `/workspace/${organizationId}`,
  `/workspace/${organizationId}/events`,
  `/workspace/${organizationId}/events/new`,
  `/workspace/${organizationId}/events/${multiVenueId}`,
  `/workspace/${organizationId}/entities`,
  `/workspace/${organizationId}/settings`,
  "/workspace/notifications",
  "/account/password",
];

const adminPages = ["/admin/applications", "/admin/entities", "/admin/events", "/admin/withdrawals", "/admin/invitations"];

async function expectNoViolations(page: Page, path: string) {
  await page.goto(path);
  // The skip link on every page needs a main landmark to land on.
  await expect(page.locator("main#main-content"), `main landmark on ${path}`).toHaveCount(1);
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // The Next.js development indicator is not part of the product.
    .exclude("nextjs-portal")
    .analyze();
  const summary = violations.map((violation) =>
    `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  expect(summary, `axe violations on ${path}`).toEqual([]);
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/workspace/);
}

for (const [name, width] of [["desktop", 1280], ["mobile", 390]] as const) {
  test.describe(`${name} (${width}px)`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("public pages have no axe violations", async ({ page }) => {
      test.setTimeout(180_000);
      for (const path of publicPages) await expectNoViolations(page, path);
    });

    test("organizer pages have no axe violations", async ({ page }) => {
      test.setTimeout(180_000);
      await login(page, "owner@example.com");
      for (const path of organizerPages) await expectNoViolations(page, path);
    });

    test("admin pages have no axe violations", async ({ page }) => {
      test.setTimeout(180_000);
      await login(page, "admin@example.com");
      for (const path of adminPages) await expectNoViolations(page, path);
    });
  });
}

test.describe("320px reflow", () => {
  test.use({ viewport: { width: 320, height: 800 } });

  test("pages do not scroll sideways outside a table frame", async ({ page }) => {
    test.setTimeout(180_000);
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    for (const path of publicPages) {
      await page.goto(path);
      expect(await overflow(), `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
    await login(page, "owner@example.com");
    for (const path of organizerPages) {
      await page.goto(path);
      expect(await overflow(), `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
    }
  });
});

test("keyboard focus is visible and returns to the first error", async ({ page }) => {
  // A focused control draws the outline docs/design/ui.md specifies.
  await page.goto("/events");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as Element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline.style).not.toBe("none");
  expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

  // A wide table's frame can be reached and scrolled by keyboard.
  await login(page, "owner@example.com");
  await page.goto(`/workspace/${organizationId}/entities`);
  const frame = page.getByRole("region", { name: "登録済みの出演者", exact: true });
  await frame.focus();
  await expect(frame).toBeFocused();

  // After a submission comes back with errors, focus lands on the first
  // invalid field, which names its error.
  await page.goto(`/workspace/${organizationId}/events/new`);
  await page.getByRole("button", { name: "下書きを作成" }).click();
  const title = page.getByLabel("Event名");
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription("Event名を入力してください。");
});

test("the skip link is the first stop and moves past the header", async ({ page }) => {
  await page.goto("/events");
  const skip = page.getByRole("link", { name: "本文へスキップ" });
  await expect(skip).not.toBeInViewport();

  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await page.keyboard.press("Tab");
  const inMain = await page.evaluate(() => Boolean(document.activeElement?.closest("main")));
  expect(inMain).toBe(true);
});

// WCAG 1.4.11: an empty field is identified only by its border, so the border
// keeps 3:1 against the surface it sits on, on the public and the workspace ground.
async function fieldBorderContrast(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((field) => {
    const channels = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color: string) => {
      const [r, g, b] = channels(color).map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let surface = field.parentElement;
    while (surface && getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)") surface = surface.parentElement;
    const border = luminance(getComputedStyle(field).borderTopColor);
    const ground = luminance(surface ? getComputedStyle(surface).backgroundColor : "rgb(255, 255, 255)");
    return (Math.max(border, ground) + 0.05) / (Math.min(border, ground) + 0.05);
  });
}

test("field borders keep 3:1 against their surface", async ({ page }) => {
  await page.goto("/login");
  expect(await fieldBorderContrast(page, "input[name=email]")).toBeGreaterThanOrEqual(3);

  await login(page, "owner@example.com");
  await page.goto(`/workspace/${organizationId}/events/new`);
  expect(await fieldBorderContrast(page, "input[name=title]")).toBeGreaterThanOrEqual(3);
});

// Between phone and wide desktop, a row's fixed columns once left the title no
// room at all, and it overlapped the venue beside it. A list too narrow for
// them switches to the stacked arrangement (docs/design/ui.md).
test("listing rows keep room for the title at every width", async ({ page }) => {
  test.setTimeout(180_000);
  const paths = ["/", "/events", "/open-calls", "/venues/dddddddd-dddd-4ddd-8ddd-dddddddddddd"];
  for (const width of [760, 900, 1000, 1100, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      const narrowest = await page.evaluate(() => Math.min(
        ...[...document.querySelectorAll(".row-main")].map((main) => main.getBoundingClientRect().width),
      ));
      expect(narrowest, `title column on ${path} at ${width}px`).toBeGreaterThanOrEqual(96);
    }
  }
});
