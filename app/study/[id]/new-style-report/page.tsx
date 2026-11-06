import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LocalStudyWindow } from "@/components/local-study-window";
import { ReportLoadForm } from "@/components/report-load-form";
import {
  StudyNewStyleCaptionBreakdown,
  StudyNewStyleUserTable,
  type StudyNewStyleCaptionTableRow,
  type StudyNewStyleUserTableRow,
} from "@/components/study-new-style-report-tables";
import type { Database, Tables } from "@/src/types/supabase";
import { formatDurationFromMinutes } from "@/utils/format-duration";
import { createClient } from "@/utils/supabase/server";

const NEW_STYLE_MIN_STUDY_ID = 7;
const DEFAULT_MIN_USER_NAVIGATION_EVENTS = 1;
const MAX_MIN_USER_NAVIGATION_EVENTS = 10000;
const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;
const MS_PER_MINUTE = 1000 * 60;

type NewStyleReportSearchParams = Promise<{
  minUserNavigationEvents?: string;
}>;

type NewStyleReportPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: NewStyleReportSearchParams;
};

type StudySummary = Pick<
  Tables<"studies">,
  | "id"
  | "slug"
  | "description"
  | "start_datetime_utc"
  | "end_datetime_utc"
  | "created_datetime_utc"
>;

type StudyCaptionMappingRow = Pick<
  Tables<"study_caption_mappings">,
  "id" | "study_id" | "caption_id"
>;

type CaptionSummary = Pick<Tables<"captions">, "id" | "content" | "image_id">;

type ImageSummary = Pick<Tables<"images">, "id" | "url" | "image_description">;

type StudyCaptionNavigationEventRow = Pick<
  Tables<"study_caption_navigation_events">,
  | "id"
  | "profile_id"
  | "caption_id"
  | "study_caption_mapping_id"
  | "time_to_next_caption_ms"
  | "input_method"
  | "session_id"
  | "created_datetime_utc"
>;

type StudyCaptionVoteEventRow = Pick<
  Tables<"study_caption_vote_events">,
  | "id"
  | "profile_id"
  | "caption_id"
  | "study_caption_mapping_id"
  | "time_to_vote_ms"
  | "input_method"
  | "session_id"
  | "created_datetime_utc"
>;

type ProfileSummary = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "last_name">;

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: { message: string } | null;
};

type NumberParamParseResult = {
  value: number;
  isValid: boolean;
};

type UserAccumulator = {
  profile_id: string;
  navigation_events: number;
  like_events: number;
  captions_seen: Set<number>;
  captions_liked: Set<number>;
  liked_navigation_events: number;
  skipped_navigation_events: number;
  time_to_next_caption_ms: number[];
  time_to_vote_ms: number[];
  input_method_counts: Map<string, number>;
  last_interaction_datetime_utc: string | null;
  last_interaction_event_id: number | null;
};

type CaptionAccumulator = {
  mapping_id: number;
  caption_id: string;
  viewer_ids: Set<string>;
  liker_ids: Set<string>;
};

type NewStyleReport = {
  study: StudySummary;
  distinct_navigation_users: number;
  total_user_captions_seen: number;
  total_user_captions_liked: number;
  like_rate: number | null;
  median_time_to_next_caption_minutes: number | null;
  user_rows: StudyNewStyleUserTableRow[];
  caption_rows: StudyNewStyleCaptionTableRow[];
};

const roundNumber = (value: number, digits = 4) => Number(value.toFixed(digits));

const parseStudyIdParam = (rawValue: string) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < NEW_STYLE_MIN_STUDY_ID) {
    return null;
  }

  return parsed;
};

const parseBoundedInteger = (
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): NumberParamParseResult => {
  if (!rawValue) {
    return { value: fallback, isValid: true };
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { value: fallback, isValid: false };
  }

  return { value: parsed, isValid: true };
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve: () => void) => {
    setTimeout(() => resolve(), ms);
  });

