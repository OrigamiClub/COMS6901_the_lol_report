import Link from "next/link";
import { notFound } from "next/navigation";

import { ReportLoadForm } from "@/components/report-load-form";
import { NEW_STYLE_MIN_STUDY_ID, StudyHeaderActions } from "@/components/study-header-actions";
import { buildStudyTagReport, type TagVoteSummary } from "@/utils/meme-tagging/report";
import { MEME_TAG_DIMENSION_LABELS } from "@/utils/meme-tagging/schema";
import { getStudyVoteValueLabel, STUDY_VOTE_VALUE_ORDER } from "@/utils/study-vote-events";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

/** Tags with fewer views (or votes, for older studies) than this are flagged as too small to compare. */
const LOW_SAMPLE_THRESHOLD = 30;

type HumorTagsPageProps = {
  params: Promise<{ id: string }>;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

const formatDelta = (value: number) => {
  const points = value * 100;
  return `${points >= 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`;
};

const cell = "px-3 py-2 text-right tabular-nums";
const headCell = "px-3 py-2 text-right font-semibold";

function TagTable({
  title,
  rows,
  showLikes,
  showVoteScale,
  studyLikeRate,
  studyUpvoteRate,
}: {
  title: string;
  rows: TagVoteSummary[];
  /** Study has caption views, so like rate (liked views / views) is available. */
  showLikes: boolean;
  /** Study recorded more than one vote value, so upvote rate and distribution mean something. */
  showVoteScale: boolean;
  studyLikeRate: number;
  studyUpvoteRate: number;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="app-muted text-sm">No tagged captions in this study for the selected run.</p>
      ) : (
        <div className="app-table-shell overflow-x-auto rounded-xl">
          <table className="app-table w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Tag</th>
                <th className={headCell}>Captions</th>
                {showLikes ? (
                  <>
                    <th className={headCell}>Views</th>
                    <th className={headCell}>Liked</th>
                    <th className={headCell}>Like rate</th>
                    <th className={headCell}>vs. study</th>
                  </>
                ) : null}
                <th className={headCell}>Votes</th>
                {showVoteScale ? (
                  <>
                    <th className={headCell}>Upvote rate</th>
                    <th className={headCell}>vs. study</th>
                    <th className="px-3 py-2 font-semibold">Vote distribution</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sample = showLikes ? row.views : row.votes;
                return (
                  <tr key={row.tag_id}>
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.name}</span>{" "}
                      <code className="app-muted text-xs">{row.slug}</code>
                      {sample < LOW_SAMPLE_THRESHOLD ? (
                        <span className="app-muted block text-xs">
                          Fewer than {LOW_SAMPLE_THRESHOLD} {showLikes ? "views" : "votes"}
                        </span>
                      ) : null}
                    </td>
                    <td className={cell}>{row.captions.toLocaleString()}</td>
                    {showLikes ? (
                      <>
                        <td className={cell}>{row.views.toLocaleString()}</td>
                        <td className={cell}>{row.liked_views.toLocaleString()}</td>
                        <td className={cell}>{row.views > 0 ? formatPercent(row.like_rate) : "—"}</td>
                        <td className={cell}>{row.views > 0 ? formatDelta(row.like_rate - studyLikeRate) : "—"}</td>
                      </>
                    ) : null}
                    <td className={cell}>{row.votes.toLocaleString()}</td>
                    {showVoteScale ? (
                      <>
                        <td className={cell}>{row.votes > 0 ? formatPercent(row.upvote_rate) : "—"}</td>
                        <td className={cell}>{row.votes > 0 ? formatDelta(row.upvote_rate - studyUpvoteRate) : "—"}</td>
                        <td className="app-muted px-3 py-2 text-xs">
                          {row.votes > 0
                            ? STUDY_VOTE_VALUE_ORDER.filter((value) => row.distribution[value] > 0)
                                .map(
                                  (value) =>
                                    `${getStudyVoteValueLabel(value)} ${formatPercent(row.distribution[value] / row.votes)}`,
                                )
                                .join(" · ")
                            : "No votes"}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function HumorTagsPage({ params }: HumorTagsPageProps) {
  const { id } = await params;
  const studyId = Number.parseInt(id, 10);
  if (!Number.isInteger(studyId) || studyId <= 0) notFound();

  const supabase = await createClient();
  const { data: studies, error: studiesError } = await supabase
    .from("studies")
    .select("id, slug")
    .order("id", { ascending: false });
  if (studiesError) throw new Error(`Unable to load studies: ${studiesError.message}`);
  const study = (studies ?? []).find((row) => row.id === studyId);
  if (!study) notFound();

  const report = await buildStudyTagReport(supabase, studyId);
  const showLikes = report.total_views > 0;
  const showVoteScale = report.has_vote_scale || !showLikes;

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">Humor Study Stats</p>
              <h1 className="text-2xl font-semibold">Votes by Humor Style and Subject</h1>
            </div>
            <StudyHeaderActions studyId={studyId} current="humor-tags" />
          </div>
          <p className="app-muted text-sm">
            Each caption counts under its <strong>primary</strong> AI tag: humor style comes from the caption, and
            subject comes from its image. <strong>Like rate</strong> = caption views where that person liked the
            caption in the same session ÷ all caption views, the same rule as the new-style report. Upvote =
            &ldquo;funny&rdquo; or &ldquo;very funny&rdquo;, shown only for studies that recorded more than one vote
            value.
          </p>
          <ReportLoadForm
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{ fieldName: "studyId", prefix: "/study", suffix: "humor-tags" }}
          >
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study</span>
              <select
                name="studyId"
                defaultValue={studyId.toString()}
                className="app-input h-9 min-w-80 rounded-md px-2 text-sm outline-none"
              >
                {(studies ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    #{row.id} {row.slug}
                  </option>
                ))}
              </select>
            </label>
          </ReportLoadForm>
          {report.run ? (
            <p className="app-muted text-xs">
              Tags from run #{report.run.id} ({report.run.study_id === null ? "all studies" : `study #${report.run.study_id}`},{" "}
              {report.run.status}) · {report.run.model_name} · {report.run.prompt_version}
            </p>
          ) : null}
        </header>

        {!report.run ? (
          <p className="app-card rounded-lg px-3 py-2 text-sm">
            No tagging runs yet. Approve the taxonomies and start a run on the{" "}
            <Link href={`/tagging?studyId=${studyId}`} className="underline">
              tagging page
            </Link>
            .
          </p>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              {showLikes ? (
                <article className="app-card app-stat-card-teal rounded-xl p-4">
                  <p className="app-kicker text-xs font-semibold uppercase tracking-wide">Caption views / liked</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {report.total_views.toLocaleString()} / {report.total_liked_views.toLocaleString()}
                  </p>
                </article>
              ) : (
                <article className="app-card app-stat-card-teal rounded-xl p-4">
                  <p className="app-kicker text-xs font-semibold uppercase tracking-wide">Total votes</p>
                  <p className="mt-2 text-2xl font-semibold">{report.total_votes.toLocaleString()}</p>
                </article>
              )}
              <article className="app-card app-stat-card-amber rounded-xl p-4">
                <p className="app-kicker text-xs font-semibold uppercase tracking-wide">Captions tagged</p>
                <p className="mt-2 text-2xl font-semibold">
                  {report.tagged_captions.toLocaleString()} / {report.study_captions.toLocaleString()}
                </p>
              </article>
              <article className="app-card app-stat-card-rose rounded-xl p-4">
                <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
                  {showLikes ? "Study like rate" : "Study upvote rate"}
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatPercent(showLikes ? report.study_like_rate : report.study_upvote_rate)}
                </p>
              </article>
            </section>

            {studyId >= NEW_STYLE_MIN_STUDY_ID ? (
              <p className="app-muted text-sm">
                The humor style × subject heatmap is on the{" "}
                <Link href={`/study/${studyId}/new-style-report#humor-tag-heatmap`} className="underline">
                  new-style report
                </Link>
                .
              </p>
            ) : null}

            <TagTable
              title={MEME_TAG_DIMENSION_LABELS.humor_style}
              rows={report.humor_style}
              showLikes={showLikes}
              showVoteScale={showVoteScale}
              studyLikeRate={report.study_like_rate}
              studyUpvoteRate={report.study_upvote_rate}
            />
            <TagTable
              title={MEME_TAG_DIMENSION_LABELS.subject}
              rows={report.subject}
              showLikes={showLikes}
              showVoteScale={showVoteScale}
              studyLikeRate={report.study_like_rate}
              studyUpvoteRate={report.study_upvote_rate}
            />
          </>
        )}
      </section>
    </main>
  );
}
