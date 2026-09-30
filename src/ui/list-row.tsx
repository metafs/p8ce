import type { ReactNode } from "react";

/**
 * One line of a listing: a lead (time or date), a kind, the title with any
 * labels, a detail line and an aside. The same row serves the Event list, the
 * Artist and Venue pages and the open calls, so the columns line up across them.
 */
export function ListRow({
  lead,
  kind,
  title,
  labels,
  detail,
  aside,
  asideSub,
  extra,
}: {
  lead?: ReactNode;
  kind?: ReactNode;
  title: ReactNode;
  labels?: ReactNode;
  detail?: ReactNode;
  aside?: ReactNode;
  asideSub?: ReactNode;
  /** Content under the row, beside the lead and kind (e.g. an opened row's details). */
  extra?: ReactNode;
}) {
  return (
    <li className="row">
      <span className="row-lead">{lead}</span>
      <span className="row-kind">{kind}</span>
      <div className="row-main">
        <div className="row-heading">
          {title}
          {labels}
        </div>
        {detail ? <span className="row-detail">{detail}</span> : null}
      </div>
      <div className="row-aside">
        {aside}
        {asideSub ? <span className="row-aside-sub">{asideSub}</span> : null}
      </div>
      {extra ? <div className="row-extra">{extra}</div> : null}
    </li>
  );
}

export function RowList({
  variant,
  bordered = false,
  label,
  children,
}: {
  variant?: "compact" | "lead-wide";
  bordered?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const classes = [
    "rows",
    variant ? `rows-${variant}` : null,
    bordered ? "rows-bordered" : null,
  ].filter(Boolean).join(" ");

  return <ul aria-label={label} className={classes}>{children}</ul>;
}
