import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ReportLoadForm } from "@/components/report-load-form";
import { StudyVoteTimingTable } from "@/components/study-vote-timing-table";
import { StudyHeaderActions } from "@/components/study-header-actions";
import type { Database, Tables } from "@/src/types/supabase";
import { formatDurationFromMinutes } from "@/utils/format-duration";
import { createClient } from "@/utils/supabase/server";
import type { StudyCaptionVoteEventRow } from "@/utils/study-vote-events";

const DEFAULT_MIN_VOTES = 2;
const MAX_MIN_VOTES = 1000;
const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;
const MS_PER_MINUTE = 1000 * 60;

type StudyVoteTimingSearchParams = Promise<{
  minVotes?: string;
}>;

type StudyVoteTimingPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: StudyVoteTimingSearchParams;
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

type CaptionVoteRow = Pick<
  StudyCaptionVoteEventRow,
  "id" | "profile_id" | "created_datetime_utc"
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

type StudyStartInfo = {
  value: string;
  source: "start_datetime_utc" | "created_datetime_utc";
};

type UserVoteTimingSummary = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  first_vote_at_utc: string;
  last_vote_at_utc: string;
  voting_span_minutes: number;
  median_minutes_between_votes: number | null;
};

type StudyVoteTimingReport = {
  study: StudySummary;
  study_started_at_utc: string;
  study_start_source: StudyStartInfo["source"];
  study_duration_minutes: number | null;
  total_votes: number;
  distinct_voters: number;
  included_voters: number;
  excluded_voters: number;
  user_summaries: UserVoteTimingSummary[];
};

const roundNumber = (value: number, digits = 4) => Number(value.toFixed(digits));

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

const getEffectiveStudyStart = (study: StudySummary): StudyStartInfo => ({
  value: study.start_datetime_utc ?? study.created_datetime_utc,
  source: study.start_datetime_utc ? "start_datetime_utc" : "created_datetime_utc",
});

const toTimestampMs = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
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

const getFastestUserSummary = (summaries: UserVoteTimingSummary[]) =>
  summaries.reduce<UserVoteTimingSummary | null>((best, current) => {
    if (best === null) {
      return current;
    }
    if (current.voting_span_minutes !== best.voting_span_minutes) {
      return current.voting_span_minutes < best.voting_span_minutes ? current : best;
    }
    if (current.total_votes !== best.total_votes) {
      return current.total_votes > best.total_votes ? current : best;
    }

    return compareStrings(current.user_label, best.user_label) < 0 ? current : best;
  }, null);

