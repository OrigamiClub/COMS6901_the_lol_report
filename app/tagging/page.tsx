import Link from "next/link";

import { TaggingRunProgress } from "@/components/tagging-run-progress";
import { TaggingTaxonomyEditor } from "@/components/tagging-taxonomy-editor";
import { getMemeTaggingModelName, isGeminiConfigured } from "@/utils/meme-tagging/gemini";
import { getLatestRun, getRunProgress, listMemeTags, listUnfitNotes } from "@/utils/meme-tagging/queries";
import { MEME_TAG_DIMENSIONS } from "@/utils/meme-tagging/schema";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

type TaggingPageProps = {
  searchParams: Promise<{ studyId?: string | string[] }>;
};

export default async function TaggingPage({ searchParams }: TaggingPageProps) {
  const { studyId: rawStudyId } = await searchParams;
  const requestedStudyId = Number.parseInt(Array.isArray(rawStudyId) ? (rawStudyId[0] ?? "") : (rawStudyId ?? ""), 10);
  const supabase = await createClient();
  const [tags, latestRun, studiesResult] = await Promise.all([
    listMemeTags(supabase),
    getLatestRun(supabase),
    supabase.from("studies").select("id, slug").order("id", { ascending: false }),
  ]);
  if (studiesResult.error) throw new Error(`Unable to load studies: ${studiesResult.error.message}`);
  const studies = studiesResult.data ?? [];
  const initialStudyId = studies.some((study) => study.id === requestedStudyId) ? requestedStudyId : null;
  const [progress, notes] = latestRun
    ? await Promise.all([getRunProgress(supabase, latestRun.id), listUnfitNotes(supabase, latestRun.id)])
    : [null, []];

  const geminiConfigured = isGeminiConfigured();
  const activeCounts = Object.fromEntries(
    MEME_TAG_DIMENSIONS.map((dimension) => [
      dimension,
      tags.filter((tag) => tag.dimension === dimension && tag.status === "active").length,
    ]),
  ) as Record<(typeof MEME_TAG_DIMENSIONS)[number], number>;

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">Humor Study Stats</p>
              <h1 className="text-2xl font-semibold">AI Meme Tagging</h1>
            </div>
            <Link href="/" className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition">
              Home
            </Link>
          </div>
          <p className="app-muted text-sm">
            Tags study images by <strong>subject matter</strong> and study captions by <strong>humor style</strong>{" "}
            using <code>{getMemeTaggingModelName()}</code>. 1. Draft each taxonomy with AI. 2. Edit it and approve it.
            3. Start a run, which tags every study meme against the approved tags.
          </p>
          {!geminiConfigured ? (
            <p className="app-card rounded-lg px-3 py-2 text-sm">
              <code>GOOGLE_GENERATIVE_AI_API_KEY</code> is not set. Add it to <code>.env.local</code> and restart the
              server to enable AI drafting and tagging.
            </p>
          ) : null}
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          {MEME_TAG_DIMENSIONS.map((dimension) => (
            <TaggingTaxonomyEditor
              key={dimension}
              dimension={dimension}
              tags={tags
                .filter((tag) => tag.dimension === dimension)
                .map(({ id, slug, name, description, status }) => ({ id, slug, name, description, status }))}
              aiEnabled={geminiConfigured}
            />
          ))}
        </div>

        <TaggingRunProgress
          aiEnabled={geminiConfigured}
          canStart={activeCounts.subject > 0 && activeCounts.humor_style > 0}
          studies={studies}
          initialStudyId={initialStudyId}
          run={
            latestRun
              ? {
                  id: latestRun.id,
                  status: latestRun.status,
                  model_name: latestRun.model_name,
                  prompt_version: latestRun.prompt_version,
                  study_id: latestRun.study_id,
                  created_datetime_utc: latestRun.created_datetime_utc,
                  total: latestRun.image_ids.length,
                  done: progress?.done ?? 0,
                  errored: progress?.errored ?? 0,
                  unfit: progress?.unfit ?? 0,
                  captions_done: latestRun.captions_done,
                }
              : null
          }
          notes={notes}
        />
      </section>
    </main>
  );
}
