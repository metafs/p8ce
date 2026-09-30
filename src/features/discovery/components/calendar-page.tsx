import Link from "next/link";

import {
  accessLinkKindLabel,
  eventTypeOptions,
  ticketOfferPrice,
  type TicketPriceType,
} from "@/features/revisions/schema";
import { dayLabel, tokyoDateKey } from "@/lib/datetime";
import { DayGroup, DayGroups } from "@/ui/day-group";
import { EmptyState } from "@/ui/empty-state";
import { ListRow, RowList } from "@/ui/list-row";
import { Segmented } from "@/ui/segmented";

import {
  addDays,
  dateStrip,
  monthGrid,
  pageDays,
  resolveDay,
  resolveMonth,
  weekdayLabels,
  weekStart,
} from "../calendar";
import {
  calendarHref,
  hasCalendarFilter,
  parseCalendarQuery,
  prefectures,
  type CalendarQuery,
} from "../filters";
import {
  prefectureLabel,
  type CalendarDay,
  type CalendarDayItem,
  type Prefecture,
} from "../projection";
import { listCalendarDays } from "../queries";
import { eventDetailLine, PublicationStateLabel, scheduleTime } from "./event-row";

/** Rows on one page of the day view; whole days are never split. */
const dayViewPageSize = 20;

type VenueOption = { id: string; name: string; prefecture: Prefecture };

/** Only what filters the list travels between views and pages. */
function filtersOf(query: CalendarQuery) {
  return {
    prefecture: query.prefecture,
    eventType: query.eventType,
    venueId: query.venueId,
    free: query.free,
  };
}

/** `8月`, or `2025年12月` when the neighbouring month is in another year. */
function neighbourLabel(month: string, current: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return month.slice(0, 4) === current.slice(0, 4) ? `${monthNumber}月` : `${year}年${monthNumber}月`;
}

function shortWeekday(day: string) {
  return dayLabel(day)?.weekday.slice(0, 1) ?? "";
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseCalendarQuery(await searchParams);
  const today = resolveDay(null);
  const { days, venues } = await listCalendarDays({
    prefecture: query.prefecture,
    eventType: query.eventType,
    venueId: query.venueId,
    free: query.free,
  });

  const month = resolveMonth(query.month);
  const from = resolveDay(query.from);
  const dayViewFrom = today.startsWith(`${month}-`) ? today : `${month}-01`;

  return (
    <div className="container">
      <div className="page-head calendar-head">
        <div className="calendar-head-text">
          <h1 className="page-title">カレンダー</h1>
          <p className="page-lede">いつ、どこで、どんな上演があるか。開催日の順に並べています。</p>
          <p className="section-note">応募締切は含みません。日時は日本時間です。</p>
        </div>
        <nav aria-label="表示の切り替え" className="view-switch">
          {query.view === "day" ? (
            <span aria-current="page">日ごと</span>
          ) : (
            <Link href={calendarHref({ ...filtersOf(query), view: "day", from: dayViewFrom })}>日ごと</Link>
          )}
          {query.view === "month" ? (
            <span aria-current="page">月</span>
          ) : (
            <Link href={calendarHref({ ...filtersOf(query), view: "month", month: from.slice(0, 7) })}>月</Link>
          )}
        </nav>
      </div>

      {query.view === "month" ? (
        <MonthView days={days} month={month} query={query} today={today} venues={venues} />
      ) : (
        <DayView days={days} from={from} query={query} today={today} venues={venues} />
      )}
    </div>
  );
}

