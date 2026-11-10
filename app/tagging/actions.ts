"use server";

import { revalidatePath } from "next/cache";

import { draftTaxonomyWithGemini, getMemeTaggingModelName } from "@/utils/meme-tagging/gemini";
import { PROMPT_VERSION } from "@/utils/meme-tagging/prompts";
import {
  fetchStudyImageIds,
  getActiveTaxonomy,
  getCommonUseCategoryNames,
  getDraftSample,
  getLlmModelId,
} from "@/utils/meme-tagging/queries";
import { tagNextBatchForRun, type BatchResult } from "@/utils/meme-tagging/run";
import { isMemeTagDimension, SLUG_PATTERN, toSlug, type MemeTagDimension } from "@/utils/meme-tagging/schema";
import { createClient } from "@/utils/supabase/server";
import { isSuperadminProfile, SUPERADMIN_REQUIRED_ERROR_MESSAGE } from "@/utils/supabase/superadmin";

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

const DRAFT_SAMPLE_IMAGES = 40;
const DRAFT_CAPTIONS_PER_IMAGE = 3;
const TAGGING_PATH = "/tagging";

const getAuthorizedClient = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isSuperadminProfile(supabase, user?.id))) {
    throw new Error(SUPERADMIN_REQUIRED_ERROR_MESSAGE);
  }
  return supabase;
};

const toError = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
});

