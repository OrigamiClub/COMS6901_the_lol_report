import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ReportLoadForm } from "@/components/report-load-form";
import {
  StudyEngagementRiskTable,
  type StudyEngagementRiskTableRow,
} from "@/components/study-engagement-risk-table";
import type { Database, Tables } from "@/src/types/supabase";
import { formatDurationFromMinutes } from "@/utils/format-duration";
import { createClient } from "@/utils/supabase/server";
import {
  getStudyVoteSign,
  type StudyCaptionVoteEventRow,
} from "@/utils/study-vote-events";

const DEFAULT_MIN_VOTES = 10;
const MAX_MIN_VOTES = 1000;
const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;
const MS_PER_MINUTE = 1000 * 60;
const MIN_ACTIVE_MINUTES = 1 / 60;
const ROBUST_Z_SCORE_SCALE = 0.67448975;
const RISK_COMPONENT_TRIGGER = 0.6;
const ABSOLUTE_HIGH_RISK_GAP_MINUTES = 1 / 60;
const ABSOLUTE_MEDIUM_RISK_GAP_MINUTES = 2 / 60;
const ABSOLUTE_ELEVATED_RISK_GAP_MINUTES = 3 / 60;
const ABSOLUTE_LOW_RISK_GAP_MINUTES = 5 / 60;
const COHORT_RUSHING_SHARE_THRESHOLD = 0.25;

type StudyEngagementRiskSearchParams = Promise<{
  minVotes?: string;
}>;

type StudyEngagementRiskPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: StudyEngagementRiskSearchParams;
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

type CaptionSummary = Pick<Tables<"captions">, "id" | "content">;

type CaptionVoteRow = Pick<
  StudyCaptionVoteEventRow,
  "id" | "caption_id" | "profile_id" | "vote_value" | "created_datetime_utc"
>;

type ProfileSummary = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "last_name">;

type NumberParamParseResult = {
  value: number;
  isValid: boolean;
};

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: { message: string } | null;
};

type EnrichedVote = {
  id: number;
  caption_id: string;
  profile_id: string;
  vote_sign: 1 | -1;
  created_datetime_utc: string;
  timestamp_ms: number;
  char_count: number;
};

type UserMetricSummary = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  upvote_percentage: number;
  voting_span_minutes: number;
  median_minutes_between_votes: number | null;
  switch_rate: number | null;
  longest_same_vote_run: number;
  comparable_consensus_votes: number;
  consensus_agreement_rate: number | null;
  total_caption_characters: number;
  characters_per_minute: number;
  polarity_gap: number;
};

type ScoredUserMetricSummary = UserMetricSummary &
  StudyEngagementRiskTableRow & {
    speed_component: number;
    agreement_component: number;
    monotony_component: number;
    polarity_component: number;
    triggered_components: number;
  };

type StudyEngagementRiskReport = {
  study: StudySummary;
  caption_count: number;
  total_votes: number;
  distinct_voters: number;
  included_voters: number;
  excluded_voters: number;
  study_upvote_percentage: number;
  study_median_gap_minutes: number | null;
  very_fast_voters: number;
  cohort_rushing_warning: boolean;
  high_risk_users: number;
  user_summaries: ScoredUserMetricSummary[];
};

const roundNumber = (value: number, digits = 4) => Number(value.toFixed(digits));

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const getAbsoluteGapRisk = (medianGapMinutes: number | null) => {
  if (medianGapMinutes === null) {
    return 0;
  }

  if (medianGapMinutes <= ABSOLUTE_HIGH_RISK_GAP_MINUTES) {
    return 1;
  }

  if (medianGapMinutes >= ABSOLUTE_LOW_RISK_GAP_MINUTES) {
    return 0;
  }

  if (medianGapMinutes <= ABSOLUTE_MEDIUM_RISK_GAP_MINUTES) {
    return 0.85;
  }

  return clamp(
    (ABSOLUTE_LOW_RISK_GAP_MINUTES - medianGapMinutes) /
      (ABSOLUTE_LOW_RISK_GAP_MINUTES - ABSOLUTE_MEDIUM_RISK_GAP_MINUTES),
  );
};

