import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/src/types/supabase";
import { mapWithConcurrency } from "@/utils/meme-tagging/concurrency";
import { tagImageWithGemini } from "@/utils/meme-tagging/gemini";
import {
  getImageWorkItem,
  getPendingImageIds,
  getRun,
  getRunProgress,
  getTagIdMap,
  parseTaxonomySnapshot,
  type ImageWorkItem,
  type TaxonomySnapshot,
} from "@/utils/meme-tagging/queries";
import { normalizeAssignments, type TagAssignment } from "@/utils/meme-tagging/schema";

type Client = SupabaseClient<Database>;

export const IMAGES_PER_BATCH = 4;
const IMAGE_CONCURRENCY = 2;
const CAPTIONS_PER_CALL = 30;

export type BatchResult = {
  processed: number;
  failed: number;
  done: number;
  errored: number;
  total: number;
  captions_done: number;
  finished: boolean;
};

type ImageTagRows = {
  imageTags: TagAssignment[];
  captionTags: Map<string, TagAssignment[]>;
  unfitNotes: string[];
};

const callGeminiForImage = async (item: ImageWorkItem, taxonomy: TaxonomySnapshot): Promise<ImageTagRows> => {
  const result: ImageTagRows = { imageTags: [], captionTags: new Map(), unfitNotes: [] };
  // Images with no study captions still get subject tags (one call, empty caption list).
  const captionGroups: ImageWorkItem["captions"][] = [];
  for (let index = 0; index < item.captions.length; index += CAPTIONS_PER_CALL) {
    captionGroups.push(item.captions.slice(index, index + CAPTIONS_PER_CALL));
  }
  if (captionGroups.length === 0) captionGroups.push([]);

  for (const [groupIndex, group] of captionGroups.entries()) {
    const refs = group.map((caption, index) => ({ ref: `C${index + 1}`, id: caption.id, content: caption.content }));
    const output = await tagImageWithGemini({
      imageUrl: item.url,
      imageDescription: item.image_description,
      captions: refs.map(({ ref, content }) => ({ ref, content })),
      subjectTags: taxonomy.subject,
      humorStyleTags: taxonomy.humor_style,
    });

    if (groupIndex === 0) {
      result.imageTags = normalizeAssignments(output.subject);
    }
    const idByRef = new Map(refs.map((ref) => [ref.ref.toUpperCase(), ref.id]));
    for (const captionResult of output.captions) {
      const captionId = idByRef.get(captionResult.caption_ref.trim().toUpperCase());
      if (captionId) {
        result.captionTags.set(captionId, normalizeAssignments(captionResult.humor_style));
      }
    }
    if (output.unfit_notes?.trim()) {
      result.unfitNotes.push(output.unfit_notes.trim());
    }
  }

  return result;
};

const saveImageTags = async (
  supabase: Client,
  runId: number,
  imageId: string,
  rows: ImageTagRows,
  subjectIds: Map<string, number>,
  styleIds: Map<string, number>,
) => {
  // Retries replace whatever a previous failed attempt wrote for this image.
  const captionIds = [...rows.captionTags.keys()];
  const { error: clearImageError } = await supabase
    .from("image_meme_tags")
    .delete()
    .eq("run_id", runId)
    .eq("image_id", imageId);
  if (clearImageError) throw new Error(`Unable to clear image tags: ${clearImageError.message}`);
  if (captionIds.length > 0) {
    const { error: clearCaptionError } = await supabase
      .from("caption_meme_tags")
      .delete()
      .eq("run_id", runId)
      .in("caption_id", captionIds);
    if (clearCaptionError) throw new Error(`Unable to clear caption tags: ${clearCaptionError.message}`);
  }

  const imageRows = rows.imageTags.flatMap((assignment) => {
    const tagId = subjectIds.get(assignment.slug);
    return tagId
      ? [{ run_id: runId, image_id: imageId, meme_tag_id: tagId, is_primary: assignment.is_primary, confidence: assignment.confidence }]
      : [];
  });
  const captionRows = [...rows.captionTags.entries()].flatMap(([captionId, assignments]) =>
    assignments.flatMap((assignment) => {
      const tagId = styleIds.get(assignment.slug);
      return tagId
        ? [{ run_id: runId, caption_id: captionId, meme_tag_id: tagId, is_primary: assignment.is_primary, confidence: assignment.confidence }]
        : [];
    }),
  );

  if (imageRows.length > 0) {
    const { error } = await supabase.from("image_meme_tags").insert(imageRows);
    if (error) throw new Error(`Unable to save image tags: ${error.message}`);
  }
  if (captionRows.length > 0) {
    const { error } = await supabase.from("caption_meme_tags").insert(captionRows);
    if (error) throw new Error(`Unable to save caption tags: ${error.message}`);
  }
};

