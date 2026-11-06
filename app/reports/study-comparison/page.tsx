import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/src/types/supabase";
import {
  type StudyCaptionVoteEventRow,
  isPositiveStudyVote,
} from "@/utils/study-vote-events";
import { createClient } from "@/utils/supabase/server";

const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;

type StudyComparisonSearchParams = Promise<{
  studyA?: string;
  studyB?: string;
}>;

type StudyComparisonPageProps = {
  searchParams: StudyComparisonSearchParams;
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

type StudyCaptionMappingRow = Pick<Tables<"study_caption_mappings">, "id" | "study_id" | "caption_id">;

type StudyVoteRow = Pick<StudyCaptionVoteEventRow, "study_caption_mapping_id" | "vote_value">;

type NumberParamParseResult = {
  value: number;
  isValid: boolean;
};

type VoteSummary = {
  totalVotes: number;
  upvotes: number;
};

type StudyMetric = {
  study: StudySummary;
  caption_count: number;
  captions_with_votes: number;
  total_votes: number;
  upvotes: number;
  weighted_score: number;
  average_caption_score: number;
  median_caption_score: number;
  votes_per_caption: number;
  overlap_caption_count: number;
  overlap_ratio: number;
  unique_caption_count: number;
};

type ComparisonDelta = {
  caption_count_delta: number;
  captions_with_votes_delta: number;
  total_votes_delta: number;
  upvotes_delta: number;
  weighted_score_delta: number;
  average_caption_score_delta: number;
  median_caption_score_delta: number;
  votes_per_caption_delta: number;
  overlap_ratio_delta: number;
  shared_caption_count: number;
  unique_to_study_a: number;
  unique_to_study_b: number;
};

type MetricComparisonRow = {
  metric: string;
  valueA: string;
  valueB: string;
  delta: string;
};

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: { message: string } | null;
};

const roundScore = (value: number) => Number(value.toFixed(4));

const parseStudyIdParam = (rawValue: string | undefined): NumberParamParseResult | null => {
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { value: 0, isValid: false };
  }

  return { value: parsed, isValid: true };
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

const formatPercent = (score: number) => `${(score * 100).toFixed(2)}%`;

const formatDeltaPercent = (score: number) =>
  `${score >= 0 ? "+" : ""}${(score * 100).toFixed(2)}%`;

const formatDeltaPoints = (score: number) =>
  `${score >= 0 ? "+" : ""}${(score * 100).toFixed(2)} pts`;

const formatSignedInteger = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

const formatSignedDecimal = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

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
  const start = study.start_datetime_utc ?? "n/a";
  const end = study.end_datetime_utc ?? "n/a";

  return `${start} to ${end}`;
};

const computeMedian = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midIndex];
  }

  return (sorted[midIndex - 1] + sorted[midIndex]) / 2;
};

const buildMetricComparisonRows = (
  studyA: StudyMetric,
  studyB: StudyMetric,
  delta: ComparisonDelta,
): MetricComparisonRow[] => [
  {
    metric: "Caption count",
    valueA: studyA.caption_count.toString(),
    valueB: studyB.caption_count.toString(),
    delta: formatSignedInteger(delta.caption_count_delta),
  },
  {
    metric: "Captions with votes",
    valueA: studyA.captions_with_votes.toString(),
    valueB: studyB.captions_with_votes.toString(),
    delta: formatSignedInteger(delta.captions_with_votes_delta),
  },
  {
    metric: "Total votes",
    valueA: studyA.total_votes.toString(),
    valueB: studyB.total_votes.toString(),
    delta: formatSignedInteger(delta.total_votes_delta),
  },
  {
    metric: "Upvotes",
    valueA: studyA.upvotes.toString(),
    valueB: studyB.upvotes.toString(),
    delta: formatSignedInteger(delta.upvotes_delta),
  },
  {
    metric: "Weighted score",
    valueA: formatPercent(studyA.weighted_score),
    valueB: formatPercent(studyB.weighted_score),
    delta: `${formatDeltaPoints(delta.weighted_score_delta)} (${formatDeltaPercent(delta.weighted_score_delta)})`,
  },
  {
    metric: "Avg caption score",
    valueA: formatPercent(studyA.average_caption_score),
    valueB: formatPercent(studyB.average_caption_score),
    delta: `${formatDeltaPoints(delta.average_caption_score_delta)} (${formatDeltaPercent(delta.average_caption_score_delta)})`,
  },
  {
    metric: "Median caption score",
    valueA: formatPercent(studyA.median_caption_score),
    valueB: formatPercent(studyB.median_caption_score),
    delta: `${formatDeltaPoints(delta.median_caption_score_delta)} (${formatDeltaPercent(delta.median_caption_score_delta)})`,
  },
  {
    metric: "Votes per caption",
    valueA: studyA.votes_per_caption.toFixed(2),
    valueB: studyB.votes_per_caption.toFixed(2),
    delta: formatSignedDecimal(delta.votes_per_caption_delta),
  },
  {
    metric: "Overlap ratio",
    valueA: formatPercent(studyA.overlap_ratio),
    valueB: formatPercent(studyB.overlap_ratio),
    delta: `${formatDeltaPoints(delta.overlap_ratio_delta)} (${formatDeltaPercent(delta.overlap_ratio_delta)})`,
  },
];