const getAbsoluteRiskFloor = (medianGapMinutes: number | null) => {
  if (medianGapMinutes === null) {
    return 0;
  }

  if (medianGapMinutes <= ABSOLUTE_HIGH_RISK_GAP_MINUTES) {
    return 80;
  }

  if (medianGapMinutes <= ABSOLUTE_MEDIUM_RISK_GAP_MINUTES) {
    return 65;
  }

  if (medianGapMinutes <= ABSOLUTE_ELEVATED_RISK_GAP_MINUTES) {
    return 50;
  }

  return 0;
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

const parseStudyIdParam = (rawValue: string) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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
  const end = study.end_datetime_utc ?? "n/a";

  return `${start} to ${end}`;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

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

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const toTimestampMs = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return timestamp;
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

const getRobustZScore = (value: number, population: number[]) => {
  if (population.length < 3) {
    return 0;
  }

  const median = computeMedian(population);
  if (median === null) {
    return 0;
  }

  const medianAbsoluteDeviation = computeMedian(
    population.map((candidate) => Math.abs(candidate - median)),
  );
  if (medianAbsoluteDeviation === null || medianAbsoluteDeviation <= Number.EPSILON) {
    return 0;
  }

  return (ROBUST_Z_SCORE_SCALE * (value - median)) / medianAbsoluteDeviation;
};

const getUpperTailRisk = (value: number, population: number[]) =>
  clamp(getRobustZScore(value, population) / 3);

const getLowerTailRisk = (value: number, population: number[]) =>
  clamp((-getRobustZScore(value, population)) / 3);

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getStudies = async (
  supabase: SupabaseClient<Database>,
): Promise<StudySummary[]> =>
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
        .select("id, content")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<CaptionSummary>,
  });

  for (const row of rows) {
    captionsById.set(row.id, row);
  }

  return captionsById;
};

