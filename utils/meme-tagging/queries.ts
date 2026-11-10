import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, Tables } from "@/src/types/supabase";
import { mapWithConcurrency } from "@/utils/meme-tagging/concurrency";
import type { MemeTagDimension, TaxonomyTag } from "@/utils/meme-tagging/schema";

type Client = SupabaseClient<Database>;

export type MemeTagRow = Tables<"meme_tags">;
export type MemeTaggingRunRow = Tables<"meme_tagging_runs">;

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 120;

export type TaxonomySnapshot = {
  subject: TaxonomyTag[];
  humor_style: TaxonomyTag[];
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const fail = (context: string, error: { message: string } | null): never => {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
};

/**
 * Caption ids that belong to one study, or to any study when `studyId` is null
 * (paged past the 1,000-row API cap).
 */
const fetchStudyCaptionIds = async (supabase: Client, studyId: number | null): Promise<string[]> => {
  const captionIds = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from("study_caption_mappings").select("caption_id");
    if (studyId !== null) query = query.eq("study_id", studyId);
    const { data, error } = await query.order("id", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) fail("Unable to load study caption mappings", error);
    for (const row of data ?? []) {
      captionIds.add(row.caption_id);
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return [...captionIds];
};

/** Distinct image ids behind the captions of one study, or of every study when `studyId` is null. */
export const fetchStudyImageIds = async (supabase: Client, studyId: number | null = null): Promise<string[]> => {
  const captionIds = await fetchStudyCaptionIds(supabase, studyId);
  const imageIds = new Set<string>();
  for (const ids of chunk(captionIds, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase.from("captions").select("image_id").in("id", ids);
    if (error) fail("Unable to load study captions", error);
    for (const row of data ?? []) {
      if (row.image_id) imageIds.add(row.image_id);
    }
  }
  return [...imageIds].sort();
};

export const listMemeTags = async (supabase: Client): Promise<MemeTagRow[]> => {
  const { data, error } = await supabase
    .from("meme_tags")
    .select("*")
    .order("dimension", { ascending: true })
    .order("status", { ascending: true })
    .order("name", { ascending: true });
  if (error) fail("Unable to load meme tags", error);
  return data ?? [];
};

export const getActiveTaxonomy = async (supabase: Client): Promise<TaxonomySnapshot> => {
  const { data, error } = await supabase
    .from("meme_tags")
    .select("dimension, slug, name, description")
    .eq("status", "active")
    .order("slug", { ascending: true });
  if (error) fail("Unable to load active taxonomy", error);

  const snapshot: TaxonomySnapshot = { subject: [], humor_style: [] };
  for (const row of data ?? []) {
    if (row.dimension === "subject" || row.dimension === "humor_style") {
      snapshot[row.dimension].push({ slug: row.slug, name: row.name, description: row.description });
    }
  }
  return snapshot;
};

/** Latest run for one scope: a single study, or `null` for runs over all studies. */
export const getLatestRun = async (supabase: Client, studyId: number | null): Promise<MemeTaggingRunRow | null> => {
  const query = supabase.from("meme_tagging_runs").select("*");
  const { data, error } = await (studyId === null ? query.is("study_id", null) : query.eq("study_id", studyId))
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("Unable to load tagging runs", error);
  return data;
};

/** Runs still marked running, newest first (for "also in progress" notices). */
export const listRunningRuns = async (supabase: Client) => {
  const { data, error } = await supabase
    .from("meme_tagging_runs")
    .select("id, study_id, created_datetime_utc")
    .eq("status", "running")
    .order("id", { ascending: false });
  if (error) fail("Unable to load running tagging runs", error);
  return data ?? [];
};

export const getRun = async (supabase: Client, runId: number): Promise<MemeTaggingRunRow> => {
  const { data, error } = await supabase.from("meme_tagging_runs").select("*").eq("id", runId).maybeSingle();
  if (error) fail("Unable to load tagging run", error);
  if (!data) throw new Error(`Tagging run ${runId} not found.`);
  return data;
};

export const parseTaxonomySnapshot = (value: Json): TaxonomySnapshot => {
  const record = (value ?? {}) as Partial<Record<keyof TaxonomySnapshot, TaxonomyTag[]>>;
  return { subject: record.subject ?? [], humor_style: record.humor_style ?? [] };
};

export const getRunProgress = async (supabase: Client, runId: number) => {
  const [done, errored, unfit] = await Promise.all([
    supabase.from("meme_tagging_run_items").select("image_id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "done"),
    supabase.from("meme_tagging_run_items").select("image_id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "error"),
    supabase
      .from("meme_tagging_run_items")
      .select("image_id", { count: "exact", head: true })
      .eq("run_id", runId)
      .not("unfit_notes", "is", null),
  ]);
  if (done.error) fail("Unable to count finished images", done.error);
  if (errored.error) fail("Unable to count failed images", errored.error);
  if (unfit.error) fail("Unable to count unfit notes", unfit.error);
  return { done: done.count ?? 0, errored: errored.count ?? 0, unfit: unfit.count ?? 0 };
};

/**
 * Image ids in the run still to process. Untouched images by default; with
 * `retryErrors`, only images whose last attempt errored.
 */
export const getPendingImageIds = async (
  supabase: Client,
  run: MemeTaggingRunRow,
  limit: number,
  retryErrors: boolean,
): Promise<string[]> => {
  const statusById = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("meme_tagging_run_items")
      .select("image_id, status")
      .eq("run_id", run.id)
      .order("image_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail("Unable to load run progress", error);
    for (const row of data ?? []) statusById.set(row.image_id, row.status);
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return run.image_ids
    .filter((imageId) => (retryErrors ? statusById.get(imageId) === "error" : !statusById.has(imageId)))
    .slice(0, limit);
};

export type ImageWorkItem = {
  id: string;
  url: string;
  image_description: string | null;
  captions: { id: string; content: string }[];
};

/**
 * One image with its study captions. Captions outside any study are skipped; with
 * `studyId`, only captions in that study are included.
 */
export const getImageWorkItem = async (
  supabase: Client,
  imageId: string,
  studyId: number | null = null,
): Promise<ImageWorkItem | null> => {
  const { data: image, error: imageError } = await supabase
    .from("images")
    .select("id, url, image_description")
    .eq("id", imageId)
    .maybeSingle();
  if (imageError) fail("Unable to load image", imageError);
  if (!image?.url) return null;

  const { data: captions, error: captionError } = await supabase
    .from("captions")
    .select("id, content")
    .eq("image_id", imageId)
    .order("id", { ascending: true });
  if (captionError) fail("Unable to load captions", captionError);

  const candidateIds = (captions ?? []).map((caption) => caption.id);
  const studyCaptionIds = new Set<string>();
  for (const ids of chunk(candidateIds, IN_CHUNK_SIZE)) {
    let query = supabase.from("study_caption_mappings").select("caption_id").in("caption_id", ids);
    if (studyId !== null) query = query.eq("study_id", studyId);
    const { data, error } = await query;
    if (error) fail("Unable to load study caption mappings", error);
    for (const row of data ?? []) studyCaptionIds.add(row.caption_id);
  }

  return {
    id: image.id,
    url: image.url,
    image_description: image.image_description,
    captions: (captions ?? [])
      .flatMap((caption) => {
        const content = caption.content?.trim();
        return studyCaptionIds.has(caption.id) && content ? [{ id: caption.id, content }] : [];
      }),
  };
};

export const getTagIdMap = async (
  supabase: Client,
  dimension: MemeTagDimension,
  slugs: string[],
): Promise<Map<string, number>> => {
  if (slugs.length === 0) return new Map();
  const { data, error } = await supabase.from("meme_tags").select("id, slug").eq("dimension", dimension).in("slug", slugs);
  if (error) fail("Unable to resolve tag ids", error);
  return new Map((data ?? []).map((row) => [row.slug, row.id]));
};

export const getLlmModelId = async (supabase: Client, providerModelId: string): Promise<number | null> => {
  const { data, error } = await supabase
    .from("llm_models")
    .select("id")
    .eq("provider_model_id", providerModelId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.id ?? null;
};

export type DraftSampleRow = {
  image_description: string | null;
  captions: string[];
};

/** A random sample of study images with a few of their captions, for drafting the taxonomy. */
export const getDraftSample = async (
  supabase: Client,
  imageCount: number,
  captionsPerImage: number,
): Promise<DraftSampleRow[]> => {
  const imageIds = await fetchStudyImageIds(supabase);
  const shuffled = [...imageIds].sort(() => Math.random() - 0.5).slice(0, imageCount);

  const items = await mapWithConcurrency(shuffled, 8, (imageId) => getImageWorkItem(supabase, imageId));

  return items
    .filter((item): item is ImageWorkItem => Boolean(item && item.captions.length > 0))
    .map((item) => ({
      image_description: item.image_description,
      captions: [...item.captions]
        .sort(() => Math.random() - 0.5)
        .slice(0, captionsPerImage)
        .map((caption) => caption.content),
    }));
};

export const getCommonUseCategoryNames = async (supabase: Client): Promise<string[]> => {
  const { data, error } = await supabase.from("common_use_categories").select("name").order("name");
  if (error) return [];
  return (data ?? []).map((row) => row.name?.trim() ?? "").filter(Boolean);
};

export const listUnfitNotes = async (supabase: Client, runId: number, limit = 25) => {
  const { data, error } = await supabase
    .from("meme_tagging_run_items")
    .select("image_id, unfit_notes, error_message, status")
    .eq("run_id", runId)
    .or("unfit_notes.not.is.null,status.eq.error")
    .order("modified_datetime_utc", { ascending: false })
    .limit(limit);
  if (error) fail("Unable to load run notes", error);
  return data ?? [];
};