function CalendarFilterForm({
  query,
  venues,
  hidden,
}: {
  query: CalendarQuery;
  venues: readonly VenueOption[];
  hidden: Record<string, string>;
}) {
  const clearHref = calendarHref({
    view: query.view,
    from: hidden.from ?? null,
    month: hidden.month ?? null,
  });

  return (
    <form action="/calendar" aria-label="絞り込み" className="calendar-filters" method="get">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} name={name} type="hidden" value={value} />
      ))}
      <Segmented
        legend="地域"
        name="prefecture"
        options={[
          { value: "", label: "すべて" },
          ...prefectures.map((prefecture) => ({ value: prefecture, label: prefectureLabel(prefecture) })),
        ]}
        value={query.prefecture ?? ""}
      />
      <div className="field">
        <label className="filter-label" htmlFor="calendar-type">種別</label>
        <select defaultValue={query.eventType ?? ""} id="calendar-type" name="type">
          <option value="">すべて</option>
          {/* A Festival never appears itself; its child Events do (REQ-DISCOVERY-001). */}
          {eventTypeOptions.filter((option) => option.value !== "festival").map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="field calendar-filter-venue">
        <label className="filter-label" htmlFor="calendar-venue">会場</label>
        <select defaultValue={query.venueId ?? ""} id="calendar-venue" name="venue">
          <option value="">すべての会場</option>
          {prefectures.map((prefecture) => {
            const options = venues.filter((venue) => venue.prefecture === prefecture);
            return options.length ? (
              <optgroup key={prefecture} label={prefectureLabel(prefecture)}>
                {options.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
      </div>
      <fieldset className="field">
        <legend className="filter-legend">料金</legend>
        <label className="choice calendar-filter-free">
          <input defaultChecked={query.free} name="free" type="checkbox" value="1" />
          無料のみ
        </label>
      </fieldset>
      <div className="button-row">
        <button className="button" type="submit">絞り込む</button>
        {hasCalendarFilter(query) ? <Link className="text-link" href={clearHref}>条件をクリア</Link> : null}
      </div>
    </form>
  );
}

function DateStrip({
  counts,
  from,
  query,
  start,
  today,
}: {
  counts: ReadonlyMap<string, number>;
  from: string;
  query: CalendarQuery;
  start: string;
  today: string;
}) {
  const strip = dateStrip(weekStart(start));
  const filters = filtersOf(query);

  return (
    <nav aria-labelledby="date-strip-title" className="date-strip">
      <div className="date-strip-head">
        <h2 className="date-strip-title" id="date-strip-title">日付から</h2>
        <p className="section-note">予定のある日を選ぶと、その日から並びます。</p>
      </div>
      <div className="date-strip-body">
        <Link
          aria-label="前の週"
          className="button button-quiet date-strip-step"
          href={calendarHref({ ...filters, view: "day", from, strip: addDays(start, -7) })}
        >
          ←
        </Link>
        {/*
          The strip scrolls sideways on a narrow screen. Like a wide table it
          takes focus, so the keyboard can scroll it even when no day in view
          is a link (WCAG 2.1.1; axe scrollable-region-focusable).
        */}
        <div aria-label="日付" className="date-strip-scroll" role="region" tabIndex={0}>
          <ol className="date-strip-days">
            {strip.map((day, index) => {
              const [, monthNumber, date] = day.split("-").map(Number);
              const label = dayLabel(day);
              const isToday = day === today;
              const selected = day === from;
              const hasItems = (counts.get(day) ?? 0) > 0;
              const inner = (
                <>
                  <span className="date-strip-date">{date}</span>
                  <span className="date-strip-weekday">{shortWeekday(day)}</span>
                  <span className="date-strip-today">{isToday ? "今日" : ""}</span>
                </>
              );

              return (
                <li data-sunday={index > 0 && label?.weekday === "日曜日"} key={day}>
                  <span aria-hidden="true" className="date-strip-month">
                    {index === 0 || date === 1 ? `${monthNumber}月` : ""}
                  </span>
                  {hasItems ? (
                    <Link
                      aria-current={selected ? "true" : undefined}
                      aria-label={`${monthNumber}月${date}日 ${label?.weekday ?? ""}${isToday ? "（今日）" : ""}`}
                      className="date-strip-day"
                      data-selected={selected}
                      href={calendarHref({ ...filters, view: "day", from: day, strip: start })}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <span className="date-strip-day" data-empty="true" data-selected={selected}>
                      <span className="visually-hidden">{`${monthNumber}月${date}日 ${label?.weekday ?? ""}、予定なし`}</span>
                      <span aria-hidden="true" className="date-strip-day-inner">{inner}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <Link
          aria-label="次の週"
          className="button button-quiet date-strip-step"
          href={calendarHref({ ...filters, view: "day", from, strip: addDays(start, 7) })}
        >
          →
        </Link>
      </div>
    </nav>
  );
}

function DayView({
  days,
  from,
  query,
  today,
  venues,
}: {
  days: readonly CalendarDay[];
  from: string;
  query: CalendarQuery;
  today: string;
  venues: readonly VenueOption[];
}) {
  const counts = new Map(days.map((day) => [day.day, day.items.length]));
  const page = pageDays(days, from, dayViewPageSize);
  const shown = page.days.reduce((sum, day) => sum + day.items.length, 0);
  const fromLabel = dayLabel(from);
  const filters = filtersOf(query);

  return (
    <>
      <DateStrip
        counts={counts}
        from={from}
        query={query}
        start={query.strip ?? weekStart(from)}
        today={today}
      />

      <CalendarFilterForm hidden={{ from }} query={query} venues={venues} />

      <div className="calendar-results-head">
        <h2>{fromLabel ? `${fromLabel.monthDay} ${fromLabel.weekday}から` : null}</h2>
        {shown ? <p className="calendar-results-count">{shown}件</p> : null}
        {from !== today ? (
          <Link className="text-link calendar-results-today" href={calendarHref({ ...filters, view: "day", from: today })}>
            今日に戻る
          </Link>
        ) : null}
      </div>

      {page.days.length ? (
        <DayGroups>
          {page.days.map((day) => {
            const label = dayLabel(day.day);
            const year = label && String(label.year) !== today.slice(0, 4) ? `${label.year}年 · ` : "";
            return (
              <DayGroup
                date={label?.monthDay}
                key={day.day}
                sub={`${year}${label?.weekday ?? ""}${day.day === today ? " · 今日" : ""}`}
              >
                <RowList label={`${label?.monthDay ?? ""} ${label?.weekday ?? ""}の予定`}>
                  {day.items.map((item) => (
                    <CalendarDayRow day={day.day} item={item} key={item.entry.event.id} />
                  ))}
                </RowList>
              </DayGroup>
            );
          })}
        </DayGroups>
      ) : (
        <EmptyState>
          この条件に合う予定は、{fromLabel ? `${fromLabel.monthDay} ${fromLabel.weekday}` : "この日"}からあとにはありません。
        </EmptyState>
      )}

      {page.nextDay ? (
        <div className="calendar-more">
          <Link className="button tabular" href={calendarHref({ ...filters, view: "day", from: page.nextDay })}>
            {dayLabel(page.nextDay)?.monthDay} 以降を表示
          </Link>
        </div>
      ) : page.days.length ? (
        <p className="calendar-end section-note">これより先の予定は、まだ登録されていません。</p>
      ) : null}
    </>
  );
}

/**
 * One Event on one day of the day view. The row reads like every other
 * listing; the details under it open without JavaScript (`<details>`), with
 * the Event's other dates, how to take part and the Venue.
 */
function CalendarDayRow({ day, item }: { day: string; item: CalendarDayItem }) {
  const { entry, schedules } = item;
  const { event } = entry;
  const cancelled = event.state === "cancelled";
  const detailLine = eventDetailLine(event);
  const venuesOfDay = [...new Map(schedules.map((schedule) => [schedule.venueId, schedule])).values()];
  const others = event.schedules.filter((schedule) => tokyoDateKey(schedule.startsAt) !== day);

  return (
    <ListRow
      aside={venuesOfDay.map((schedule) => (
        <Link href={`/venues/${schedule.venueId}`} key={schedule.venueId}>{schedule.venueName}</Link>
      ))}
      asideSub={[...new Set(venuesOfDay.map((schedule) => prefectureLabel(schedule.prefecture)))].join("・")}
      detail={detailLine || entry.festival ? (
        <>
          {detailLine ? <span className="calendar-detail-line">{detailLine}</span> : null}
          {entry.festival ? (
            <span className="calendar-detail-line">
              フェスティバル　<Link className="text-link" href={`/events/${entry.festival.id}`}>{entry.festival.title}</Link>
            </span>
          ) : null}
        </>
      ) : null}
      extra={(
        <details className="calendar-details">
          <summary className="calendar-details-summary">
            詳細<span className="visually-hidden">：{event.title}</span>
          </summary>
          <div className="calendar-details-body">
            <div className="calendar-details-block">
              <span className="detail-aside-label">ほかの日程</span>
              {others.length ? (
                <ul className="calendar-details-list tabular">
                  {others.map((schedule) => {
                    const otherDay = tokyoDateKey(schedule.startsAt) ?? "";
                    return (
                      <li key={`${schedule.startsAt}-${schedule.venueId}`}>
                        {dayLabel(otherDay)?.monthDay} {shortWeekday(otherDay)}　{scheduleTime(schedule)}　{schedule.venueName}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">ほかの日程はありません。</p>
              )}
            </div>
            <div className="calendar-details-block">
              <span className="detail-aside-label">参加方法</span>
              {entry.offers.length ? (
                <ul className="calendar-details-list">
                  {entry.offers.map((offer) => {
                    const price = ticketOfferPrice({
                      price_type: offer.price_type as TicketPriceType,
                      label: offer.label,
                      currency: offer.currency,
                      amount_minor: offer.amount_minor == null ? null : String(offer.amount_minor),
                      min_amount_minor: offer.min_amount_minor == null ? null : String(offer.min_amount_minor),
                      max_amount_minor: offer.max_amount_minor == null ? null : String(offer.max_amount_minor),
                      notes: null,
                    });
                    return (
                      <li className="calendar-offer" key={offer.display_order}>
                        <span>{offer.label || price}</span>
                        {offer.label ? <span className="offer-price">{price}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">上演のページをご覧ください。</p>
              )}
            </div>
            <div className="calendar-details-block">
              <span className="detail-aside-label">会場</span>
              {venuesOfDay.map((schedule) => (
                <span key={schedule.venueId}>
                  <Link className="text-link" href={`/venues/${schedule.venueId}`}>{schedule.venueName}</Link>
                  <span className="muted">　{prefectureLabel(schedule.prefecture)}</span>
                </span>
              ))}
            </div>
            <div className="calendar-details-actions">
              {cancelled ? <p className="notice notice-rule">この上演は中止になりました。</p> : null}
              <div className="button-row">
                <Link className="button button-primary" href={`/events/${event.id}`}>上演のページへ</Link>
                {cancelled ? null : entry.accessLinks.map((link) => (
                  <a
                    className="button"
                    href={link.url}
                    key={`${link.kind}-${link.display_order}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {link.label || accessLinkKindLabel(link.kind)}
                    <span aria-hidden="true">↗</span>
                  </a>
                ))}
                {!cancelled && entry.accessLinks.length ? <span className="section-note">外部のサイトに移動します</span> : null}
              </div>
            </div>
          </div>
        </details>
      )}
      kind={(
        <>
          {event.typeLabel}
          {entry.free ? <span className="calendar-kind-sub">無料</span> : null}
        </>
      )}
      labels={<PublicationStateLabel state={event.state} />}
      lead={schedules.map((schedule) => (
        <span className="calendar-time" key={schedule.startsAt}>{scheduleTime(schedule)}</span>
      ))}
      title={<Link className="row-title" href={`/events/${event.id}`}>{event.title}</Link>}
    />
  );
}

/** Items a month cell lists before pointing to the day view for the rest. */
const monthCellLimit = 3;

function MonthView({
  days,
  month,
  query,
  today,
  venues,
}: {
  days: readonly CalendarDay[];
  month: string;
  query: CalendarQuery;
  today: string;
  venues: readonly VenueOption[];
}) {
  const grid = monthGrid(month);
  const itemsByDay = new Map(days.map((entry) => [entry.day, entry.items]));
  const filters = filtersOf(query);

  return (
    <>
      <div className="calendar-toolbar">
        <div className="calendar-month-nav">
          <Link
            className="button button-quiet button-small"
            href={calendarHref({ ...filters, view: "month", month: grid.previousMonth })}
          >
            ← {neighbourLabel(grid.previousMonth, month)}
          </Link>
          <h2>{grid.label}</h2>
          <Link
            className="button button-quiet button-small"
            href={calendarHref({ ...filters, view: "month", month: grid.nextMonth })}
          >
            {neighbourLabel(grid.nextMonth, month)} →
          </Link>
        </div>
        <p className="section-note">日付を選ぶと、その日からの「日ごと」を開きます。</p>
      </div>

      <CalendarFilterForm hidden={{ view: "month", month }} query={query} venues={venues} />

      {/*
        One table serves every width: on a narrow screen the stylesheet turns
        it into a list of the days that have Events, so no Event is rendered
        twice.
      */}
      <table className="calendar">
        <caption className="visually-hidden">{grid.label}のEvent（日本時間）</caption>
        <thead>
          <tr>
            {weekdayLabels.map((weekday) => <th key={weekday} scope="col">{weekday}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week) => (
            <tr key={week[0].day}>
              {week.map((cell) => {
                const items = cell.inMonth ? itemsByDay.get(cell.day) ?? [] : [];
                const label = dayLabel(cell.day);
                const date = Number(cell.day.slice(-2));
                const dayHref = calendarHref({ ...filters, view: "day", from: cell.day });
                const rest = items.length - monthCellLimit;

                return (
                  <td
                    aria-current={cell.day === today ? "date" : undefined}
                    data-empty={items.length === 0}
                    data-in-month={cell.inMonth}
                    key={cell.day}
                  >
                    <p className="calendar-day">
                      {items.length ? (
                        <Link
                          aria-label={`${label?.monthDay ?? ""} ${label?.weekday ?? ""}からの日ごとを見る`}
                          href={dayHref}
                        >
                          {cell.day === today ? `${date}（今日）` : date}
                        </Link>
                      ) : (
                        <span>{label ? (cell.day === today ? `${date}（今日）` : date) : ""}</span>
                      )}
                      <span className="calendar-day-weekday">{label?.weekday}</span>
                    </p>
                    {items.length ? (
                      <ul className="calendar-events">
                        {items.slice(0, monthCellLimit).map((item) => (
                          <li key={item.entry.event.id}>
                            <Link href={`/events/${item.entry.event.id}`}>{item.entry.event.title}</Link>
                            <span className="calendar-event-meta">
                              {[
                                item.schedules.map(scheduleTime).join(" / "),
                                item.entry.event.typeLabel,
                                item.entry.event.state === "cancelled" ? "中止" : null,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {rest > 0 ? (
                      <Link className="calendar-more-link" href={dayHref}>ほか{rest}件</Link>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
