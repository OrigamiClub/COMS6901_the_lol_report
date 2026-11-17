import Link from "next/link";

import { NEW_STYLE_MIN_STUDY_ID } from "@/components/study-header-actions";

export type DashboardStudy = {
  id: number;
  slug: string | null;
  start_datetime_utc: string | null;
  end_datetime_utc: string | null;
  is_hidden: boolean;
};

export type DashboardStudySummary = {
  caption_count: number;
  viewer_count: number;
  captions_seen: number;
  captions_liked: number;
  vote_count: number;
  voter_count: number;
};

type DashboardStudyCardProps = {
  study: DashboardStudy;
  summary: DashboardStudySummary | null;
  /** e.g. "tagged (run #3)" or "not tagged". */
  tagStatus: string;
  featured?: boolean;
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;

const formatDateRange = (start: string | null, end: string | null) => {
  const [from, to] = [formatDate(start), formatDate(end)];
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to ?? "No dates";
};

/** Main page for a study: the new-style report for study 7+, study detail for older ones. */
export const studyMainHref = (studyId: number) =>
  `/study/${studyId}/${studyId >= NEW_STYLE_MIN_STUDY_ID ? "new-style-report" : "study-detail"}`;

/** Card for one study on the dashboard: dates, response totals, like rate, tagging status, and quick links. */
export function DashboardStudyCard({ study, summary, tagStatus, featured = false }: DashboardStudyCardProps) {
  const isNewStyle = study.id >= NEW_STYLE_MIN_STUDY_ID;
  const hasViews = (summary?.captions_seen ?? 0) > 0;
  const likeRate = hasViews && summary ? summary.captions_liked / summary.captions_seen : null;
  const participants = summary ? Math.max(summary.viewer_count, summary.voter_count) : 0;
  const hasResponses = participants > 0;

  const stats = [
    `${(summary?.caption_count ?? 0).toLocaleString()} captions`,
    hasResponses ? `${participants.toLocaleString()} participants` : "No responses yet",
    likeRate !== null
      ? `${(likeRate * 100).toFixed(1)}% like rate`
      : hasResponses
        ? `${(summary?.vote_count ?? 0).toLocaleString()} votes`
        : null,
  ].filter((stat): stat is string => stat !== null);

  const quickLinks = [
    { href: `/study/${study.id}/humor-tags`, label: "Humor tags" },
    ...(isNewStyle ? [{ href: `/study/${study.id}/new-style-report#like-overlap-graph`, label: "Participant groups" }] : []),
    { href: `/tagging?studyId=${study.id}`, label: "Tag study" },
  ];

  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-xl ${featured ? "app-feature-card p-6 sm:p-8" : "app-card p-4"}`}
    >
      <div className="min-w-0 space-y-1">
        <p className="app-kicker flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          {featured ? "Latest study" : `Study #${study.id}`}
          {study.is_hidden ? (
            <span
              className={`rounded border px-1.5 py-0.5 normal-case tracking-normal ${
                featured ? "border-current" : "border-[var(--card-border)]"
              }`}
            >
              hidden
            </span>
          ) : null}
        </p>
        <h3 className={`font-semibold break-words ${featured ? "text-2xl sm:text-3xl" : "text-base"}`}>
          {featured ? `#${study.id} ` : ""}
          {study.slug ?? "Untitled study"}
        </h3>
        <p className="app-muted text-sm">{formatDateRange(study.start_datetime_utc, study.end_datetime_utc)}</p>
      </div>

      <p className={`tabular-nums ${featured ? "text-base" : "text-sm"}`}>{stats.join(" · ")}</p>
      <p className="app-muted text-xs">{tagStatus === "not tagged" ? "Not tagged yet" : `AI tags: ${tagStatus}`}</p>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Link
          href={studyMainHref(study.id)}
          className={`${featured ? "app-feature-button px-4 py-2 font-semibold" : "app-button px-3 py-1.5 font-medium"} rounded-lg text-sm transition`}
        >
          Open report
        </Link>
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`app-muted text-xs underline-offset-2 ${featured ? "font-medium underline" : "hover:underline"}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </article>
  );
}