const getStudies = async (
  supabase: SupabaseClient<Database>,
): Promise<StudySummary[]> => {
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
        .select("id, profile_id, created_datetime_utc")
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

const buildStudyVoteTimingReports = ({
  studies,
  votesByStudyId,
  profilesById,
  minVotes,
}: {
  studies: StudySummary[];
  votesByStudyId: Map<number, CaptionVoteRow[]>;
  profilesById: Map<string, ProfileSummary>;
  minVotes: number;
}): StudyVoteTimingReport[] =>
  studies.map((study) => {
    const studyStart = getEffectiveStudyStart(study);
    const startTimestampMs = toTimestampMs(studyStart.value);
    if (startTimestampMs === null) {
      throw new Error(`Unable to parse study start timestamp for study ${study.id}.`);
    }

    const studyEndTimestampMs =
      study.end_datetime_utc === null ? null : toTimestampMs(study.end_datetime_utc);
    const studyDurationMinutes =
      studyEndTimestampMs === null ? null : roundNumber((studyEndTimestampMs - startTimestampMs) / MS_PER_MINUTE, 2);
    const rawVotes = votesByStudyId.get(study.id) ?? [];
    const votesByProfileId = new Map<
      string,
      Array<{ created_datetime_utc: string; timestampMs: number }>
    >();

    for (const vote of rawVotes) {
      const timestampMs = toTimestampMs(vote.created_datetime_utc);
      if (timestampMs === null) {
        continue;
      }

      const bucket = votesByProfileId.get(vote.profile_id) ?? [];
      bucket.push({
        created_datetime_utc: vote.created_datetime_utc,
        timestampMs,
      });
      votesByProfileId.set(vote.profile_id, bucket);
    }

    const allUserSummaries = [...votesByProfileId.entries()].map(([profileId, votes]) => {
      const orderedVotes = [...votes].sort((left, right) => left.timestampMs - right.timestampMs);
      const firstVote = orderedVotes[0];
      const lastVote = orderedVotes[orderedVotes.length - 1];
      const votingSpanMinutes = roundNumber(
        (lastVote.timestampMs - firstVote.timestampMs) / MS_PER_MINUTE,
        2,
      );
      const medianMinutesBetweenVotes =
        orderedVotes.length < 2
          ? null
          : (() => {
              const gapMinutes = orderedVotes
                .slice(1)
                .map((vote, index) =>
                  roundNumber((vote.timestampMs - orderedVotes[index].timestampMs) / MS_PER_MINUTE, 2),
                );
              const medianGap = computeMedian(gapMinutes);

              return medianGap === null ? null : roundNumber(medianGap, 2);
            })();
      const profile = profilesById.get(profileId);

      return {
        profile_id: profileId,
        user_label: getProfileLabel(profileId, profile),
        email: profile?.email ?? null,
        total_votes: orderedVotes.length,
        first_vote_at_utc: firstVote.created_datetime_utc,
        last_vote_at_utc: lastVote.created_datetime_utc,
        voting_span_minutes: votingSpanMinutes,
        median_minutes_between_votes: medianMinutesBetweenVotes,
      };
    });

    const userSummaries = allUserSummaries.filter((summary) => summary.total_votes >= minVotes);

    return {
      study,
      study_started_at_utc: studyStart.value,
      study_start_source: studyStart.source,
      study_duration_minutes: studyDurationMinutes,
      total_votes: rawVotes.length,
      distinct_voters: allUserSummaries.length,
      included_voters: userSummaries.length,
      excluded_voters: allUserSummaries.length - userSummaries.length,
      user_summaries: userSummaries,
    };
  });

export const dynamic = "force-dynamic";

export default async function StudyVoteTimingPage({
  params: routeParams,
  searchParams,
}: StudyVoteTimingPageProps) {
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

  const supabase = await createClient();
  const studies = await getStudies(supabase);
  const selectedStudy = studies.find((study) => study.id === requestedStudyId) ?? null;
  if (selectedStudy === null) {
    notFound();
  }

  const mappings = await getStudyCaptionMappings(supabase, [requestedStudyId]);
  const voteRows = await getVotesByStudyCaptionMappingId(
    supabase,
    [...new Set(mappings.map((mapping) => mapping.id))],
  );
  const uniqueProfileIds = [...new Set(voteRows.map((vote) => vote.profile_id))];
  const profilesById = await getProfilesById(supabase, uniqueProfileIds);
  const votesByStudyId = new Map<number, CaptionVoteRow[]>();
  votesByStudyId.set(requestedStudyId, voteRows);

  const reports = buildStudyVoteTimingReports({
    studies: [selectedStudy],
    votesByStudyId,
    profilesById,
    minVotes: minVotesResult.value,
  });
  const selectedReport = reports[0] ?? null;
  const fastestUserSummary = selectedReport
    ? getFastestUserSummary(selectedReport.user_summaries)
    : null;
  const medianVotingSpanMinutes = computeMedian(
    selectedReport?.user_summaries.map((summary) => summary.voting_span_minutes) ?? [],
  );

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Study Voting Span by User</h1>
            </div>
            <StudyHeaderActions studyId={requestedStudyId} />
          </div>
          <p className="app-muted text-sm">
            Primary metric: <code>last_vote_at_utc - first_vote_at_utc</code> in minutes for each
            user within each study. Default order is fastest to slowest voting span. Click a
            column header to sort.
          </p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "vote-timing",
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
          {selectedReport ? (
            <p className="app-muted text-sm">
              Study window: {formatStudyWindow(selectedReport.study)} | Timer start:{" "}
              {selectedReport.study_started_at_utc} ({selectedReport.study_start_source})
            </p>
          ) : null}
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="app-card app-stat-card-teal rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Total Votes
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {(selectedReport?.total_votes ?? 0).toLocaleString()}
            </p>
          </article>
          <article className="app-card app-stat-card-amber rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Distinct Voters
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {(selectedReport?.distinct_voters ?? 0).toLocaleString()}
            </p>
          </article>
          <article className="app-card app-stat-card-rose rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Fastest Span
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatDurationFromMinutes(fastestUserSummary?.voting_span_minutes ?? null)}
            </p>
            {fastestUserSummary ? (
              <p className="app-muted mt-1 text-xs">
                {fastestUserSummary.user_label}
              </p>
            ) : null}
          </article>
          <article className="app-card app-stat-card-sky rounded-xl p-4">
            <p className="app-kicker text-xs font-semibold uppercase tracking-wide">
              Median Span
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatDurationFromMinutes(medianVotingSpanMinutes)}
            </p>
            <p className="app-muted mt-1 text-xs">
              Included user rows: {(selectedReport?.user_summaries.length ?? 0).toLocaleString()}
            </p>
          </article>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">User Breakdown</h2>
          {selectedReport?.user_summaries.length ? (
            <StudyVoteTimingTable rows={selectedReport.user_summaries} />
          ) : (
            <p className="app-muted text-sm">
              No users met the current vote threshold for this study.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
