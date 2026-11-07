import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { StudyDetailCaptionGallery } from "./caption-gallery";
import { StudyDetailVoteTimeFilter } from "./vote-time-filter";
import {
  DEFAULT_CAPTION_GALLERY_SORT,
  sortCaptionRows,
  type CaptionDetailRow,
  type VoteDistributionRow,
} from "./caption-gallery-shared";

import { ReportLoadForm } from "@/components/report-load-form";
import { NEW_STYLE_MIN_STUDY_ID, StudyHeaderActions } from "@/components/study-header-actions";
import type { Database, Tables } from "@/src/types/supabase";
import { formatDurationFromMinutes } from "@/utils/format-duration";
import { createClient } from "@/utils/supabase/server";
import {
  getStudyVoteValueLabel,
  isPositiveStudyVote,
  STUDY_VOTE_VALUE_ORDER,
  type StudyCaptionVoteEventRow,
  type StudyVoteValue,
} from "@/utils/study-vote-events";

const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;
const MS_PER_MINUTE = 1000 * 60;
const VOTE_TIME_BUCKET_SIZE_SECONDS = 5;

type StudyDetailSearchParams = Promise<{
  minVoteSeconds?: string;
  maxVoteSeconds?: string;
  minVoteMs?: string;
  maxVoteMs?: string;
}>;

type StudyDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: StudyDetailSearchParams;
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

type StudyVoteRow = Pick<
  StudyCaptionVoteEventRow,
  "caption_id" | "profile_id" | "vote_value" | "time_to_vote_ms" | "created_datetime_utc"
>;

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: { message: string } | null;
};

type OptionalNumberParamParseResult = {
  value: number | null;
  isValid: boolean;
};

type StudyVoteTimeFilterState = {
  available_min_vote_second: number | null;
  available_max_vote_second: number | null;
  selected_min_vote_second: number | null;
  selected_max_vote_second: number | null;
  timed_vote_count: number;
  untimed_vote_count: number;
  filtered_vote_rows: StudyVoteRow[];
  vote_time_distribution_rows: {
    bucket_start_second: number;
    bucket_end_second: number;
    vote_frequency: number;
  }[];
  has_invalid_selection: boolean;
};

type StudyDetailReport = {
  study: StudySummary;
  caption_count: number;
  captions_with_votes: number;
  total_votes: number;
  distinct_voters: number;
  total_upvotes: number;
  weighted_upvote_percentage: number;
  votes_per_caption: number;
  votes_per_voter: number;
  median_time_to_vote_minutes: number | null;
  first_vote_at_utc: string | null;
  last_vote_at_utc: string | null;
  vote_distribution_rows: VoteDistributionRow[];
  caption_rows: CaptionDetailRow[];
};

const roundNumber = (value: number, digits = 4) => Number(value.toFixed(digits));

const createEmptyVoteDistributionCountMap = () =>
  new Map<StudyVoteValue, number>(STUDY_VOTE_VALUE_ORDER.map((voteValue) => [voteValue, 0]));

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const utcDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

const parseStudyIdParam = (rawValue: string) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const parseOptionalNonNegativeInteger = (
  rawValue: string | undefined,
): OptionalNumberParamParseResult => {
  if (rawValue === undefined) {
    return { value: null, isValid: true };
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return { value: null, isValid: true };
  }

  if (!/^\d+$/.test(trimmed)) {
    return { value: null, isValid: false };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return { value: null, isValid: false };
  }

  return { value: parsed, isValid: true };
};

