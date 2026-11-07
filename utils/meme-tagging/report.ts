import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/types/supabase";
import type { MemeTaggingRunRow } from "@/utils/meme-tagging/queries";
import type { MemeTagDimension } from "@/utils/meme-tagging/schema";
import {
  isPositiveStudyVote,
  STUDY_VOTE_VALUE_ORDER,
  type StudyVoteValue,
} from "@/utils/study-vote-events";

type Client = SupabaseClient<Database>;

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 100;

export type TagVoteSummary = {
  tag_id: number;
  slug: string;
  name: string;
  captions: number;
  votes: number;
  upvotes: number;
  upvote_rate: number;
  distribution: Record<StudyVoteValue, number>;
  /** Caption views (navigation events) from the newer swipe interface. */
  views: number;
  /** Views where the same person liked that caption in the same session. */
  liked_views: number;
  like_rate: number;
};

/** Outcomes for captions whose primary humor style and image subject are this pair. */
export type TagMatrixCell = {
  humor_style_tag_id: number;
  subject_tag_id: number;
  captions: number;
  votes: number;
  upvotes: number;
  views: number;
  liked_views: number;
};

export type StudyTagReport = {
  run: Pick<MemeTaggingRunRow, "id" | "status" | "model_name" | "prompt_version" | "created_datetime_utc" | "study_id"> | null;
  study_captions: number;
  tagged_captions: number;
  total_votes: number;
  study_upvote_rate: number;
  /** More than one distinct vote value was recorded, so upvote rate is informative. */
  has_vote_scale: boolean;
  total_views: number;
  total_liked_views: number;
  study_like_rate: number;
  humor_style: TagVoteSummary[];
  subject: TagVoteSummary[];
  /** Humor style × subject combinations that have at least one tagged caption. */
  matrix: TagMatrixCell[];
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/** Run an `.in()` query over id chunks, paging each chunk past the 1,000-row API cap. */
const fetchByIds = async <TRow,>(
  ids: (string | number)[],
  label: string,
  query: (ids: (string | number)[], from: number, to: number) => PromiseLike<{ data: TRow[] | null; error: { message: string } | null }>,
): Promise<TRow[]> => {
  const rows: TRow[] = [];
  for (const idChunk of chunk(ids, IN_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await query(idChunk, from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
  }
  return rows;
};

const emptyDistribution = () =>
  Object.fromEntries(STUDY_VOTE_VALUE_ORDER.map((value) => [value, 0])) as Record<StudyVoteValue, number>;

/**
 * Latest completed run that covers the study (scoped to it, or to all studies),
 * or the latest such run of any status if none has completed.
 */
const getReportRun = async (supabase: Client, studyId: number) => {
  const columns = "id, status, model_name, prompt_version, created_datetime_utc, study_id";
  const coversStudy = `study_id.eq.${studyId},study_id.is.null`;
  const { data: completed, error } = await supabase
    .from("meme_tagging_runs")
    .select(columns)
    .or(coversStudy)
    .eq("status", "completed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Unable to load tagging runs: ${error.message}`);
  if (completed) return completed;

  const { data: latest, error: latestError } = await supabase
    .from("meme_tagging_runs")
    .select(columns)
    .or(coversStudy)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(`Unable to load tagging runs: ${latestError.message}`);
  return latest;
};

/** Same matching rule as the new-style report: a view is liked if that person liked the caption in that session. */
const getViewMatchKey = (profileId: string, mappingId: number, sessionId: string | null) =>
  `${profileId}|${mappingId}|${sessionId ?? "no-session"}`;

/**
 * Vote and view outcomes for one study grouped by each caption's primary
 * humor-style tag and by its image's primary subject tag. Newer studies only
 * record likes, so like rate (liked views / views) is the comparable metric there.
 */
export const buildStudyTagReport = async (supabase: Client, studyId: number): Promise<StudyTagReport> => {
  const run = await getReportRun(supabase, studyId);

  const mappings: { id: number; caption_id: string }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("study_caption_mappings")
      .select("id, caption_id")
      .eq("study_id", studyId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to load study caption mappings: ${error.message}`);
    mappings.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  const captionIds = [...new Set(mappings.map((mapping) => mapping.caption_id))];
  const captionByMappingId = new Map(mappings.map((mapping) => [mapping.id, mapping.caption_id]));

  const mappingIds = mappings.map((mapping) => mapping.id);
  const [votes, views] = await Promise.all([
    fetchByIds(mappingIds, "study votes", (ids, from, to) =>
      supabase
        .from("study_caption_vote_events")
        .select("study_caption_mapping_id, vote_value, profile_id, session_id")
        .in("study_caption_mapping_id", ids as number[])
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchByIds(mappingIds, "study caption views", (ids, from, to) =>
      supabase
        .from("study_caption_navigation_events")
        .select("study_caption_mapping_id, profile_id, session_id")
        .in("study_caption_mapping_id", ids as number[])
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const likeKeys = new Set(
    votes.flatMap((vote) =>
      vote.study_caption_mapping_id === null
        ? []
        : [getViewMatchKey(vote.profile_id, vote.study_caption_mapping_id, vote.session_id)],
    ),
  );
  const isLikedView = (view: (typeof views)[number]) =>
    view.study_caption_mapping_id !== null &&
    likeKeys.has(getViewMatchKey(view.profile_id, view.study_caption_mapping_id, view.session_id));

  const totalUpvotes = votes.filter((vote) => isPositiveStudyVote(vote.vote_value as StudyVoteValue)).length;
  const totalLikedViews = views.filter(isLikedView).length;
  const base = {
    study_captions: captionIds.length,
    total_votes: votes.length,
    study_upvote_rate: votes.length === 0 ? 0 : totalUpvotes / votes.length,
    has_vote_scale: new Set(votes.map((vote) => vote.vote_value)).size > 1,
    total_views: views.length,
    total_liked_views: totalLikedViews,
    study_like_rate: views.length === 0 ? 0 : totalLikedViews / views.length,
  };

  if (!run) {
    return { run: null, tagged_captions: 0, humor_style: [], subject: [], matrix: [], ...base };
  }

  const captions = await fetchByIds(captionIds, "captions", (ids, from, to) =>
    supabase.from("captions").select("id, image_id").in("id", ids as string[]).order("id").range(from, to),
  );
  const imageByCaptionId = new Map(captions.map((caption) => [caption.id, caption.image_id]));
  const imageIds = [...new Set(captions.map((caption) => caption.image_id).filter((id): id is string => Boolean(id)))];

  const [captionTags, imageTags] = await Promise.all([
    fetchByIds(captionIds, "caption tags", (ids, from, to) =>
      supabase
        .from("caption_meme_tags")
        .select("caption_id, meme_tag_id")
        .eq("run_id", run.id)
        .eq("is_primary", true)
        .in("caption_id", ids as string[])
        .order("caption_id")
        .range(from, to),
    ),
    fetchByIds(imageIds, "image tags", (ids, from, to) =>
      supabase
        .from("image_meme_tags")
        .select("image_id, meme_tag_id")
        .eq("run_id", run.id)
        .eq("is_primary", true)
        .in("image_id", ids as string[])
        .order("image_id")
        .range(from, to),
    ),
  ]);

  const tagIds = [...new Set([...captionTags, ...imageTags].map((row) => row.meme_tag_id))];
  const tags = await fetchByIds(tagIds, "tags", (ids, from, to) =>
    supabase.from("meme_tags").select("id, slug, name, dimension").in("id", ids as number[]).order("id").range(from, to),
  );
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const styleTagByCaption = new Map(captionTags.map((row) => [row.caption_id, row.meme_tag_id]));
  const subjectTagByImage = new Map(imageTags.map((row) => [row.image_id, row.meme_tag_id]));

  const summaries: Record<MemeTagDimension, Map<number, TagVoteSummary & { captionSet: Set<string> }>> = {
    humor_style: new Map(),
    subject: new Map(),
  };

  const getSummary = (dimension: MemeTagDimension, tagId: number | undefined, captionId: string) => {
    if (tagId === undefined) return null;
    const tag = tagById.get(tagId);
    if (!tag) return null;
    let summary = summaries[dimension].get(tagId);
    if (!summary) {
      summary = {
        tag_id: tagId,
        slug: tag.slug,
        name: tag.name,
        captions: 0,
        votes: 0,
        upvotes: 0,
        upvote_rate: 0,
        distribution: emptyDistribution(),
        views: 0,
        liked_views: 0,
        like_rate: 0,
        captionSet: new Set(),
      };
      summaries[dimension].set(tagId, summary);
    }
    summary.captionSet.add(captionId);
    return summary;
  };

  /** Summaries for a caption's humor-style tag and its image's subject tag. */
  const summariesForCaption = (captionId: string) => {
    const imageId = imageByCaptionId.get(captionId);
    return [
      getSummary("humor_style", styleTagByCaption.get(captionId), captionId),
      imageId ? getSummary("subject", subjectTagByImage.get(imageId), captionId) : null,
    ].filter((summary): summary is NonNullable<typeof summary> => summary !== null);
  };

  const matrix = new Map<string, TagMatrixCell & { captionSet: Set<string> }>();
  /** Cell for the caption's (humor style, subject) pair, or null if either tag is missing. */
  const matrixCellForCaption = (captionId: string) => {
    const styleTagId = styleTagByCaption.get(captionId);
    const imageId = imageByCaptionId.get(captionId);
    const subjectTagId = imageId ? subjectTagByImage.get(imageId) : undefined;
    if (styleTagId === undefined || subjectTagId === undefined) return null;
    if (!tagById.has(styleTagId) || !tagById.has(subjectTagId)) return null;
    const key = `${styleTagId}|${subjectTagId}`;
    let matrixCell = matrix.get(key);
    if (!matrixCell) {
      matrixCell = {
        humor_style_tag_id: styleTagId,
        subject_tag_id: subjectTagId,
        captions: 0,
        votes: 0,
        upvotes: 0,
        views: 0,
        liked_views: 0,
        captionSet: new Set(),
      };
      matrix.set(key, matrixCell);
    }
    matrixCell.captionSet.add(captionId);
    return matrixCell;
  };

  // Register every tagged caption (so captions with no votes or views still count).
  for (const captionId of captionIds) {
    summariesForCaption(captionId);
    matrixCellForCaption(captionId);
  }

  for (const vote of votes) {
    const captionId = vote.study_caption_mapping_id === null ? undefined : captionByMappingId.get(vote.study_caption_mapping_id);
    if (!captionId) continue;
    const voteValue = vote.vote_value as StudyVoteValue;
    for (const summary of summariesForCaption(captionId)) {
      summary.votes += 1;
      summary.distribution[voteValue] += 1;
      if (isPositiveStudyVote(voteValue)) summary.upvotes += 1;
    }
    const matrixCell = matrixCellForCaption(captionId);
    if (matrixCell) {
      matrixCell.votes += 1;
      if (isPositiveStudyVote(voteValue)) matrixCell.upvotes += 1;
    }
  }

  for (const view of views) {
    const captionId = view.study_caption_mapping_id === null ? undefined : captionByMappingId.get(view.study_caption_mapping_id);
    if (!captionId) continue;
    const liked = isLikedView(view);
    for (const summary of summariesForCaption(captionId)) {
      summary.views += 1;
      if (liked) summary.liked_views += 1;
    }
    const matrixCell = matrixCellForCaption(captionId);
    if (matrixCell) {
      matrixCell.views += 1;
      if (liked) matrixCell.liked_views += 1;
    }
  }

  const finalize = (dimension: MemeTagDimension): TagVoteSummary[] =>
    [...summaries[dimension].values()]
      .map(({ captionSet, ...summary }) => ({
        ...summary,
        captions: captionSet.size,
        upvote_rate: summary.votes === 0 ? 0 : summary.upvotes / summary.votes,
        like_rate: summary.views === 0 ? 0 : summary.liked_views / summary.views,
      }))
      .sort((a, b) => b.views - a.views || b.votes - a.votes || a.name.localeCompare(b.name));

  return {
    run,
    tagged_captions: captionIds.filter((captionId) => styleTagByCaption.has(captionId)).length,
    humor_style: finalize("humor_style"),
    subject: finalize("subject"),
    matrix: [...matrix.values()].map(({ captionSet, ...matrixCell }) => ({ ...matrixCell, captions: captionSet.size })),
    ...base,
  };
};