export const draftTaxonomyAction = async (dimension: MemeTagDimension): Promise<ActionResult<{ added: number }>> => {
  try {
    if (!isMemeTagDimension(dimension)) throw new Error("Unknown tag dimension.");
    const supabase = await getAuthorizedClient();

    const [sample, categoryNames] = await Promise.all([
      getDraftSample(supabase, DRAFT_SAMPLE_IMAGES, DRAFT_CAPTIONS_PER_IMAGE),
      dimension === "subject" ? getCommonUseCategoryNames(supabase) : Promise.resolve([]),
    ]);
    if (sample.length === 0) throw new Error("No study memes found to sample.");

    const draft = await draftTaxonomyWithGemini(dimension, sample, categoryNames);
    const rows = draft.tags
      .map((tag) => ({
        dimension,
        slug: toSlug(tag.name),
        name: tag.name.trim(),
        description: tag.description.trim() || null,
        status: "proposed",
      }))
      .filter((row) => SLUG_PATTERN.test(row.slug));

    // Existing tags (including approved ones) are left untouched.
    const { data, error } = await supabase
      .from("meme_tags")
      .upsert(rows, { onConflict: "dimension,slug", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Unable to save proposed tags: ${error.message}`);

    revalidatePath(TAGGING_PATH);
    return { ok: true, data: { added: data?.length ?? 0 } };
  } catch (error) {
    return toError(error);
  }
};

export const saveTagAction = async (input: {
  id?: number;
  dimension: MemeTagDimension;
  name: string;
  description: string;
}): Promise<ActionResult> => {
  try {
    if (!isMemeTagDimension(input.dimension)) throw new Error("Unknown tag dimension.");
    const name = input.name.trim();
    if (!name) throw new Error("Tag name is required.");
    const description = input.description.trim() || null;
    const supabase = await getAuthorizedClient();

    if (input.id) {
      // Slugs stay fixed after creation so past runs keep pointing at the same tag.
      const { error } = await supabase.from("meme_tags").update({ name, description }).eq("id", input.id);
      if (error) throw new Error(`Unable to update tag: ${error.message}`);
    } else {
      const slug = toSlug(name);
      if (!SLUG_PATTERN.test(slug)) throw new Error("Tag name needs at least one letter or number.");
      const { error } = await supabase
        .from("meme_tags")
        .insert({ dimension: input.dimension, slug, name, description, status: "proposed" });
      if (error) {
        throw new Error(error.code === "23505" ? `A tag with slug "${slug}" already exists.` : error.message);
      }
    }

    revalidatePath(TAGGING_PATH);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
};

export const setTagStatusAction = async (
  id: number,
  status: "proposed" | "active" | "retired",
): Promise<ActionResult> => {
  try {
    const supabase = await getAuthorizedClient();
    const { error } = await supabase.from("meme_tags").update({ status }).eq("id", id);
    if (error) throw new Error(`Unable to update tag: ${error.message}`);
    revalidatePath(TAGGING_PATH);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
};

/** Only proposed tags can be deleted; used tags should be retired instead. */
export const deleteProposedTagAction = async (id: number): Promise<ActionResult> => {
  try {
    const supabase = await getAuthorizedClient();
    const { error } = await supabase.from("meme_tags").delete().eq("id", id).eq("status", "proposed");
    if (error) throw new Error(`Unable to delete tag: ${error.message}`);
    revalidatePath(TAGGING_PATH);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
};

export const approveProposedTagsAction = async (dimension: MemeTagDimension): Promise<ActionResult> => {
  try {
    if (!isMemeTagDimension(dimension)) throw new Error("Unknown tag dimension.");
    const supabase = await getAuthorizedClient();
    const { error } = await supabase
      .from("meme_tags")
      .update({ status: "active" })
      .eq("dimension", dimension)
      .eq("status", "proposed");
    if (error) throw new Error(`Unable to approve tags: ${error.message}`);
    revalidatePath(TAGGING_PATH);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
};

/** Start a run over every study, or only over `studyId`'s images and captions. */
export const startRunAction = async (studyId: number | null = null): Promise<ActionResult<{ runId: number }>> => {
  try {
    if (studyId !== null && (!Number.isInteger(studyId) || studyId <= 0)) throw new Error("Invalid study id.");
    const supabase = await getAuthorizedClient();
    if (studyId !== null) {
      const { data: study, error: studyError } = await supabase.from("studies").select("id").eq("id", studyId).maybeSingle();
      if (studyError) throw new Error(`Unable to load study: ${studyError.message}`);
      if (!study) throw new Error(`Study ${studyId} not found.`);
    }
    const taxonomy = await getActiveTaxonomy(supabase);
    if (taxonomy.subject.length === 0 || taxonomy.humor_style.length === 0) {
      throw new Error("Approve at least one subject tag and one humor style tag before starting a run.");
    }

    const imageIds = await fetchStudyImageIds(supabase, studyId);
    if (imageIds.length === 0) {
      throw new Error(studyId === null ? "No study images found." : `Study ${studyId} has no captioned images.`);
    }

    const modelName = getMemeTaggingModelName();
    // Only a running run with the same scope is replaced; runs for other studies keep going.
    const runningForScope = supabase.from("meme_tagging_runs").update({ status: "cancelled" }).eq("status", "running");
    const { error: cancelError } = await (studyId === null
      ? runningForScope.is("study_id", null)
      : runningForScope.eq("study_id", studyId));
    if (cancelError) throw new Error(`Unable to close previous runs: ${cancelError.message}`);

    const { data, error } = await supabase
      .from("meme_tagging_runs")
      .insert({
        llm_model_id: await getLlmModelId(supabase, modelName),
        model_name: modelName,
        prompt_version: PROMPT_VERSION,
        taxonomy_snapshot: taxonomy,
        image_ids: imageIds,
        images_total: imageIds.length,
        study_id: studyId,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Unable to start run: ${error.message}`);

    revalidatePath(TAGGING_PATH);
    return { ok: true, data: { runId: data.id } };
  } catch (error) {
    return toError(error);
  }
};

export const tagNextBatchAction = async (runId: number, retryErrors = false): Promise<ActionResult<BatchResult>> => {
  try {
    if (!Number.isInteger(runId) || runId <= 0) throw new Error("Invalid run id.");
    const supabase = await getAuthorizedClient();
    const result = await tagNextBatchForRun(supabase, runId, retryErrors);
    return { ok: true, data: result };
  } catch (error) {
    return toError(error);
  }
};

export const cancelRunAction = async (runId: number): Promise<ActionResult> => {
  try {
    const supabase = await getAuthorizedClient();
    const { error } = await supabase
      .from("meme_tagging_runs")
      .update({ status: "cancelled" })
      .eq("id", runId)
      .eq("status", "running");
    if (error) throw new Error(`Unable to cancel run: ${error.message}`);
    revalidatePath(TAGGING_PATH);
    return { ok: true, data: undefined };
  } catch (error) {
    return toError(error);
  }
};
