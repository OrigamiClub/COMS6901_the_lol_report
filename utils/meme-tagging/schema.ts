import { z } from "zod";

export const MEME_TAG_DIMENSIONS = ["humor_style", "subject"] as const;
export type MemeTagDimension = (typeof MEME_TAG_DIMENSIONS)[number];

export const MEME_TAG_STATUSES = ["proposed", "active", "retired"] as const;
export type MemeTagStatus = (typeof MEME_TAG_STATUSES)[number];

export const MEME_TAG_DIMENSION_LABELS: Record<MemeTagDimension, string> = {
  humor_style: "Humor style (captions)",
  subject: "Subject matter (images)",
};

export const isMemeTagDimension = (value: unknown): value is MemeTagDimension =>
  typeof value === "string" && (MEME_TAG_DIMENSIONS as readonly string[]).includes(value);

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const toSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export type TaxonomyTag = {
  slug: string;
  name: string;
  description: string | null;
};

/** Output of the taxonomy-drafting call. */
export const taxonomyDraftSchema = z.object({
  tags: z
    .array(
      z.object({
        name: z.string().describe("Short human-readable tag name, 1-4 words."),
        description: z
          .string()
          .describe("One sentence defining the tag precisely enough for consistent labeling."),
      }),
    )
    .min(6)
    .max(20),
});

export type TaxonomyDraft = z.infer<typeof taxonomyDraftSchema>;

const tagAssignmentSchema = (slugs: [string, ...string[]]) =>
  z.object({
    slug: z.enum(slugs),
    is_primary: z.boolean().describe("Exactly one assignment per item is primary."),
    confidence: z.number().min(0).max(1),
  });

/**
 * Output of one per-image tagging call: subject tags for the image plus
 * humor-style tags for each of its captions. Slugs are restricted to the
 * run's active taxonomy so the model cannot invent tags.
 */
export const buildImageTaggingSchema = (
  subjectSlugs: [string, ...string[]],
  humorStyleSlugs: [string, ...string[]],
  captionRefs: string[],
) => {
  // Restricting refs to the exact labels sent stops the model from echoing caption text back.
  const [firstRef, ...restRefs] = captionRefs;
  const captionRef = firstRef
    ? z.enum([firstRef, ...restRefs]).describe("The caption's reference label exactly as given, e.g. C1.")
    : z.enum(["NONE"]);

  return z.object({
    subject: z.array(tagAssignmentSchema(subjectSlugs)).min(1).max(3),
    captions: z
      .array(
        z.object({
          caption_ref: captionRef,
          humor_style: z.array(tagAssignmentSchema(humorStyleSlugs)).min(1).max(3),
        }),
      )
      .max(captionRefs.length),
    unfit_notes: z
      .string()
      .nullable()
      .describe(
        "If no available tag fits the image or a caption well, briefly say what is missing. Otherwise null.",
      ),
  });
};

export type ImageTaggingResult = z.infer<ReturnType<typeof buildImageTaggingSchema>>;

export type TagAssignment = {
  slug: string;
  is_primary: boolean;
  confidence: number;
};

/**
 * Models occasionally mark zero or several assignments as primary. Keep the
 * first primary (or the highest-confidence one), dedupe slugs, clamp confidence.
 */
export const normalizeAssignments = (assignments: TagAssignment[]): TagAssignment[] => {
  const bySlug = new Map<string, TagAssignment>();
  for (const assignment of assignments) {
    const existing = bySlug.get(assignment.slug);
    if (!existing || assignment.confidence > existing.confidence) {
      bySlug.set(assignment.slug, {
        ...assignment,
        confidence: Math.min(1, Math.max(0, assignment.confidence)),
      });
    }
  }

  const unique = [...bySlug.values()];
  if (unique.length === 0) {
    return unique;
  }

  const primary =
    unique.find((assignment) => assignment.is_primary) ??
    unique.reduce((best, assignment) => (assignment.confidence > best.confidence ? assignment : best));

  return unique.map((assignment) => ({ ...assignment, is_primary: assignment === primary }));
};
