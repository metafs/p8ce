import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  dateStrip,
  monthGrid,
  monthLabel,
  pageDays,
  resolveDay,
  resolveMonth,
  weekdayIndex,
  weekStart,
} from "./calendar";

describe("calendar arithmetic", () => {
  it("adds and subtracts days across month and year ends", () => {
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("numbers weekdays from Sunday", () => {
    expect(weekdayIndex("2026-05-03")).toBe(0); // Sunday
    expect(weekdayIndex("2026-05-04")).toBe(1);
    expect(weekdayIndex("2026-05-09")).toBe(6); // Saturday
  });

  it("moves between months across year boundaries", () => {
    expect(addMonths("2026-05", 1)).toBe("2026-06");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-05", -12)).toBe("2025-05");
  });

  it("labels a month in Japanese without zero padding", () => {
    expect(monthLabel("2026-05")).toBe("2026年5月");
    expect(monthLabel("2026-11")).toBe("2026年11月");
  });
});

describe("resolveMonth", () => {
  it("keeps a valid requested month", () => {
    expect(resolveMonth("2026-05")).toBe("2026-05");
  });

  it("falls back to the current Tokyo month", () => {
    // 2026-05-31T16:00Z is already 2026-06-01 in Tokyo.
    const now = new Date("2026-05-31T16:00:00.000Z");

    expect(resolveMonth(null, now)).toBe("2026-06");
    expect(resolveMonth("2026-5", now)).toBe("2026-06");
    expect(resolveMonth("not-a-month", now)).toBe("2026-06");
  });
});

describe("monthGrid", () => {
  it("covers the month in whole Sunday-first weeks", () => {
    const grid = monthGrid("2026-05");

    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0][0].day).toBe("2026-04-26"); // the Sunday before 1 May
    expect(grid.weeks.at(-1)?.at(-1)?.day).toBe("2026-06-06");
    expect(grid.firstDay).toBe("2026-05-01");
    expect(grid.lastDay).toBe("2026-05-31");
  });

  it("marks which cells belong to the month itself", () => {
    const grid = monthGrid("2026-05");
    const inMonth = grid.weeks.flat().filter((cell) => cell.inMonth);

    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].day).toBe("2026-05-01");
    expect(inMonth.at(-1)?.day).toBe("2026-05-31");
  });

  it("produces consecutive days with no gaps or repeats", () => {
    const days = monthGrid("2026-05").weeks.flat().map((cell) => cell.day);

    expect(new Set(days).size).toBe(days.length);
    for (let index = 1; index < days.length; index += 1) {
      expect(days[index]).toBe(addDays(days[index - 1], 1));
    }
  });

  it("handles a month that starts on a Sunday and one that ends on a Saturday", () => {
    const startsSunday = monthGrid("2026-02"); // 2026-02-01 is a Sunday
    const endsSaturday = monthGrid("2026-10"); // 2026-10-31 is a Saturday

    expect(startsSunday.weeks[0][0].day).toBe("2026-02-01");
    expect(endsSaturday.weeks.at(-1)?.at(-1)?.day).toBe("2026-10-31");
  });

  it("links to the neighbouring months", () => {
    const grid = monthGrid("2026-01");

    expect(grid.previousMonth).toBe("2025-12");
    expect(grid.nextMonth).toBe("2026-02");
  });
});

describe("day view", () => {
  it("starts from a valid requested day and otherwise from today in Tokyo", () => {
    const now = new Date("2026-09-27T16:00:00.000Z"); // 2026-09-28 01:00 in Tokyo
    expect(resolveDay("2026-10-03", now)).toBe("2026-10-03");
    expect(resolveDay("2026-02-30", now)).toBe("2026-09-28");
    expect(resolveDay("tomorrow", now)).toBe("2026-09-28");
    expect(resolveDay(null, now)).toBe("2026-09-28");
  });

  it("builds a Sunday-first strip of four weeks", () => {
    expect(weekStart("2026-09-28")).toBe("2026-09-27");
    expect(weekStart("2026-09-27")).toBe("2026-09-27");
    const strip = dateStrip("2026-09-27");
    expect(strip).toHaveLength(28);
    expect(strip[0]).toBe("2026-09-27");
    expect(strip[27]).toBe("2026-10-24");
  });

  it("pages whole days until the limit is reached", () => {
    const days = [
      { day: "2026-09-30", items: [1] },
      { day: "2026-10-01", items: [1, 2] },
      { day: "2026-10-02", items: [1, 2, 3] },
      { day: "2026-10-03", items: [1] },
    ];

    expect(pageDays(days, "2026-10-01", 4)).toEqual({ days: [days[1], days[2]], nextDay: "2026-10-03" });
    expect(pageDays(days, "2026-10-01", 10)).toEqual({ days: [days[1], days[2], days[3]], nextDay: null });
    expect(pageDays(days, "2026-11-01", 4)).toEqual({ days: [], nextDay: null });
  });
});