const parseLegacyMillisecondFilter = (
  rawValue: string | undefined,
): OptionalNumberParamParseResult => {
  const result = parseOptionalNonNegativeInteger(rawValue);

  return {
    value: result.value === null ? null : Math.floor(result.value / 1000),
    isValid: result.isValid,
  };
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

const computeMedian = (values: number[]) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const pushVoteTimeDistributionRow = (
  rows: StudyVoteTimeFilterState["vote_time_distribution_rows"],
  bucketStartSecond: number,
  bucketEndSecond: number,
  voteFrequency: number,
) => {
  const previousRow = rows.at(-1);
  if (previousRow && previousRow.bucket_start_second === bucketStartSecond) {
    previousRow.vote_frequency = voteFrequency;
    return;
  }

  rows.push({
    bucket_start_second: bucketStartSecond,
    bucket_end_second: bucketEndSecond,
    vote_frequency: voteFrequency,
  });
};

const buildVoteTimeDistributionRows = (
  countsByBucketStartSecond: Map<number, number>,
  maxVoteSecond: number,
): StudyVoteTimeFilterState["vote_time_distribution_rows"] => {
  const rows: StudyVoteTimeFilterState["vote_time_distribution_rows"] = [];
  const maxBucketStartSecond =
    Math.floor(maxVoteSecond / VOTE_TIME_BUCKET_SIZE_SECONDS) * VOTE_TIME_BUCKET_SIZE_SECONDS;

  for (
    let bucketStartSecond = 0;
    bucketStartSecond <= maxBucketStartSecond;
    bucketStartSecond += VOTE_TIME_BUCKET_SIZE_SECONDS
  ) {
    pushVoteTimeDistributionRow(
      rows,
      bucketStartSecond,
      Math.min(bucketStartSecond + VOTE_TIME_BUCKET_SIZE_SECONDS - 1, maxVoteSecond),
      countsByBucketStartSecond.get(bucketStartSecond) ?? 0,
    );
  }

  return rows;
};

const getStudyVoteTimeFilterState = ({
  voteRows,
  rawMinVoteSeconds,
  rawMaxVoteSeconds,
  rawMinVoteMs,
  rawMaxVoteMs,
}: {
  voteRows: StudyVoteRow[];
  rawMinVoteSeconds: string | undefined;
  rawMaxVoteSeconds: string | undefined;
  rawMinVoteMs: string | undefined;
  rawMaxVoteMs: string | undefined;
}): StudyVoteTimeFilterState => {
  const minVoteSecondsResult =
    rawMinVoteSeconds !== undefined
      ? parseOptionalNonNegativeInteger(rawMinVoteSeconds)
      : parseLegacyMillisecondFilter(rawMinVoteMs);
  const maxVoteSecondsResult =
    rawMaxVoteSeconds !== undefined
      ? parseOptionalNonNegativeInteger(rawMaxVoteSeconds)
      : parseLegacyMillisecondFilter(rawMaxVoteMs);
  const timedVoteRows = voteRows.filter(
    (
      vote,
    ): vote is StudyVoteRow & {
      time_to_vote_ms: number;
      time_to_vote_second: number;
    } =>
      vote.time_to_vote_ms !== null && vote.time_to_vote_ms >= 0,
  ).map((vote) => ({
    ...vote,
    time_to_vote_second: Math.floor(vote.time_to_vote_ms / 1000),
  }));

  if (timedVoteRows.length === 0) {
    return {
      available_min_vote_second: null,
      available_max_vote_second: null,
      selected_min_vote_second: null,
      selected_max_vote_second: null,
      timed_vote_count: 0,
      untimed_vote_count: voteRows.length,
      filtered_vote_rows: voteRows,
      vote_time_distribution_rows: [],
      has_invalid_selection: !minVoteSecondsResult.isValid || !maxVoteSecondsResult.isValid,
    };
  }

  let maxObservedVoteSecond = timedVoteRows[0].time_to_vote_second;
  const countsByBucketStartSecond = new Map<number, number>();

  for (const vote of timedVoteRows) {
    maxObservedVoteSecond = Math.max(maxObservedVoteSecond, vote.time_to_vote_second);
    const bucketStartSecond =
      Math.floor(vote.time_to_vote_second / VOTE_TIME_BUCKET_SIZE_SECONDS) *
      VOTE_TIME_BUCKET_SIZE_SECONDS;
    countsByBucketStartSecond.set(
      bucketStartSecond,
      (countsByBucketStartSecond.get(bucketStartSecond) ?? 0) + 1,
    );
  }

  const clampedMinVoteSecond = clamp(
    minVoteSecondsResult.value ?? 0,
    0,
    maxObservedVoteSecond,
  );
  const clampedMaxVoteSecond = clamp(
    maxVoteSecondsResult.value ?? maxObservedVoteSecond,
    0,
    maxObservedVoteSecond,
  );
  const selectedMinVoteSecond = Math.min(clampedMinVoteSecond, clampedMaxVoteSecond);
  const selectedMaxVoteSecond = Math.max(clampedMinVoteSecond, clampedMaxVoteSecond);

  return {
    available_min_vote_second: 0,
    available_max_vote_second: maxObservedVoteSecond,
    selected_min_vote_second: selectedMinVoteSecond,
    selected_max_vote_second: selectedMaxVoteSecond,
    timed_vote_count: timedVoteRows.length,
    untimed_vote_count: voteRows.length - timedVoteRows.length,
    filtered_vote_rows: timedVoteRows.filter(
      (vote) =>
        vote.time_to_vote_second >= selectedMinVoteSecond &&
        vote.time_to_vote_second <= selectedMaxVoteSecond,
    ),
    vote_time_distribution_rows: buildVoteTimeDistributionRows(
      countsByBucketStartSecond,
      maxObservedVoteSecond,
    ),
    has_invalid_selection: !minVoteSecondsResult.isValid || !maxVoteSecondsResult.isValid,
  };
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

const formatStudyWindow = (study: StudySummary) => {
  const start = study.start_datetime_utc ?? study.created_datetime_utc;
  const end = study.end_datetime_utc;

  return `${formatTimestamp(start)} to ${formatTimestamp(end)}`;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "n/a";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return utcDateTimeFormatter.format(new Date(timestamp));
};

const getCaptionText = (content: string | null) => {
  const trimmed = content?.trim();
  if (!trimmed) {
    return "No caption text";
  }

  return trimmed;
};

const getStudies = async (supabase: SupabaseClient<Database>): Promise<StudySummary[]> =>
  fetchRowsWithPagination<StudySummary>({
    contextLabel: "studies",
    runQuery: async (from, to) =>
      (await supabase
        .from("studies")
        .select(
          "id, slug, description, start_datetime_utc, end_datetime_utc, created_datetime_utc",
        )
        .order("id", { ascending: false })
        .range(from, to)) as SupabaseQueryResult<StudySummary>,
  });

const getStudyCaptionMappings = async (
  supabase: SupabaseClient<Database>,
  studyIds: number[],
): Promise<StudyCaptionMappingRow[]> => {
  if (studyIds.length === 0) {
    return [];
  }

  return fetchRowsWithPagination<StudyCaptionMappingRow>({
    contextLabel: "study caption mappings",
    runQuery: async (from, to) =>
      (await supabase
        .from("study_caption_mappings")
        .select("id, study_id, caption_id")
        .in("study_id", studyIds)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyCaptionMappingRow>,
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

const getVotesByStudyCaptionMappingId = async (
  supabase: SupabaseClient<Database>,
  studyCaptionMappingIds: number[],
): Promise<StudyVoteRow[]> => {
  if (studyCaptionMappingIds.length === 0) {
    return [];
  }

  return fetchRowsWithAdaptiveChunks<StudyVoteRow>({
    ids: studyCaptionMappingIds.map(String),
    contextLabel: "study caption vote events",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("study_caption_vote_events")
        .select("caption_id, profile_id, vote_value, time_to_vote_ms, created_datetime_utc")
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
        .order("created_datetime_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyVoteRow>,
  });
};

const buildStudyDetailReport = ({
  study,
  captionIds,
  captionsById,
  imagesById,
  voteRows,
}: {
  study: StudySummary;
  captionIds: string[];
  captionsById: Map<string, CaptionSummary>;
  imagesById: Map<string, ImageSummary>;
  voteRows: StudyVoteRow[];
}): StudyDetailReport => {
  const voteDistributionCounts = new Map<StudyVoteValue, number>();
  const captionStatsById = new Map<
    string,
    {
      total_votes: number;
      upvotes: number;
      distinct_voters: Set<string>;
      vote_distribution_counts: Map<StudyVoteValue, number>;
      time_to_vote_minutes: number[];
      first_vote_at_utc: string | null;
      last_vote_at_utc: string | null;
    }
  >();

  for (const voteValue of STUDY_VOTE_VALUE_ORDER) {
    voteDistributionCounts.set(voteValue, 0);
  }

  const allDistinctVoters = new Set<string>();
  const studyVoteTimesMinutes: number[] = [];
  let totalUpvotes = 0;

  for (const vote of voteRows) {
    voteDistributionCounts.set(vote.vote_value, (voteDistributionCounts.get(vote.vote_value) ?? 0) + 1);
    allDistinctVoters.add(vote.profile_id);

    if (isPositiveStudyVote(vote.vote_value)) {
      totalUpvotes += 1;
    }

    if (vote.time_to_vote_ms !== null && vote.time_to_vote_ms >= 0) {
      studyVoteTimesMinutes.push(vote.time_to_vote_ms / MS_PER_MINUTE);
    }

    const current = captionStatsById.get(vote.caption_id) ?? {
      total_votes: 0,
      upvotes: 0,
      distinct_voters: new Set<string>(),
      vote_distribution_counts: createEmptyVoteDistributionCountMap(),
      time_to_vote_minutes: [],
      first_vote_at_utc: null,
      last_vote_at_utc: null,
    };

    current.total_votes += 1;
    current.vote_distribution_counts.set(
      vote.vote_value,
      (current.vote_distribution_counts.get(vote.vote_value) ?? 0) + 1,
    );
    if (isPositiveStudyVote(vote.vote_value)) {
      current.upvotes += 1;
    }
    current.distinct_voters.add(vote.profile_id);
    if (vote.time_to_vote_ms !== null && vote.time_to_vote_ms >= 0) {
      current.time_to_vote_minutes.push(vote.time_to_vote_ms / MS_PER_MINUTE);
    }
    current.first_vote_at_utc ??= vote.created_datetime_utc;
    current.last_vote_at_utc = vote.created_datetime_utc;

    captionStatsById.set(vote.caption_id, current);
  }

  const voteDistributionRows = STUDY_VOTE_VALUE_ORDER.map((voteValue) => {
    const count = voteDistributionCounts.get(voteValue) ?? 0;

    return {
      vote_value: voteValue,
      label: getStudyVoteValueLabel(voteValue),
      count,
      percentage: voteRows.length === 0 ? 0 : roundNumber(count / voteRows.length),
    };
  });

  const captionRows = sortCaptionRows(
    captionIds.map<CaptionDetailRow>((captionId) => {
      const caption = captionsById.get(captionId);
      const image = caption ? imagesById.get(caption.image_id) : undefined;
      const stats = captionStatsById.get(captionId);
      const totalVotes = stats?.total_votes ?? 0;
      const upvotes = stats?.upvotes ?? 0;
      const voteDistributionRows = STUDY_VOTE_VALUE_ORDER.map((voteValue) => {
        const count = stats?.vote_distribution_counts.get(voteValue) ?? 0;

        return {
          vote_value: voteValue,
          label: getStudyVoteValueLabel(voteValue),
          count,
          percentage: totalVotes === 0 ? 0 : roundNumber(count / totalVotes),
        };
      });

      return {
        caption_id: captionId,
        caption_text: getCaptionText(caption?.content ?? null),
        image_url: image?.url ?? null,
        image_description: image?.image_description ?? null,
        vote_distribution_rows: voteDistributionRows,
        total_votes: totalVotes,
        distinct_voters: stats?.distinct_voters.size ?? 0,
        upvotes,
        upvote_percentage: totalVotes === 0 ? 0 : roundNumber(upvotes / totalVotes),
        median_time_to_vote_minutes:
          stats?.time_to_vote_minutes.length
            ? roundNumber(computeMedian(stats.time_to_vote_minutes) ?? 0)
            : null,
      };
    }),
    DEFAULT_CAPTION_GALLERY_SORT,
  );

  return {
    study,
    caption_count: captionIds.length,
    captions_with_votes: captionRows.filter((row) => row.total_votes > 0).length,
    total_votes: voteRows.length,
    distinct_voters: allDistinctVoters.size,
    total_upvotes: totalUpvotes,
    weighted_upvote_percentage: voteRows.length === 0 ? 0 : roundNumber(totalUpvotes / voteRows.length),
    votes_per_caption: captionIds.length === 0 ? 0 : roundNumber(voteRows.length / captionIds.length),
    votes_per_voter:
      allDistinctVoters.size === 0 ? 0 : roundNumber(voteRows.length / allDistinctVoters.size),
    median_time_to_vote_minutes:
      studyVoteTimesMinutes.length === 0
        ? null
        : roundNumber(computeMedian(studyVoteTimesMinutes) ?? 0),
    first_vote_at_utc: voteRows[0]?.created_datetime_utc ?? null,
    last_vote_at_utc: voteRows[voteRows.length - 1]?.created_datetime_utc ?? null,
    vote_distribution_rows: voteDistributionRows,
    caption_rows: captionRows,
  };
};

export const dynamic = "force-dynamic";

export default async function StudyDetailPage({ params, searchParams }: StudyDetailPageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedStudyId = parseStudyIdParam(id);
  if (requestedStudyId === null) {
    notFound();
  }

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const selectedStudy = studies.find((study) => study.id === requestedStudyId) ?? null;
  if (selectedStudy === null) {
    notFound();
  }

  const mappings = await getStudyCaptionMappings(supabase, [requestedStudyId]);
  const captionIds = [...new Set(mappings.map((mapping) => mapping.caption_id))];
  const [captionsById, voteRows] = await Promise.all([
    getCaptionsById(supabase, captionIds),
    getVotesByStudyCaptionMappingId(
      supabase,
      [...new Set(mappings.map((mapping) => mapping.id))],
    ),
  ]);
  const imagesById = await getImagesById(
    supabase,
    [...new Set([...captionsById.values()].map((caption) => caption.image_id))],
  );
  const voteTimeFilter = getStudyVoteTimeFilterState({
    voteRows,
    rawMinVoteSeconds: query.minVoteSeconds,
    rawMaxVoteSeconds: query.maxVoteSeconds,
    rawMinVoteMs: query.minVoteMs,
    rawMaxVoteMs: query.maxVoteMs,
  });
  const report = buildStudyDetailReport({
    study: selectedStudy,
    captionIds,
    captionsById,
    imagesById,
    voteRows: voteTimeFilter.filtered_vote_rows,
  });
  const didntGetItShare =
    report.vote_distribution_rows.find((row) => row.vote_value === "didnt get it")?.percentage ?? 0;

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Study Detail</h1>
            </div>
            <StudyHeaderActions studyId={requestedStudyId} current={requestedStudyId < NEW_STYLE_MIN_STUDY_ID ? "study-overview" : undefined} />
          </div>
          <p className="app-muted text-sm">
            A study-level vote summary with overall volume, vote mix, and caption-by-caption vote
            coverage. The vote-time distribution chart recalculates every metric using only vote
            events whose time to vote falls inside the selected window.
          </p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "study-detail",
            }}
          >
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study</span>
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
          </ReportLoadForm>
          <p className="app-muted text-sm">Study window: {formatStudyWindow(selectedStudy)}</p>
          <StudyDetailVoteTimeFilter
            distributionRows={voteTimeFilter.vote_time_distribution_rows}
            availableMinVoteSecond={voteTimeFilter.available_min_vote_second}
            availableMaxVoteSecond={voteTimeFilter.available_max_vote_second}
            selectedMinVoteSecond={voteTimeFilter.selected_min_vote_second}
            selectedMaxVoteSecond={voteTimeFilter.selected_max_vote_second}
            timedVoteCount={voteTimeFilter.timed_vote_count}
            filteredVoteCount={voteTimeFilter.filtered_vote_rows.length}
            untimedVoteCount={voteTimeFilter.untimed_vote_count}
            hasInvalidSelection={voteTimeFilter.has_invalid_selection}
          />
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Total Votes
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.total_votes.toLocaleString()}</p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Distinct Voters
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {report.distinct_voters.toLocaleString()}
            </p>
          </article>
          <article className="app-card app-stat-card-rose rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Study Upvote Rate
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatPercent(report.weighted_upvote_percentage)}
            </p>
            <p className="app-muted mt-1 text-xs">
              Total upvotes: {report.total_upvotes.toLocaleString()}
            </p>
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Caption Coverage
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {report.captions_with_votes.toLocaleString()} / {report.caption_count.toLocaleString()}
            </p>
            <p className="app-muted mt-1 text-xs">
              {report.caption_count === 0
                ? "No mapped captions"
                : formatPercent(report.captions_with_votes / report.caption_count)}{" "}
              with at least one vote
            </p>
          </article>
          <article className="app-card rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Median Time to Vote
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatDurationFromMinutes(report.median_time_to_vote_minutes)}
            </p>
          </article>
          <article className="app-card rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Didn&apos;t Get It %
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(didntGetItShare)}</p>
          </article>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Vote Distribution</h2>
            <p className="app-muted text-sm">
              Distribution across the study vote scale for the vote events currently included by
              the duration filter.
            </p>
          </div>
          <div className="app-table-shell overflow-x-auto rounded-xl">
            <table className="app-table min-w-full divide-y divide-slate-200/60 text-sm dark:divide-slate-700/60">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Vote Value</th>
                  <th className="px-4 py-3 text-right font-semibold">Count</th>
                  <th className="px-4 py-3 text-right font-semibold">Share</th>
                </tr>
              </thead>
              <tbody>
                {report.vote_distribution_rows.map((row) => (
                  <tr key={row.vote_value}>
                    <td className="px-4 py-3 align-top">{row.label}</td>
                    <td className="px-4 py-3 text-right align-top">
                      {row.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right align-top">
                      {formatPercent(row.percentage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <StudyDetailCaptionGallery captionRows={report.caption_rows} />
      </section>
    </main>
  );
}
