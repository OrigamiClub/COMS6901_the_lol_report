import Link from "next/link";

import { DashboardStudyCard } from "@/components/dashboard-study-card";
import { NEW_STYLE_MIN_STUDY_ID } from "@/components/study-header-actions";
import { StudyJumpForm } from "@/components/study-jump-form";
import { TopNavbar } from "@/components/top-navbar";
import { getLatestRunStatusByScope } from "@/utils/meme-tagging/queries";
import { createClient } from "@/utils/supabase/server";

/** Recent studies shown as cards below the latest one. */
const RECENT_STUDY_COUNT = 9;

type HomeProps = {
  searchParams: Promise<{ showHidden?: string }>;
};

/** "tagged (run #3)", "in progress (run #5)", or "not tagged", falling back to a completed all-studies run. */
const describeTagStatus = (
  studyId: number,
  runStatusByScope: Record<string, { run_id: number; status: string }>,
) => {
  const own = runStatusByScope[studyId.toString()];
  const all = runStatusByScope.all;
  if (own?.status === "completed") return `tagged (run #${own.run_id})`;
  if (own?.status === "running") return `in progress (run #${own.run_id})`;
  if (all?.status === "completed") return `tagged (all-studies run #${all.run_id})`;
  if (own) return `${own.status} (run #${own.run_id})`;
  return "not tagged";
};

export default async function Home({ searchParams }: HomeProps) {
  const { showHidden: showHiddenParam } = await searchParams;
  const showHidden = showHiddenParam === "1";
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: studies, error: studiesError },
    runStatusByScope,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("studies")
      .select("id, slug, start_datetime_utc, end_datetime_utc, is_hidden")
      .order("id", { ascending: false }),
    getLatestRunStatusByScope(supabase),
  ]);
  if (studiesError) {
    throw new Error(`Unable to load studies: ${studiesError.message}`);
  }

  const allStudies = studies ?? [];
  const visibleStudies = showHidden ? allStudies : allStudies.filter((study) => !study.is_hidden);
  const hiddenCount = allStudies.length - allStudies.filter((study) => !study.is_hidden).length;
  const featuredStudy = visibleStudies[0] ?? null;
  const recentStudies = visibleStudies.slice(1, 1 + RECENT_STUDY_COUNT);
  const cardStudyIds = [featuredStudy, ...recentStudies].flatMap((study) => (study ? [study.id] : []));

  const { data: summaries, error: summariesError } =
    cardStudyIds.length > 0
      ? await supabase.from("study_summaries").select("*").in("study_id", cardStudyIds)
      : { data: [], error: null };
  if (summariesError) {
    throw new Error(`Unable to load study summaries: ${summariesError.message}`);
  }
  const summaryByStudy = new Map(
    (summaries ?? []).flatMap((row) =>
      row.study_id === null
        ? []
        : [
            [
              row.study_id,
              {
                caption_count: row.caption_count ?? 0,
                viewer_count: row.viewer_count ?? 0,
                captions_seen: row.captions_seen ?? 0,
                captions_liked: row.captions_liked ?? 0,
                vote_count: row.vote_count ?? 0,
                voter_count: row.voter_count ?? 0,
              },
            ] as const,
          ],
    ),
  );

  const latestStudyId = featuredStudy?.id ?? null;
  const additionalReports = [
    {
      title: "Study detail",
      description: "Review study vote details",
      href: latestStudyId ? `/study/${latestStudyId}/study-detail` : null,
    },
    {
      title: "Study engagement risk",
      description: "Find low-engagement raters",
      href: latestStudyId ? `/study/${latestStudyId}/engagement-risk` : null,
    },
    {
      title: "Study-to-study comparison",
      description: "Compare two studies",
      href: "/reports/study-comparison",
    },
    {
      title: "Weekly humor study summary",
      description: "Track weekly study trends",
      href: "/reports/weekly-study-summary",
    },
    {
      title: "Study voting span by user",
      description: "Review voting duration",
      href: latestStudyId ? `/study/${latestStudyId}/vote-timing` : null,
    },
    {
      title: "Study upvote percentage by user",
      description: "Compare individual upvote rates",
      href: latestStudyId ? `/study/${latestStudyId}/user-upvote-rate` : null,
    },
    {
      title: "Votes by humor style and subject",
      description: "Compare upvote rates across AI tags",
      href: latestStudyId ? `/study/${latestStudyId}/humor-tags` : null,
    },
    {
      title: "AI meme tagging",
      description: "Tag memes by humor style and subject",
      href: "/tagging",
    },
    {
      title: "Selected user report",
      description: "Analyze selected raters together",
      href: latestStudyId ? `/study/${latestStudyId}/selected-user-report` : null,
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavbar />
      <main className="page-shell flex-1 p-6">
        <section className="app-panel mx-auto w-full max-w-6xl space-y-6 rounded-2xl p-6 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">Humor Study Stats</p>
              <h1 className="mt-2 text-3xl font-semibold">Dashboard</h1>
              <p className="app-muted mt-1 text-sm">
                Signed in as <span className="font-semibold text-foreground">{user?.email}</span>
              </p>
            </div>
            <StudyJumpForm
              studies={allStudies.map(({ id, slug }) => ({ id, slug }))}
              newStyleMinStudyId={NEW_STYLE_MIN_STUDY_ID}
            />
          </header>

          {featuredStudy ? (
            <DashboardStudyCard
              study={featuredStudy}
              summary={summaryByStudy.get(featuredStudy.id) ?? null}
              tagStatus={describeTagStatus(featuredStudy.id, runStatusByScope)}
              featured
            />
          ) : (
            <p className="app-card rounded-xl p-6 text-sm">No studies yet.</p>
          )}

          {recentStudies.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-lg font-semibold">Recent studies</h2>
                {hiddenCount > 0 ? (
                  <Link
                    href={showHidden ? "/" : "/?showHidden=1"}
                    className="app-muted text-sm underline-offset-2 hover:underline"
                  >
                    {showHidden ? `Hide ${hiddenCount} hidden/test studies` : `Show ${hiddenCount} hidden/test studies`}
                  </Link>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentStudies.map((study) => (
                  <DashboardStudyCard
                    key={study.id}
                    study={study}
                    summary={summaryByStudy.get(study.id) ?? null}
                    tagStatus={describeTagStatus(study.id, runStatusByScope)}
                  />
                ))}
              </div>
              <p className="app-muted text-xs">
                Like rate = captions liked ÷ captions seen per participant, the same rule as the new-style report. Use
                the jump box above for older studies.
              </p>
            </section>
          ) : null}

          <details className="group">
            <summary className="app-button inline-flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition marker:content-none">
              More reports
              <span className="text-xs transition group-open:rotate-180" aria-hidden="true">
                &#9660;
              </span>
            </summary>
            <div className="app-card mt-3 grid w-full gap-2 rounded-xl p-3 sm:grid-cols-2 lg:grid-cols-3">
              {additionalReports.map((reportOption) =>
                reportOption.href ? (
                  <Link
                    key={reportOption.title}
                    href={reportOption.href}
                    className="app-button rounded-lg px-3 py-2 text-sm transition"
                  >
                    <span className="block font-medium">{reportOption.title}</span>
                    <span className="app-muted mt-0.5 block text-xs">{reportOption.description}</span>
                  </Link>
                ) : (
                  <span
                    key={reportOption.title}
                    className="app-button cursor-not-allowed rounded-lg px-3 py-2 text-sm opacity-60"
                  >
                    <span className="block font-medium">{reportOption.title}</span>
                    <span className="app-muted mt-0.5 block text-xs">{reportOption.description}</span>
                  </span>
                ),
              )}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
