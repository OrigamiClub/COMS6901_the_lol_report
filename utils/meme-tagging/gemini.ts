import "server-only";

import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";

import {
  buildImageTaggingPrompt,
  buildTaxonomyDraftPrompt,
  type DraftSampleMeme,
  type TaggingCaption,
} from "@/utils/meme-tagging/prompts";
import {
  buildImageTaggingSchema,
  taxonomyDraftSchema,
  type ImageTaggingResult,
  type MemeTagDimension,
  type TaxonomyDraft,
  type TaxonomyTag,
} from "@/utils/meme-tagging/schema";

const DEFAULT_MODEL = "gemini-3.8-flash";
const API_KEY_ENV_VAR = "GOOGLE_GENERATIVE_AI_API_KEY";

export const getMemeTaggingModelName = () => process.env.MEME_TAGGING_MODEL?.trim() || DEFAULT_MODEL;

export const isGeminiConfigured = () => Boolean(process.env[API_KEY_ENV_VAR]?.trim());

const assertGeminiConfigured = () => {
  if (!isGeminiConfigured()) {
    throw new Error(`Missing ${API_KEY_ENV_VAR}. Add it to .env.local (server-only) and restart the server.`);
  }
};

export const draftTaxonomyWithGemini = async (
  dimension: MemeTagDimension,
  sample: DraftSampleMeme[],
  existingCategoryNames: string[],
): Promise<TaxonomyDraft> => {
  assertGeminiConfigured();
  const { system, prompt } = buildTaxonomyDraftPrompt(dimension, sample, existingCategoryNames);

  const { output } = await generateText({
    model: google(getMemeTaggingModelName()),
    system,
    prompt,
    temperature: 0.4,
    output: Output.object({ schema: taxonomyDraftSchema, name: "taxonomy_draft" }),
  });

  return output;
};

export const tagImageWithGemini = async ({
  imageUrl,
  imageDescription,
  captions,
  subjectTags,
  humorStyleTags,
}: {
  imageUrl: string;
  imageDescription: string | null;
  captions: TaggingCaption[];
  subjectTags: TaxonomyTag[];
  humorStyleTags: TaxonomyTag[];
}): Promise<ImageTaggingResult> => {
  assertGeminiConfigured();

  const [firstSubject, ...restSubject] = subjectTags.map((tag) => tag.slug);
  const [firstStyle, ...restStyle] = humorStyleTags.map((tag) => tag.slug);
  if (!firstSubject || !firstStyle) {
    throw new Error("Both taxonomies need at least one active tag.");
  }

  const schema = buildImageTaggingSchema(
    [firstSubject, ...restSubject],
    [firstStyle, ...restStyle],
    captions.map((caption) => caption.ref),
  );
  const { system, prompt } = buildImageTaggingPrompt(subjectTags, humorStyleTags, imageDescription, captions);

  const { output } = await generateText({
    model: google(getMemeTaggingModelName()),
    system,
    temperature: 0,
    output: Output.object({ schema, name: "meme_tags" }),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", image: new URL(imageUrl) },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  return output;
};