const recordItem = async (
  supabase: Client,
  runId: number,
  imageId: string,
  item: { status: "done" | "error"; captions_tagged?: number; unfit_notes?: string | null; error_message?: string | null },
) => {
  const { error } = await supabase.from("meme_tagging_run_items").upsert(
    {
      run_id: runId,
      image_id: imageId,
      status: item.status,
      captions_tagged: item.captions_tagged ?? 0,
      unfit_notes: item.unfit_notes ?? null,
      error_message: item.error_message ?? null,
    },
    { onConflict: "run_id,image_id" },
  );
  if (error) throw new Error(`Unable to record progress: ${error.message}`);
};

/** Tag the next few pending images of a run and return updated progress. */
export const tagNextBatchForRun = async (
  supabase: Client,
  runId: number,
  retryErrors = false,
): Promise<BatchResult> => {
  const run = await getRun(supabase, runId);
  if (run.status !== "running") {
    throw new Error(`Run ${runId} is ${run.status}; start a new run to tag again.`);
  }

  const taxonomy = parseTaxonomySnapshot(run.taxonomy_snapshot);
  const [subjectIds, styleIds] = await Promise.all([
    getTagIdMap(supabase, "subject", taxonomy.subject.map((tag) => tag.slug)),
    getTagIdMap(supabase, "humor_style", taxonomy.humor_style.map((tag) => tag.slug)),
  ]);

  const pending = await getPendingImageIds(supabase, run, IMAGES_PER_BATCH, retryErrors);

  const outcomes = await mapWithConcurrency(pending, IMAGE_CONCURRENCY, async (imageId) => {
    try {
      const item = await getImageWorkItem(supabase, imageId, run.study_id);
      if (!item) {
        await recordItem(supabase, run.id, imageId, { status: "error", error_message: "Image not found or has no URL." });
        return false;
      }
      const rows = await callGeminiForImage(item, taxonomy);
      await saveImageTags(supabase, run.id, imageId, rows, subjectIds, styleIds);
      await recordItem(supabase, run.id, imageId, {
        status: "done",
        captions_tagged: rows.captionTags.size,
        unfit_notes: rows.unfitNotes.length > 0 ? rows.unfitNotes.join(" | ") : null,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Meme tagging failed for image ${imageId}`, error);
      await recordItem(supabase, run.id, imageId, { status: "error", error_message: message.slice(0, 2000) });
      return false;
    }
  });

  const progress = await getRunProgress(supabase, run.id);
  const { count: captionsDone, error: captionCountError } = await supabase
    .from("caption_meme_tags")
    .select("caption_id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .eq("is_primary", true);
  if (captionCountError) throw new Error(`Unable to count tagged captions: ${captionCountError.message}`);

  const finished = progress.done >= run.image_ids.length;
  const { error: updateError } = await supabase
    .from("meme_tagging_runs")
    .update({
      images_done: progress.done,
      captions_done: captionsDone ?? 0,
      ...(finished ? { status: "completed" } : {}),
    })
    .eq("id", run.id);
  if (updateError) throw new Error(`Unable to update run: ${updateError.message}`);

  return {
    processed: outcomes.filter(Boolean).length,
    failed: outcomes.filter((ok) => !ok).length,
    done: progress.done,
    errored: progress.errored,
    total: run.image_ids.length,
    captions_done: captionsDone ?? 0,
    // Errored images are skipped until an explicit retry, so an empty queue means this pass is over.
    finished: finished || pending.length === 0,
  };
};