const getStudies = async (supabase: SupabaseClient<Database>): Promise<StudySummary[]> => {
  return fetchRowsWithPagination<StudySummary>({
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
};

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

const getVoteSummaryByMappingId = async (
  supabase: SupabaseClient<Database>,
  mappingIds: number[],
): Promise<Map<number, VoteSummary>> => {
  const voteSummaryByMappingId = new Map<number, VoteSummary>();
  if (mappingIds.length === 0) {
    return voteSummaryByMappingId;
  }

  const voteRows = await fetchRowsWithAdaptiveChunks<StudyVoteRow>({
    ids: mappingIds.map(String),
    contextLabel: "study caption vote events",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("study_caption_vote_events")
        .select("study_caption_mapping_id, vote_value")
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<StudyVoteRow>,
  });

  for (const vote of voteRows) {
    if (vote.study_caption_mapping_id === null) {
      continue;
    }

    const current = voteSummaryByMappingId.get(vote.study_caption_mapping_id) ?? {
      totalVotes: 0,
      upvotes: 0,
    };

    current.totalVotes += 1;
    if (isPositiveStudyVote(vote.vote_value)) {
      current.upvotes += 1;
    }

    voteSummaryByMappingId.set(vote.study_caption_mapping_id, current);
  }

  return voteSummaryByMappingId;
};

const buildStudyMetric = ({
  study,
  mappings,
  sharedCaptionIds,
  voteSummaryByMappingId,
}: {
  study: StudySummary;
  mappings: StudyCaptionMappingRow[];
  sharedCaptionIds: Set<string>;
  voteSummaryByMappingId: Map<number, VoteSummary>;
}): StudyMetric => {
  const uniqueCaptionIds = new Set(mappings.map((mapping) => mapping.caption_id));
  const voteSummaryByCaptionId = new Map<string, VoteSummary>();

  for (const mapping of mappings) {
    const voteSummary = voteSummaryByMappingId.get(mapping.id);
    if (!voteSummary || voteSummary.totalVotes === 0) {
      continue;
    }

    const current = voteSummaryByCaptionId.get(mapping.caption_id) ?? {
      totalVotes: 0,
      upvotes: 0,
    };
    current.totalVotes += voteSummary.totalVotes;
    current.upvotes += voteSummary.upvotes;
    voteSummaryByCaptionId.set(mapping.caption_id, current);
  }

  const captionCount = uniqueCaptionIds.size;
  const captionsWithVotes = voteSummaryByCaptionId.size;
  const captionVoteSummaries = [...voteSummaryByCaptionId.values()];
  const totalVotes = captionVoteSummaries.reduce((sum, summary) => sum + summary.totalVotes, 0);
  const upvotes = captionVoteSummaries.reduce((sum, summary) => sum + summary.upvotes, 0);
  const captionScores = captionVoteSummaries.map((summary) => summary.upvotes / summary.totalVotes);

  const weightedScore = totalVotes === 0 ? 0 : upvotes / totalVotes;
  const averageCaptionScore =
    captionScores.length === 0
      ? 0
      : captionScores.reduce((sum, score) => sum + score, 0) / captionScores.length;
  const medianCaptionScore = computeMedian(captionScores);
  const votesPerCaption = captionCount === 0 ? 0 : totalVotes / captionCount;
  const overlapCaptionCount = [...uniqueCaptionIds].reduce(
    (count, captionId) => count + (sharedCaptionIds.has(captionId) ? 1 : 0),
    0,
  );
  const overlapRatio = captionCount === 0 ? 0 : overlapCaptionCount / captionCount;
  const uniqueCaptionCount = captionCount - overlapCaptionCount;

  return {
    study,
    caption_count: captionCount,
    captions_with_votes: captionsWithVotes,
    total_votes: totalVotes,
    upvotes,
    weighted_score: roundScore(weightedScore),
    average_caption_score: roundScore(averageCaptionScore),
    median_caption_score: roundScore(medianCaptionScore),
    votes_per_caption: roundScore(votesPerCaption),
    overlap_caption_count: overlapCaptionCount,
    overlap_ratio: roundScore(overlapRatio),
    unique_caption_count: uniqueCaptionCount,
  };
};

const buildComparisonDelta = (
  studyA: StudyMetric,
  studyB: StudyMetric,
  sharedCaptionCount: number,
): ComparisonDelta => ({
  caption_count_delta: studyA.caption_count - studyB.caption_count,
  captions_with_votes_delta: studyA.captions_with_votes - studyB.captions_with_votes,
  total_votes_delta: studyA.total_votes - studyB.total_votes,
  upvotes_delta: studyA.upvotes - studyB.upvotes,
  weighted_score_delta: roundScore(studyA.weighted_score - studyB.weighted_score),
  average_caption_score_delta: roundScore(
    studyA.average_caption_score - studyB.average_caption_score,
  ),
  median_caption_score_delta: roundScore(studyA.median_caption_score - studyB.median_caption_score),
  votes_per_caption_delta: roundScore(studyA.votes_per_caption - studyB.votes_per_caption),
  overlap_ratio_delta: roundScore(studyA.overlap_ratio - studyB.overlap_ratio),
  shared_caption_count: sharedCaptionCount,
  unique_to_study_a: studyA.unique_caption_count,
  unique_to_study_b: studyB.unique_caption_count,
});

export const dynamic = "force-dynamic";

export default async function StudyComparisonPage({
  searchParams,
}: StudyComparisonPageProps) {
  const params = await searchParams;
  const rawStudyAResult = parseStudyIdParam(params.studyA);
  const rawStudyBResult = parseStudyIdParam(params.studyB);
  const generatedAtUtc = new Date().toISOString();

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const studyById = new Map(studies.map((study) => [study.id, study]));
  const defaultStudyAId = studies[0]?.id ?? null;
  const defaultStudyBId = studies.find((study) => study.id !== defaultStudyAId)?.id ?? null;

  const hasExplicitStudyA = Boolean(params.studyA);
  const hasExplicitStudyB = Boolean(params.studyB);
  const explicitStudyAWasInvalid = hasExplicitStudyA && rawStudyAResult?.isValid === false;
  const explicitStudyBWasInvalid = hasExplicitStudyB && rawStudyBResult?.isValid === false;
  const requestedStudyAId = rawStudyAResult?.isValid ? rawStudyAResult.value : null;
  const requestedStudyBId = rawStudyBResult?.isValid ? rawStudyBResult.value : null;
  const explicitStudyAMissing =
    requestedStudyAId !== null && !studyById.has(requestedStudyAId);
  const explicitStudyBMissing =
    requestedStudyBId !== null && !studyById.has(requestedStudyBId);

  const selectedStudyAId =
    requestedStudyAId !== null && studyById.has(requestedStudyAId)
      ? requestedStudyAId
      : defaultStudyAId;
  let selectedStudyBId =
    requestedStudyBId !== null && studyById.has(requestedStudyBId)
      ? requestedStudyBId
      : defaultStudyBId;
  let duplicateStudySelectionAdjusted = false;

  if (
    selectedStudyAId !== null &&
    selectedStudyBId !== null &&
    selectedStudyAId === selectedStudyBId
  ) {
    const fallbackStudyBId =
      studies.find((study) => study.id !== selectedStudyAId)?.id ?? null;

    if (fallbackStudyBId !== null) {
      selectedStudyBId = fallbackStudyBId;
      duplicateStudySelectionAdjusted = true;
    }
  }

  const selectedStudyA = selectedStudyAId !== null ? (studyById.get(selectedStudyAId) ?? null) : null;
  const selectedStudyB = selectedStudyBId !== null ? (studyById.get(selectedStudyBId) ?? null) : null;
  const hasComparableStudyPair = Boolean(
    selectedStudyA && selectedStudyB && selectedStudyA.id !== selectedStudyB.id,
  );

  let studyMetricA: StudyMetric | null = null;
  let studyMetricB: StudyMetric | null = null;
  let comparisonDelta: ComparisonDelta | null = null;

  if (selectedStudyA && selectedStudyB && selectedStudyA.id !== selectedStudyB.id) {
    const studyIds = [selectedStudyA.id, selectedStudyB.id];
    const mappings = await getStudyCaptionMappings(supabase, studyIds);
    const mappingsByStudyId = new Map<number, StudyCaptionMappingRow[]>();
    for (const studyId of studyIds) {
      mappingsByStudyId.set(studyId, []);
    }

    for (const mapping of mappings) {
      const bucket = mappingsByStudyId.get(mapping.study_id);
      if (!bucket) {
        continue;
      }

      bucket.push(mapping);
    }

    const mappingsForStudyA = mappingsByStudyId.get(selectedStudyA.id) ?? [];
    const mappingsForStudyB = mappingsByStudyId.get(selectedStudyB.id) ?? [];
    const captionIdsForStudyA = new Set(mappingsForStudyA.map((mapping) => mapping.caption_id));
    const captionIdsForStudyB = new Set(mappingsForStudyB.map((mapping) => mapping.caption_id));
    const sharedCaptionIds = new Set(
      [...captionIdsForStudyA].filter((captionId) => captionIdsForStudyB.has(captionId)),
    );
    const allMappingIds = [...new Set(mappings.map((mapping) => mapping.id))];
    const voteSummaryByMappingId = await getVoteSummaryByMappingId(supabase, allMappingIds);

    studyMetricA = buildStudyMetric({
      study: selectedStudyA,
      mappings: mappingsForStudyA,
      sharedCaptionIds,
      voteSummaryByMappingId,
    });
    studyMetricB = buildStudyMetric({
      study: selectedStudyB,
      mappings: mappingsForStudyB,
      sharedCaptionIds,
      voteSummaryByMappingId,
    });
    comparisonDelta = buildComparisonDelta(studyMetricA, studyMetricB, sharedCaptionIds.size);
  }

  const metricComparisonRows =
    studyMetricA && studyMetricB && comparisonDelta
      ? buildMetricComparisonRows(studyMetricA, studyMetricB, comparisonDelta)
      : [];

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
            Humor Study Stats
          </p>
          <h1 className="text-2xl font-semibold">Study-to-Study Comparison</h1>
          <p className="app-muted text-sm">
            Compare two studies using caption coverage and vote-derived humor metrics.
          </p>
          <p className="app-muted text-sm">
            Weighted score formula: total upvotes / total votes.
          </p>
          <p className="app-muted text-sm">
            Generated at: {generatedAtUtc}
          </p>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study A</span>
              <select
                name="studyA"
                defaultValue={selectedStudyA?.id.toString() ?? ""}
                disabled={studies.length === 0}
                className="app-input h-9 min-w-72 rounded-md px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {studies.map((study) => (
                  <option key={`study-a-${study.id}`} value={study.id}>
                    {getStudyLabel(study)}
                  </option>
                ))}
              </select>
            </label>
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Study B</span>
              <select
                name="studyB"
                defaultValue={selectedStudyB?.id.toString() ?? ""}
                disabled={studies.length === 0}
                className="app-input h-9 min-w-72 rounded-md px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {studies.map((study) => (
                  <option key={`study-b-${study.id}`} value={study.id}>
                    {getStudyLabel(study)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={studies.length < 2}
              className="app-button h-9 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Refresh
            </button>
          </form>
          {explicitStudyAWasInvalid ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid `studyA` value. Using the newest study instead.
            </p>
          ) : null}
          {explicitStudyBWasInvalid ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid `studyB` value. Using the second newest study instead.
            </p>
          ) : null}
          {explicitStudyAMissing ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Study A ({requestedStudyAId}) was not found in `studies`.
            </p>
          ) : null}
          {explicitStudyBMissing ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Study B ({requestedStudyBId}) was not found in `studies`.
            </p>
          ) : null}
          {duplicateStudySelectionAdjusted ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Study A and Study B matched. Study B was automatically adjusted to a different
              study.
            </p>
          ) : null}
          {studies.length < 2 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              At least two studies are required for comparison.
            </p>
          ) : null}
          {!hasComparableStudyPair && studies.length >= 2 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Select two distinct studies to run the comparison.
            </p>
          ) : null}
          <Link
            href="/"
            className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
          >
            Back to dashboard
          </Link>
        </header>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Report 1: Side-by-Side Metrics</h2>
          {studyMetricA && studyMetricB && comparisonDelta ? (
            <div className="app-table-shell overflow-x-auto rounded-xl">
              <table className="app-table min-w-full divide-y divide-slate-200/60 text-sm dark:divide-slate-700/60">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Metric</th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Study A: {getStudyLabel(studyMetricA.study)}
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      Study B: {getStudyLabel(studyMetricB.study)}
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">Delta (A - B)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  <tr>
                    <td className="px-3 py-2">Study window</td>
                    <td className="px-3 py-2 text-xs">{formatStudyWindow(studyMetricA.study)}</td>
                    <td className="px-3 py-2 text-xs">{formatStudyWindow(studyMetricB.study)}</td>
                    <td className="app-muted px-3 py-2">n/a</td>
                  </tr>
                  {metricComparisonRows.map((row) => (
                    <tr key={row.metric}>
                      <td className="px-3 py-2">{row.metric}</td>
                      <td className="px-3 py-2">{row.valueA}</td>
                      <td className="px-3 py-2">{row.valueB}</td>
                      <td className="px-3 py-2">{row.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="app-muted text-sm">
              No comparison data available.
            </p>
          )}
        </section>

      </section>
    </main>
  );
}