const getVotesByStudyCaptionMappingId = async (
  supabase: SupabaseClient<Database>,
  studyCaptionMappingIds: number[],
): Promise<CaptionVoteRow[]> => {
  if (studyCaptionMappingIds.length === 0) {
    return [];
  }

  return fetchRowsWithAdaptiveChunks<CaptionVoteRow>({
    ids: studyCaptionMappingIds.map(String),
    contextLabel: "study caption vote events",
    runQuery: async (chunk, from, to) =>
      (await supabase
        .from("study_caption_vote_events")
        .select("id, caption_id, profile_id, vote_value, created_datetime_utc")
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
        .order("created_datetime_utc", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)) as SupabaseQueryResult<CaptionVoteRow>,
  });
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

const getRiskDrivers = ({
  speedComponent,
  agreementComponent,
  monotonyComponent,
  polarityComponent,
}: {
  speedComponent: number;
  agreementComponent: number;
  monotonyComponent: number;
  polarityComponent: number;
}) => {
  const entries = [
    { label: "speed", value: speedComponent },
    { label: "low consensus", value: agreementComponent },
    { label: "monotony", value: monotonyComponent },
    { label: "extreme polarity", value: polarityComponent },
  ]
    .filter((entry) => entry.value >= 0.25)
    .sort((left, right) => right.value - left.value);

  if (entries.length === 0) {
    return "none";
  }

  return entries.slice(0, 2).map((entry) => entry.label).join(" + ");
};

const getRiskLevel = (riskScore: number, triggeredComponents: number) => {
  if (riskScore >= 70 || (riskScore >= 55 && triggeredComponents >= 2)) {
    return "high" as const;
  }

  if (riskScore >= 40 || triggeredComponents >= 1) {
    return "medium" as const;
  }

  return "low" as const;
};

const getHighestRiskUser = (summaries: ScoredUserMetricSummary[]) =>
  summaries.reduce<ScoredUserMetricSummary | null>((best, current) => {
    if (best === null) {
      return current;
    }
    if (current.risk_score !== best.risk_score) {
      return current.risk_score > best.risk_score ? current : best;
    }
    if (current.total_votes !== best.total_votes) {
      return current.total_votes > best.total_votes ? current : best;
    }

    return compareStrings(current.user_label, best.user_label) < 0 ? current : best;
  }, null);

const buildStudyEngagementRiskReport = ({
  study,
  captionsById,
  voteRows,
  profilesById,
  minVotes,
}: {
  study: StudySummary;
  captionsById: Map<string, CaptionSummary>;
  voteRows: CaptionVoteRow[];
  profilesById: Map<string, ProfileSummary>;
  minVotes: number;
}): StudyEngagementRiskReport => {
  const captionStatsById = new Map<string, { upvotes: number; downvotes: number }>();
  const votesByProfileId = new Map<string, EnrichedVote[]>();
  let totalUpvotes = 0;
  let processedVotesCount = 0;

  for (const vote of voteRows) {
    const timestampMs = toTimestampMs(vote.created_datetime_utc);
    if (timestampMs === null) {
      continue;
    }

    processedVotesCount += 1;
    const voteSign = getStudyVoteSign(vote.vote_value);
    const caption = captionsById.get(vote.caption_id);
    const charCount = caption?.content?.trim().length ?? 0;
    const captionStats = captionStatsById.get(vote.caption_id) ?? { upvotes: 0, downvotes: 0 };
    if (voteSign > 0) {
      captionStats.upvotes += 1;
      totalUpvotes += 1;
    } else {
      captionStats.downvotes += 1;
    }
    captionStatsById.set(vote.caption_id, captionStats);

    const bucket = votesByProfileId.get(vote.profile_id) ?? [];
    bucket.push({
      id: vote.id,
      caption_id: vote.caption_id,
      profile_id: vote.profile_id,
      vote_sign: voteSign,
      created_datetime_utc: vote.created_datetime_utc,
      timestamp_ms: timestampMs,
      char_count: charCount,
    });
    votesByProfileId.set(vote.profile_id, bucket);
  }

  const studyUpvotePercentage =
    processedVotesCount === 0 ? 0 : roundNumber(totalUpvotes / processedVotesCount);

  const allUserSummaries = [...votesByProfileId.entries()].map(([profileId, votes]) => {
    const orderedVotes = [...votes].sort((left, right) => {
      if (left.timestamp_ms !== right.timestamp_ms) {
        return left.timestamp_ms - right.timestamp_ms;
      }

      return left.id - right.id;
    });
    const firstVote = orderedVotes[0];
    const lastVote = orderedVotes[orderedVotes.length - 1];
    const votingSpanMinutes = roundNumber(
      (lastVote.timestamp_ms - firstVote.timestamp_ms) / MS_PER_MINUTE,
      4,
    );
    const gapMinutes = orderedVotes
      .slice(1)
      .map((vote, index) =>
        roundNumber((vote.timestamp_ms - orderedVotes[index].timestamp_ms) / MS_PER_MINUTE, 4),
      );
    const medianGapMinutes = computeMedian(gapMinutes);

    let upvotes = 0;
    let switchCount = 0;
    let currentRun = 1;
    let longestRun = orderedVotes.length === 0 ? 0 : 1;
    let comparableConsensusVotes = 0;
    let consensusMatches = 0;
    const totalCaptionCharacters = orderedVotes.reduce((sum, vote) => sum + vote.char_count, 0);

    orderedVotes.forEach((vote, index) => {
      if (vote.vote_sign > 0) {
        upvotes += 1;
      }

      if (index > 0) {
        if (vote.vote_sign === orderedVotes[index - 1].vote_sign) {
          currentRun += 1;
        } else {
          switchCount += 1;
          currentRun = 1;
        }
        longestRun = Math.max(longestRun, currentRun);
      }

      const captionStats = captionStatsById.get(vote.caption_id);
      if (!captionStats) {
        return;
      }

      const otherUpvotes = captionStats.upvotes - (vote.vote_sign > 0 ? 1 : 0);
      const otherDownvotes = captionStats.downvotes - (vote.vote_sign < 0 ? 1 : 0);
      if (otherUpvotes === otherDownvotes) {
        return;
      }

      comparableConsensusVotes += 1;
      const majorityVote = otherUpvotes > otherDownvotes ? 1 : -1;
      if (vote.vote_sign === majorityVote) {
        consensusMatches += 1;
      }
    });

    const switchRate =
      orderedVotes.length < 2 ? null : roundNumber(switchCount / (orderedVotes.length - 1));
    const consensusAgreementRate =
      comparableConsensusVotes === 0
        ? null
        : roundNumber(consensusMatches / comparableConsensusVotes);
    const charactersPerMinute = roundNumber(
      totalCaptionCharacters / Math.max(votingSpanMinutes, MIN_ACTIVE_MINUTES),
      2,
    );
    const profile = profilesById.get(profileId);
    const totalVotes = orderedVotes.length;
    const upvotePercentage = totalVotes === 0 ? 0 : roundNumber(upvotes / totalVotes);

    return {
      profile_id: profileId,
      user_label: getProfileLabel(profileId, profile),
      email: profile?.email ?? null,
      total_votes: totalVotes,
      upvote_percentage: upvotePercentage,
      voting_span_minutes: votingSpanMinutes,
      median_minutes_between_votes:
        medianGapMinutes === null ? null : roundNumber(medianGapMinutes),
      switch_rate: switchRate,
      longest_same_vote_run: longestRun,
      comparable_consensus_votes: comparableConsensusVotes,
      consensus_agreement_rate: consensusAgreementRate,
      total_caption_characters: totalCaptionCharacters,
      characters_per_minute: charactersPerMinute,
      polarity_gap: roundNumber(Math.abs(upvotePercentage - studyUpvotePercentage)),
    };
  });

  const includedUserSummaries = allUserSummaries.filter((summary) => summary.total_votes >= minVotes);
  const medianGapPopulation = includedUserSummaries
    .flatMap((summary) =>
      summary.median_minutes_between_votes === null
        ? []
        : [Math.log1p(summary.median_minutes_between_votes)],
    );
  const charactersPerMinutePopulation = includedUserSummaries.map((summary) =>
    Math.log1p(summary.characters_per_minute),
  );
  const consensusPopulation = includedUserSummaries.flatMap((summary) =>
    summary.consensus_agreement_rate === null ? [] : [summary.consensus_agreement_rate],
  );
  const switchRatePopulation = includedUserSummaries.flatMap((summary) =>
    summary.switch_rate === null ? [] : [summary.switch_rate],
  );
  const polarityPopulation = includedUserSummaries.map((summary) => summary.polarity_gap);

  const scoredSummaries = includedUserSummaries.map<ScoredUserMetricSummary>((summary) => {
    const fastGapRisk =
      summary.median_minutes_between_votes === null
        ? 0
        : getLowerTailRisk(
            Math.log1p(summary.median_minutes_between_votes),
            medianGapPopulation,
          );
    const readingPressureRisk = getUpperTailRisk(
      Math.log1p(summary.characters_per_minute),
      charactersPerMinutePopulation,
    );
    const absoluteGapRisk = getAbsoluteGapRisk(summary.median_minutes_between_votes);
    const speedComponent = roundNumber(
      Math.max(average([fastGapRisk, readingPressureRisk]), absoluteGapRisk),
    );
    const agreementComponent =
      summary.consensus_agreement_rate === null
        ? 0
        : roundNumber(
            getLowerTailRisk(summary.consensus_agreement_rate, consensusPopulation),
          );
    const monotonyComponent =
      summary.switch_rate === null
        ? 0
        : roundNumber(getLowerTailRisk(summary.switch_rate, switchRatePopulation));
    const polarityComponent = roundNumber(
      getUpperTailRisk(summary.polarity_gap, polarityPopulation),
    );
    const relativeRiskScore = roundNumber(
      100 *
        (0.4 * speedComponent +
          0.3 * agreementComponent +
          0.15 * monotonyComponent +
          0.15 * polarityComponent),
      1,
    );
    const riskScore = roundNumber(
      Math.max(relativeRiskScore, getAbsoluteRiskFloor(summary.median_minutes_between_votes)),
      1,
    );
    const triggeredComponents = [
      speedComponent,
      agreementComponent,
      monotonyComponent,
      polarityComponent,
    ].filter((value) => value >= RISK_COMPONENT_TRIGGER).length;
    const riskLevel = getRiskLevel(riskScore, triggeredComponents);

    return {
      ...summary,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_drivers: getRiskDrivers({
        speedComponent,
        agreementComponent,
        monotonyComponent,
        polarityComponent,
      }),
      speed_component: speedComponent,
      agreement_component: agreementComponent,
      monotony_component: monotonyComponent,
      polarity_component: polarityComponent,
      triggered_components: triggeredComponents,
    };
  });

  const studyMedianGapMinutes = computeMedian(
    scoredSummaries.flatMap((summary) =>
      summary.median_minutes_between_votes === null
        ? []
        : [summary.median_minutes_between_votes],
    ),
  );
  const veryFastVoters = scoredSummaries.filter(
    (summary) =>
      summary.median_minutes_between_votes !== null &&
      summary.median_minutes_between_votes <= ABSOLUTE_MEDIUM_RISK_GAP_MINUTES,
  ).length;
  const cohortRushingWarning =
    scoredSummaries.length > 0 &&
    ((studyMedianGapMinutes !== null &&
      studyMedianGapMinutes <= ABSOLUTE_MEDIUM_RISK_GAP_MINUTES) ||
      veryFastVoters / scoredSummaries.length >= COHORT_RUSHING_SHARE_THRESHOLD);
  const highRiskUsers = scoredSummaries.filter((summary) => summary.risk_level === "high").length;

  return {
    study,
    caption_count: captionsById.size,
    total_votes: processedVotesCount,
    distinct_voters: allUserSummaries.length,
    included_voters: scoredSummaries.length,
    excluded_voters: allUserSummaries.length - scoredSummaries.length,
    study_upvote_percentage: studyUpvotePercentage,
    study_median_gap_minutes: studyMedianGapMinutes,
    very_fast_voters: veryFastVoters,
    cohort_rushing_warning: cohortRushingWarning,
    high_risk_users: highRiskUsers,
    user_summaries: scoredSummaries,
  };
};

export const dynamic = "force-dynamic";

export default async function StudyEngagementRiskPage({
  params: routeParams,
  searchParams,
}: StudyEngagementRiskPageProps) {
  const [{ id }, params] = await Promise.all([routeParams, searchParams]);
  const requestedStudyId = parseStudyIdParam(id);
  if (requestedStudyId === null) {
    notFound();
  }

  const minVotesResult = parseBoundedInteger(
    params.minVotes,
    DEFAULT_MIN_VOTES,
    1,
    MAX_MIN_VOTES,
  );
  const generatedAtUtc = new Date().toISOString();

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const selectedStudy = studies.find((study) => study.id === requestedStudyId) ?? null;
  if (selectedStudy === null) {
    notFound();
  }

  const mappings = await getStudyCaptionMappings(supabase, [requestedStudyId]);
  const uniqueCaptionIds = [...new Set(mappings.map((mapping) => mapping.caption_id))];
  const [captionsById, voteRows] = await Promise.all([
    getCaptionsById(supabase, uniqueCaptionIds),
    getVotesByStudyCaptionMappingId(
      supabase,
      [...new Set(mappings.map((mapping) => mapping.id))],
    ),
  ]);
  const uniqueProfileIds = [...new Set(voteRows.map((vote) => vote.profile_id))];
  const profilesById = await getProfilesById(supabase, uniqueProfileIds);
  const report = buildStudyEngagementRiskReport({
    study: selectedStudy,
    captionsById,
    voteRows,
    profilesById,
    minVotes: minVotesResult.value,
  });
  const highestRiskUser = getHighestRiskUser(report.user_summaries);

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Study Engagement Risk</h1>
            </div>
            <Link
              href="/"
              className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
            >
              Home
            </Link>
          </div>
          <p className="app-muted text-sm">
            Composite risk score = 40% speed/read-load, 30% low leave-one-out consensus agreement,
            15% low vote switching, and 15% extreme upvote/downvote bias. Use this to screen for
            rushed participation, not to make automatic disciplinary decisions.
          </p>
          <p className="app-muted text-sm">
            Extremely low vote timing also triggers an absolute speed penalty, so a uniformly
            rushed class still scores as high risk.
          </p>
          <p className="app-muted text-sm">Generated at: {generatedAtUtc}</p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "engagement-risk",
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
            <label className="app-muted space-y-1 text-sm">
              <span className="block">Min votes per user</span>
              <input
                type="number"
                name="minVotes"
                min={1}
                max={MAX_MIN_VOTES}
                defaultValue={minVotesResult.value}
                className="app-input h-9 w-44 rounded-md px-2 text-sm outline-none"
              />
            </label>
          </ReportLoadForm>
          {!minVotesResult.isValid && params.minVotes ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Invalid <code>minVotes</code> value. Using default of {DEFAULT_MIN_VOTES}.
            </p>
          ) : null}
          {report.cohort_rushing_warning ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Cohort-wide rushing is likely in this study. The score is applying absolute speed
              penalties because many voters are moving too quickly.
            </p>
          ) : null}
          <p className="app-muted text-sm">Study window: {formatStudyWindow(selectedStudy)}</p>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Study Captions
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.caption_count.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.total_votes.toLocaleString()} votes scanned
            </p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Included Voters
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.included_voters.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.excluded_voters.toLocaleString()} below min votes
            </p>
          </article>
          <article className="app-card app-stat-card-rose rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              High Risk Users
            </p>
            <p className="mt-2 text-2xl font-semibold">{report.high_risk_users.toLocaleString()}</p>
            <p className="app-muted mt-1 text-xs">
              {report.very_fast_voters.toLocaleString()} users at 2s median gap or faster
            </p>
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Study Upvote %
            </p>
            <p className="mt-2 text-2xl font-semibold">{formatPercent(report.study_upvote_percentage)}</p>
            <p className="app-muted mt-1 text-xs">
              Study median gap{" "}
              {formatDurationFromMinutes(report.study_median_gap_minutes)}
            </p>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
            <article className="app-card rounded-xl p-4">
              <h2 className="text-lg font-semibold">Interpretation</h2>
              <div className="app-muted mt-3 space-y-2 text-sm">
                <p>
                  <span className="font-semibold text-foreground">Speed/read-load</span>: flags
                  people who move through high-character captions implausibly quickly or leave very
                  small median gaps between votes. Absolute speed floors also keep a whole rushed
                  class from looking artificially normal.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Consensus agreement</span>: each
                  vote is compared against the leave-one-out majority on the same caption, so a
                  student is not graded against their own vote.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Monotony</span>: low switching
                  rates and long same-vote runs catch users who plow through with one repeated
                  response pattern.
                </p>
                <p>
                  <span className="font-semibold text-foreground">Polarity</span>: extreme
                  upvote/downvote behavior relative to the study baseline is only a minor signal by
                  itself, but it helps when paired with speed or low consensus.
                </p>
              </div>
            </article>
            <article className="app-card rounded-xl p-4">
              <h2 className="text-lg font-semibold">Highest Risk User</h2>
              {highestRiskUser ? (
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-xl font-semibold">{highestRiskUser.user_label}</p>
                  <p className="app-muted">{highestRiskUser.email ?? "n/a"}</p>
                  <p>
                    Risk score <span className="font-semibold">{highestRiskUser.risk_score.toFixed(1)}</span>{" "}
                    ({highestRiskUser.risk_level})
                  </p>
                  <p className="app-muted">Drivers: {highestRiskUser.risk_drivers}</p>
                  <p className="app-muted">
                    Median gap {formatDurationFromMinutes(highestRiskUser.median_minutes_between_votes)} |{" "}
                    Consensus agree{" "}
                    {highestRiskUser.consensus_agreement_rate === null
                      ? "n/a"
                      : formatPercent(highestRiskUser.consensus_agreement_rate)}
                  </p>
                </div>
              ) : (
                <p className="app-muted mt-3 text-sm">
                  No user met the current vote threshold for scoring.
                </p>
              )}
            </article>
          </section>

        {report.user_summaries.length ? (
          <StudyEngagementRiskTable rows={report.user_summaries} />
        ) : (
          <article className="app-card rounded-xl p-4">
            <p className="app-muted text-sm">
              No users met the current <code>minVotes</code> threshold for risk scoring.
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
