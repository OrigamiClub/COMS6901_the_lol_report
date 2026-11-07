import type { MemeTagDimension, TaxonomyTag } from "@/utils/meme-tagging/schema";

/** Bump whenever the tagging prompt changes so runs stay comparable. */
export const PROMPT_VERSION = "meme-tagging-v1";

export type DraftSampleMeme = {
  image_description: string | null;
  captions: string[];
};

const formatSample = (sample: DraftSampleMeme[], dimension: MemeTagDimension) =>
  sample
    .map((meme, index) => {
      const lines = [`Meme ${index + 1}`];
      lines.push(`  Image: ${meme.image_description?.trim() || "(no description available)"}`);
      if (dimension === "humor_style") {
        for (const caption of meme.captions) {
          lines.push(`  Caption: ${caption}`);
        }
      } else if (meme.captions[0]) {
        lines.push(`  Example caption: ${meme.captions[0]}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

export const buildTaxonomyDraftPrompt = (
  dimension: MemeTagDimension,
  sample: DraftSampleMeme[],
  existingCategoryNames: string[],
) => {
  const system =
    "You are a humor researcher designing a labeling taxonomy for a study where college students rate captioned memes. " +
    "Tags must be mutually distinguishable, cover most of the data, and be definable in one sentence so different labelers agree.";

  const task =
    dimension === "humor_style"
      ? "Propose 10-15 HUMOR STYLE tags describing the comedic mechanism of a caption (how the joke works), " +
        "e.g. wordplay, absurdism, relatable observation, self-deprecation, irony, exaggeration. " +
        "Describe the joke technique, not the topic. Avoid tags that depend only on the image."
      : "Propose 10-15 SUBJECT MATTER tags describing what the IMAGE depicts or is about " +
        "(topic or content, e.g. animals, campus life, food, pop culture). Describe the content, not the joke. " +
        (existingCategoryNames.length > 0
          ? `An older, coarser image category list exists; reuse or refine its ideas where they fit: ${existingCategoryNames.join(", ")}.`
          : "");

  const prompt = `${task}\n\nHere is a sample of memes from the studies:\n\n${formatSample(sample, dimension)}`;

  return { system, prompt };
};

export type TaggingCaption = {
  ref: string;
  content: string;
};

const formatTaxonomy = (tags: TaxonomyTag[]) =>
  tags.map((tag) => `- ${tag.slug}: ${tag.name}${tag.description ? ` — ${tag.description}` : ""}`).join("\n");

export const buildImageTaggingPrompt = (
  subjectTags: TaxonomyTag[],
  humorStyleTags: TaxonomyTag[],
  imageDescription: string | null,
  captions: TaggingCaption[],
) => {
  const system =
    "You label memes for a humor research study. Use ONLY the tag slugs provided. " +
    "For each item give 1-3 tags, mark exactly one as primary (the best fit), and give each a confidence from 0 to 1. " +
    "Be consistent: the same kind of joke should get the same tag across memes.";

  const captionLines = captions.map((caption) => `${caption.ref}: ${caption.content}`).join("\n");

  const prompt = [
    "SUBJECT MATTER tags (apply to the image itself):",
    formatTaxonomy(subjectTags),
    "",
    "HUMOR STYLE tags (apply to each caption: how its joke works, given the image):",
    formatTaxonomy(humorStyleTags),
    "",
    imageDescription?.trim() ? `Existing image description: ${imageDescription.trim()}` : "",
    "",
    "Captions written for this image:",
    captionLines,
    "",
    "Return subject tags for the image, and humor style tags for every caption listed (use its reference label).",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");

  return { system, prompt };
};