const isLikelyTransientFetchError = (message: string) => {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("socket hang up")
  );
};

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const fetchRowsWithPagination = async <TRow,>({
  contextLabel,
  pageSize = QUERY_PAGE_SIZE,
  runQuery,
}: {
  contextLabel: string;
  pageSize?: number;
  runQuery: (from: number, to: number) => Promise<SupabaseQueryResult<TRow>>;
}): Promise<TRow[]> => {
  for (let attempt = 1; attempt <= QUERY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const rows: TRow[] = [];
      let from = 0;

      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await runQuery(from, to);
        if (error) {
          throw new Error(error.message);
        }

        const pageRows = data ?? [];
        rows.push(...pageRows);
        if (pageRows.length < pageSize) {
          return rows;
        }

        from += pageSize;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown query error";
      const transient = isLikelyTransientFetchError(message);
      const hasRemainingRetries = attempt < QUERY_RETRY_ATTEMPTS;
      if (transient && hasRemainingRetries) {
        await wait(QUERY_RETRY_BASE_DELAY_MS * attempt);
        continue;
      }

      throw new Error(`Unable to load ${contextLabel}: ${message}`);
    }
  }

  throw new Error(`Unable to load ${contextLabel}: exhausted retries`);
};

const fetchRowsWithAdaptiveChunks = async <TRow,>({
  ids,
  contextLabel,
  pageSize = QUERY_PAGE_SIZE,
  runQuery,
}: {
  ids: string[];
  contextLabel: string;
  pageSize?: number;
  runQuery: (chunk: string[], from: number, to: number) => Promise<SupabaseQueryResult<TRow>>;
}): Promise<TRow[]> => {
  const rows: TRow[] = [];

  const fetchChunk = async (chunk: string[]): Promise<void> => {
    for (let attempt = 1; attempt <= QUERY_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const chunkRows: TRow[] = [];
        let from = 0;

        while (true) {
          const to = from + pageSize - 1;
          const { data, error } = await runQuery(chunk, from, to);
          if (error) {
            throw new Error(error.message);
          }

          const pageRows = data ?? [];
          chunkRows.push(...pageRows);
          if (pageRows.length < pageSize) {
            break;
          }

          from += pageSize;
        }

        rows.push(...chunkRows);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown query error";
        const transient = isLikelyTransientFetchError(message);
        const hasRemainingRetries = attempt < QUERY_RETRY_ATTEMPTS;
        if (transient && hasRemainingRetries) {
          await wait(QUERY_RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        const canSplitChunk = transient && chunk.length > MIN_QUERY_CHUNK_SIZE;
        if (canSplitChunk) {
          const midpoint = Math.ceil(chunk.length / 2);
          await fetchChunk(chunk.slice(0, midpoint));
          await fetchChunk(chunk.slice(midpoint));
          return;
        }

        throw new Error(`Unable to load ${contextLabel}: ${message}`);
      }
    }
  };

  for (const chunk of chunkArray(ids, QUERY_CHUNK_SIZE)) {
    await fetchChunk(chunk);
  }

  return rows;
};

const getStudies = async (supabase: SupabaseClient<Database>): Promise<StudySummary[]> =>
  fetchRowsWithPagination<StudySummary>({
    contextLabel: "new style studies",
    runQuery: async (from, to) =>
      (await supabase
        .from("studies")
        .select(
          "id, slug, description, start_datetime_utc, end_datetime_utc, created_datetime_utc",
        )
        .gte("id", NEW_STYLE_MIN_STUDY_ID)
        .order("id", { ascending: false })
        .range(from, to)) as SupabaseQueryResult<StudySummary>,
  });

const getStudyCaptionMappings = async (
  supabase: SupabaseClient<Database>,
  studyId: number,
): Promise<StudyCaptionMappingRow[]> =>
  fetchRowsWithPagination<StudyCaptionMappingRow>({
    contextLabel: "study caption mappings",
    runQuery: async (from, to) =>
      (await supabase
        .from("study_caption_mappings")
        .select("id, study_id, caption_id")
        .eq("study_id", studyId)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyCaptionMappingRow>,
  });

const getNavigationEventsByStudyCaptionMappingId = async (
  supabase: SupabaseClient<Database>,
  studyCaptionMappingIds: number[],
): Promise<StudyCaptionNavigationEventRow[]> => {
  if (studyCaptionMappingIds.length === 0) {
    return [];
  }

  return fetchRowsWithAdaptiveChunks<StudyCaptionNavigationEventRow>({
    ids: studyCaptionMappingIds.map(String),
    contextLabel: "study caption navigation events",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("study_caption_navigation_events")
        .select(
          "id, profile_id, caption_id, study_caption_mapping_id, time_to_next_caption_ms, input_method, session_id, created_datetime_utc",
        )
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
        .order("created_datetime_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyCaptionNavigationEventRow>,
  });
};

const getVoteEventsByStudyCaptionMappingId = async (
  supabase: SupabaseClient<Database>,
  studyCaptionMappingIds: number[],
): Promise<StudyCaptionVoteEventRow[]> => {
  if (studyCaptionMappingIds.length === 0) {
    return [];
  }

  return fetchRowsWithAdaptiveChunks<StudyCaptionVoteEventRow>({
    ids: studyCaptionMappingIds.map(String),
    contextLabel: "study caption vote events",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("study_caption_vote_events")
        .select(
          "id, profile_id, caption_id, study_caption_mapping_id, time_to_vote_ms, input_method, session_id, created_datetime_utc",
        )
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
        .order("created_datetime_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyCaptionVoteEventRow>,
  });
};

const getCaptionsById = async (
  supabase: SupabaseClient<Database>,
  captionIds: string[],
): Promise<Map<string, CaptionSummary>> => {
  const captionsById = new Map<string, CaptionSummary>();
  if (captionIds.length === 0) {
    return captionsById;
  }

  const rows = await fetchRowsWithAdaptiveChunks<CaptionSummary>({
    ids: captionIds,
    contextLabel: "captions",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("captions")
        .select("id, content, image_id")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<CaptionSummary>,
  });

  for (const row of rows) {
    captionsById.set(row.id, row);
  }

  return captionsById;
};

const getImagesById = async (
  supabase: SupabaseClient<Database>,
  imageIds: string[],
): Promise<Map<string, ImageSummary>> => {
  const imagesById = new Map<string, ImageSummary>();
  if (imageIds.length === 0) {
    return imagesById;
  }

  const rows = await fetchRowsWithAdaptiveChunks<ImageSummary>({
    ids: imageIds,
    contextLabel: "images",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("images")
        .select("id, url, image_description")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<ImageSummary>,
  });

  for (const row of rows) {
    imagesById.set(row.id, row);
  }

  return imagesById;
};

const getProfilesById = async (
  supabase: SupabaseClient<Database>,
  profileIds: string[],
): Promise<Map<string, ProfileSummary>> => {
  const profilesById = new Map<string, ProfileSummary>();
  if (profileIds.length === 0) {
    return profilesById;
  }

  const rows = await fetchRowsWithAdaptiveChunks<ProfileSummary>({
    ids: profileIds,
    contextLabel: "profiles",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<ProfileSummary>,
  });

  for (const row of rows) {
    profilesById.set(row.id, row);
  }

  return profilesById;
};

const getStudyLabel = (study: StudySummary) => {
  if (study.slug) {
    return `${study.id} - ${study.slug}`;
  }

  if (study.description) {
    return `${study.id} - ${study.description}`;
  }

  return `Study ${study.id}`;
};

const getProfileLabel = (profileId: string, profile?: ProfileSummary) => {
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  if (fullName) {
    return fullName;
  }

  if (profile?.email) {
    return profile.email;
  }

  return `User ${profileId.slice(0, 8)}`;
};

const getCaptionPreview = (captionId: string, caption?: CaptionSummary) => {
  const content = caption?.content?.replace(/\s+/g, " ").trim();
  if (!content) {
    return `Caption ${captionId.slice(0, 8)}`;
  }

  return content.length <= 160 ? content : `${content.slice(0, 157)}...`;
};

const getCaptionText = (captionId: string, caption?: CaptionSummary) => {
  const content = caption?.content?.replace(/\s+/g, " ").trim();
  if (!content) {
    return `Caption ${captionId.slice(0, 8)}`;
  }

  return content;
};

const computeMedian = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middleIndex];
  }

  return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
};

const computeMedianMinutesFromMs = (values: number[]) => {
  const medianMs = computeMedian(values.filter((value) => Number.isFinite(value) && value >= 0));

  return medianMs === null ? null : roundNumber(medianMs / MS_PER_MINUTE, 2);
};

const computeRate = (numerator: number, denominator: number) =>
  denominator === 0 ? null : roundNumber(numerator / denominator, 4);

const shouldReplaceLastInteraction = ({
  candidateEvent,
  currentEventId,
  currentTimestamp,
}: {
  candidateEvent: StudyCaptionNavigationEventRow;
  currentEventId: number | null;
  currentTimestamp: string | null;
}) => {
  if (currentTimestamp === null || currentEventId === null) {
    return true;
  }

  const candidateTime = Date.parse(candidateEvent.created_datetime_utc);
  const currentTime = Date.parse(currentTimestamp);

  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime)) {
    if (candidateTime !== currentTime) {
      return candidateTime > currentTime;
    }

    return candidateEvent.id > currentEventId;
  }

  if (Number.isFinite(candidateTime)) {
    return true;
  }

  if (Number.isFinite(currentTime)) {
    return false;
  }

  return candidateEvent.id > currentEventId;
};

