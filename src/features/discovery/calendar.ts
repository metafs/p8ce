import { tokyoDateKey } from "@/lib/datetime";

const monthPattern = /^\d{4}-\d{2}$/;
const dayInMilliseconds = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/**
 * Calendar arithmetic on `YYYY-MM-DD` strings, done in UTC so that the result
 * never depends on the server's own time zone. The strings are Tokyo calendar
 * days; UTC is only the arithmetic frame.
 */
function dayNumber(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function dayString(value: number) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDays(day: string, days: number) {
  return dayString(dayNumber(day) + days * dayInMilliseconds);
}

/** 0 is Sunday, matching the column order of the rendered grid. */
export function weekdayIndex(day: string) {
  return new Date(dayNumber(day)).getUTCDay();
}

export function addMonths(month: string, months: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const zeroBased = (year * 12) + (monthNumber - 1) + months;
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`;
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}

/**
 * The month a Calendar opens on: the requested one when it is a valid
 * `YYYY-MM`, otherwise the current Tokyo month, so the default view is
 * "what is happening now" in the platform's own time zone.
 */
export function resolveMonth(requested: string | null | undefined, now = new Date()) {
  if (requested && monthPattern.test(requested)) return requested;

  const today = tokyoDateKey(now.toISOString());
  return today ? today.slice(0, 7) : "";
}

export type CalendarGrid = {
  month: string;
  label: string;
  previousMonth: string;
  nextMonth: string;
  firstDay: string;
  lastDay: string;
  weeks: { day: string; inMonth: boolean }[][];
};

/**
 * A Sunday-first grid covering the whole month, padded with the adjacent
 * months' days so every week has seven cells.
 */
export function monthGrid(month: string): CalendarGrid {
  const firstOfMonth = `${month}-01`;
  const nextMonth = addMonths(month, 1);
  const lastOfMonth = addDays(`${nextMonth}-01`, -1);

  const gridStart = addDays(firstOfMonth, -weekdayIndex(firstOfMonth));
  const gridEnd = addDays(lastOfMonth, 6 - weekdayIndex(lastOfMonth));

  const weeks: CalendarGrid["weeks"] = [];
  let cursor = gridStart;

  while (dayNumber(cursor) <= dayNumber(gridEnd)) {
    const week: CalendarGrid["weeks"][number] = [];
    for (let column = 0; column < 7; column += 1) {
      week.push({ day: cursor, inMonth: cursor.startsWith(`${month}-`) });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return {
    month,
    label: monthLabel(month),
    previousMonth: addMonths(month, -1),
    nextMonth,
    firstDay: firstOfMonth,
    lastDay: lastOfMonth,
    weeks,
  };
}

export const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Days in the date strip of the day view: four weeks, Sunday first. */
export const dateStripLength = 28;

/** Whether a string is a real `YYYY-MM-DD` calendar day (2026-02-30 is not). */
export function isCalendarDay(value: string | null | undefined): value is string {
  return Boolean(value && dayPattern.test(value) && dayString(dayNumber(value)) === value);
}

/**
 * The day a day view starts from: the requested one when it is a valid
 * `YYYY-MM-DD`, otherwise today in Tokyo.
 */
export function resolveDay(requested: string | null | undefined, now = new Date()) {
  if (isCalendarDay(requested)) return requested;
  return tokyoDateKey(now.toISOString()) ?? "";
}

/**
 * The Sunday on or before a day. The date strip always starts here, so a
 * requested strip start is aligned to its week before it is rendered.
 */
export function weekStart(day: string) {
  return addDays(day, -weekdayIndex(day));
}

/** The days of the date strip that starts on `start`. */
export function dateStrip(start: string, length = dateStripLength) {
  return Array.from({ length }, (_, index) => addDays(start, index));
}

/**
 * The day groups one page of the day view shows: every day from `from` on,
 * whole days only, until at least `limit` rows are shown. `nextDay` is where
 * the following page starts, or null when nothing is left.
 */
export function pageDays<T extends { day: string; items: readonly unknown[] }>(
  days: readonly T[],
  from: string,
  limit: number,
): { days: T[]; nextDay: string | null } {
  const shown: T[] = [];
  let count = 0;

  for (const entry of days) {
    if (entry.day < from || entry.items.length === 0) continue;
    if (count >= limit) return { days: shown, nextDay: entry.day };
    shown.push(entry);
    count += entry.items.length;
  }

  return { days: shown, nextDay: null };
}