const getEventMatchKey = ({
  profile_id,
  study_caption_mapping_id,
  session_id,
}: {
  profile_id: string;
  study_caption_mapping_id: number | null;
  session_id: string | null;
}) => {
  if (study_caption_mapping_id === null) {
    return null;
  }

  return `${profile_id}|${study_caption_mapping_id}|${session_id ?? "no-session"}`;
};

const incrementInputMethod = (counts: Map<string, number>, inputMethod: string) => {
  counts.set(inputMethod, (counts.get(inputMethod) ?? 0) + 1);
};

const getInputMethodLabel = (inputMethod: string) => {
  switch (inputMethod) {
    case "button":
      return "Button";
    case "swipe":
      return "Swipe";
    case "keyboard":
      return "Keyboard";
    case "unknown":
      return "Unknown";
    default:
      return inputMethod;
  }
};

const getPrimaryInputMethod = (counts: Map<string, number>) => {
  const [primary] = [...counts.entries()].sort((left, right) => {
    if (left[1] !== right[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });

  return primary ? getInputMethodLabel(primary[0]) : "n/a";
};

const createUserAccumulator = (profileId: string): UserAccumulator => ({
  profile_id: profileId,
  navigation_events: 0,
  like_events: 0,
  captions_seen: new Set<number>(),
  captions_liked: new Set<number>(),
  liked_navigation_events: 0,
  skipped_navigation_events: 0,
  time_to_next_caption_ms: [],
  time_to_vote_ms: [],
  input_method_counts: new Map<string, number>(),
  last_interaction_datetime_utc: null,
  last_interaction_event_id: null,
});

const createCaptionAccumulator = (mapping: StudyCaptionMappingRow): CaptionAccumulator => ({
  mapping_id: mapping.id,
  caption_id: mapping.caption_id,
  viewer_ids: new Set<string>(),
  liker_ids: new Set<string>(),
});

const buildNewStyleReport = ({
  study,
  mappings,
  navigationRows,
  voteRows,
  captionsById,
  imagesById,
  profilesById,
}: {
  study: StudySummary;
  mappings: StudyCaptionMappingRow[];
  navigationRows: StudyCaptionNavigationEventRow[];
  voteRows: StudyCaptionVoteEventRow[];
  captionsById: Map<string, CaptionSummary>;
  imagesById: Map<string, ImageSummary>;
  profilesById: Map<string, ProfileSummary>;
}): NewStyleReport => {
  const userAccumulators = new Map<string, UserAccumulator>();
  const captionAccumulators = new Map<number, CaptionAccumulator>(
    mappings.map((mapping) => [mapping.id, createCaptionAccumulator(mapping)]),
  );
  const sameSessionLikeKeys = new Set<string>();
  const distinctNavigationUsers = new Set<string>();

  const getUserAccumulator = (profileId: string) => {
    const existing = userAccumulators.get(profileId);
    if (existing) {
      return existing;
    }

    const next = createUserAccumulator(profileId);
    userAccumulators.set(profileId, next);

    return next;
  };

  for (const vote of voteRows) {
    const key = getEventMatchKey(vote);
    if (key) {
      sameSessionLikeKeys.add(key);
    }
  }

  for (const navigationEvent of navigationRows) {
    if (navigationEvent.study_caption_mapping_id === null) {
      continue;
    }

    distinctNavigationUsers.add(navigationEvent.profile_id);
    const user = getUserAccumulator(navigationEvent.profile_id);
    const caption = captionAccumulators.get(navigationEvent.study_caption_mapping_id);
    const key = getEventMatchKey(navigationEvent);
    const hasSameSessionLike = key !== null && sameSessionLikeKeys.has(key);

    if (
      shouldReplaceLastInteraction({
        candidateEvent: navigationEvent,
        currentEventId: user.last_interaction_event_id,
        currentTimestamp: user.last_interaction_datetime_utc,
      })
    ) {
      user.last_interaction_datetime_utc = navigationEvent.created_datetime_utc;
      user.last_interaction_event_id = navigationEvent.id;
    }

    user.navigation_events += 1;
    user.captions_seen.add(navigationEvent.study_caption_mapping_id);
    user.time_to_next_caption_ms.push(navigationEvent.time_to_next_caption_ms);
    incrementInputMethod(user.input_method_counts, navigationEvent.input_method);
    if (hasSameSessionLike) {
      user.liked_navigation_events += 1;
      user.captions_liked.add(navigationEvent.study_caption_mapping_id);
    } else {
      user.skipped_navigation_events += 1;
    }

    if (caption) {
      caption.viewer_ids.add(navigationEvent.profile_id);
      if (hasSameSessionLike) {
        caption.liker_ids.add(navigationEvent.profile_id);
      }
    }
  }

  for (const vote of voteRows) {
    if (vote.study_caption_mapping_id === null) {
      continue;
    }

    const user = getUserAccumulator(vote.profile_id);

    user.like_events += 1;
    incrementInputMethod(user.input_method_counts, vote.input_method);
    if (vote.time_to_vote_ms !== null) {
      user.time_to_vote_ms.push(vote.time_to_vote_ms);
    }

  }

  const userRows = [...userAccumulators.values()].map((user) => {
    const profile = profilesById.get(user.profile_id);

    return {
      profile_id: user.profile_id,
      user_label: getProfileLabel(user.profile_id, profile),
      email: profile?.email ?? null,
      navigation_events: user.navigation_events,
      like_events: user.like_events,
      captions_seen: user.captions_seen.size,
      captions_liked: user.captions_liked.size,
      liked_navigation_events: user.liked_navigation_events,
      skipped_navigation_events: user.skipped_navigation_events,
      skip_rate: computeRate(user.skipped_navigation_events, user.navigation_events),
      like_events_per_navigation: computeRate(user.like_events, user.navigation_events),
      like_rate: computeRate(user.captions_liked.size, user.captions_seen.size),
      median_time_to_next_caption_minutes: computeMedianMinutesFromMs(
        user.time_to_next_caption_ms,
      ),
      median_time_to_vote_minutes: computeMedianMinutesFromMs(user.time_to_vote_ms),
      primary_input_method: getPrimaryInputMethod(user.input_method_counts),
      last_interaction_datetime_utc: user.last_interaction_datetime_utc,
    };
  });

  const captionRows = [...captionAccumulators.values()].map((caption) => {
    const captionSummary = captionsById.get(caption.caption_id);
    const image = captionSummary ? imagesById.get(captionSummary.image_id) : undefined;

    return {
      mapping_id: caption.mapping_id,
      caption_id: caption.caption_id,
      caption_text: getCaptionText(caption.caption_id, captionSummary),
      caption_preview: getCaptionPreview(caption.caption_id, captionSummary),
      image_url: image?.url ?? null,
      image_description: image?.image_description ?? null,
      like_rate: computeRate(caption.liker_ids.size, caption.viewer_ids.size),
    };
  });

  const totalUserCaptionsSeen = userRows.reduce((total, row) => total + row.captions_seen, 0);
  const totalUserCaptionsLiked = userRows.reduce((total, row) => total + row.captions_liked, 0);

  return {
    study,
    distinct_navigation_users: distinctNavigationUsers.size,
    total_user_captions_seen: totalUserCaptionsSeen,
    total_user_captions_liked: totalUserCaptionsLiked,
    like_rate: computeRate(totalUserCaptionsLiked, totalUserCaptionsSeen),
    median_time_to_next_caption_minutes: computeMedianMinutesFromMs(
      navigationRows.map((row) => row.time_to_next_caption_ms),
    ),
    user_rows: userRows,
    caption_rows: captionRows,
  };
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
};

export const dynamic = "force-dynamic";

export default async function NewStyleReportPage({
  params: routeParams,
  searchParams,
}: NewStyleReportPageProps) {
  const [{ id }, params] = await Promise.all([routeParams, searchParams]);
  const requestedStudyId = parseStudyIdParam(id);
  if (requestedStudyId === null) {
    notFound();
  }

  const minUserNavigationEventsResult = parseBoundedInteger(
    params.minUserNavigationEvents,
    DEFAULT_MIN_USER_NAVIGATION_EVENTS,
    1,
    MAX_MIN_USER_NAVIGATION_EVENTS,
  );
  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const selectedStudy = studies.find((study) => study.id === requestedStudyId) ?? null;
  if (selectedStudy === null) {
    notFound();
  }

  const mappings = await getStudyCaptionMappings(supabase, requestedStudyId);
  const mappingIds = mappings.map((mapping) => mapping.id);
  const captionIds = [...new Set(mappings.map((mapping) => mapping.caption_id))];
  const [navigationRows, voteRows, captionsById] = await Promise.all([
    getNavigationEventsByStudyCaptionMappingId(supabase, mappingIds),
    getVoteEventsByStudyCaptionMappingId(supabase, mappingIds),
    getCaptionsById(supabase, captionIds),
  ]);
  const imageIds = [...new Set([...captionsById.values()].map((caption) => caption.image_id))];
  const profileIds = [
    ...new Set([
      ...navigationRows.map((row) => row.profile_id),
      ...voteRows.map((row) => row.profile_id),
    ]),
  ];
  const [profilesById, imagesById] = await Promise.all([
    getProfilesById(supabase, profileIds),
    getImagesById(supabase, imageIds),
  ]);
  const report = buildNewStyleReport({
    study: selectedStudy,
    mappings,
    navigationRows,
    voteRows,
    captionsById,
    imagesById,
    profilesById,
  });
  const thresholdUserRows = report.user_rows.filter(
    (row) => row.navigation_events >= minUserNavigationEventsResult.value,
  );

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">New Study Interface Report</h1>
            </div>
            <Link
              href="/"
              className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
            >
              Home
            </Link>
          </div>

          <section className="app-card rounded-xl p-5">
            <p className="app-kicker text-xs font-semibold uppercase tracking-[0.2em]">
              Current Study
            </p>
            <p className="mt-2 text-2xl font-bold sm:text-3xl">{getStudyLabel(report.study)}</p>
            <p className="app-muted mt-2 text-sm">
              Study window:{" "}
              <LocalStudyWindow
                start={report.study.start_datetime_utc ?? report.study.created_datetime_utc}
                end={report.study.end_datetime_utc}
              />
            </p>
          </section>

          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "new-style-report",
            }}
          >
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Change Study</span>
              <select
                name="studyId"
                defaultValue={requestedStudyId.toString()}
                disabled={studies.length === 0}
                className="app-input h-9 min-w-80 rounded-md px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {studies.map((study) => (
                  <option key={study.id} value={study.id}>
                    {getStudyLabel(study)}
                  </option>
                ))}
              </select>
            </label>
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Min user nav events</span>
              <input
                type="number"
                name="minUserNavigationEvents"
                min={1}
                max={MAX_MIN_USER_NAVIGATION_EVENTS}
                defaultValue={minUserNavigationEventsResult.value}
                className="app-input h-9 w-48 rounded-md px-2 text-sm outline-none"
              />
            </label>
          </ReportLoadForm>
          {!minUserNavigationEventsResult.isValid && params.minUserNavigationEvents ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid <code>minUserNavigationEvents</code> value. Using default of{" "}
              {DEFAULT_MIN_USER_NAVIGATION_EVENTS}.
            </p>
          ) : null}
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Users
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {report.distinct_navigation_users.toLocaleString()}
            </p>
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Median Next Caption
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatDurationFromMinutes(report.median_time_to_next_caption_minutes)}
            </p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Like Rate
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatPercent(report.like_rate)}
            </p>
            <p className="app-muted mt-1 text-xs">
              {report.total_user_captions_liked.toLocaleString()} liked /{" "}
              {report.total_user_captions_seen.toLocaleString()} seen
            </p>
          </article>
        </section>

        <section className="space-y-2">
          <div>
            <h2 className="text-lg font-semibold">Caption Breakdown</h2>
            <p className="app-muted text-sm">Every caption mapped to the selected study.</p>
          </div>
          {report.caption_rows.length ? (
            <StudyNewStyleCaptionBreakdown rows={report.caption_rows} />
          ) : (
            <p className="app-muted text-sm">No caption mappings were found for this study.</p>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">User Breakdown</h2>
              <p className="app-muted text-sm">
                Loaded {thresholdUserRows.length.toLocaleString()} users with at least{" "}
                {minUserNavigationEventsResult.value.toLocaleString()} navigation events.
              </p>
            </div>
          </div>
          {thresholdUserRows.length ? (
            <StudyNewStyleUserTable rows={thresholdUserRows} />
          ) : (
            <p className="app-muted text-sm">No users match the current threshold.</p>
          )}
        </section>
      </section>
    </main>
  );
}
