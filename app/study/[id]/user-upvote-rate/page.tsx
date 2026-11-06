import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ReportLoadForm } from "@/components/report-load-form";
import { StudyUserUpvoteRateTable } from "@/components/study-user-upvote-rate-table";
import type { Database, Tables } from "@/src/types/supabase";
import { createClient } from "@/utils/supabase/server";
import {
  isPositiveStudyVote,
  type StudyCaptionVoteEventRow,
} from "@/utils/study-vote-events";

const QUERY_CHUNK_SIZE = 120;
const MIN_QUERY_CHUNK_SIZE = 1;
const QUERY_RETRY_ATTEMPTS = 3;
const QUERY_RETRY_BASE_DELAY_MS = 150;
const QUERY_PAGE_SIZE = 1000;

type StudyUserUpvoteRatePageProps = {
  params: Promise<{
    id: string;
  }>;
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

type CaptionVoteRow = Pick<StudyCaptionVoteEventRow, "profile_id" | "vote_value">;

type ProfileSummary = Pick<Tables<"profiles">, "id" | "email" | "first_name" | "last_name">;

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: { message: string } | null;
};

type UserUpvoteSummary = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  upvotes: number;
  downvotes: number;
  upvote_percentage: number;
};

type StudyUserUpvoteRateReport = {
  study: StudySummary;
  total_votes: number;
  total_upvotes: number;
  distinct_voters: number;
  weighted_upvote_percentage: number;
  user_summaries: UserUpvoteSummary[];
};

const roundNumber = (value: number, digits = 4) => Number(value.toFixed(digits));

const parseStudyIdParam = (rawValue: string) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
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

const getTopUserUpvoteSummary = (summaries: UserUpvoteSummary[]) =>
  summaries.reduce<UserUpvoteSummary | null>((best, current) => {
    if (best === null) {
      return current;
    }
    if (current.upvote_percentage !== best.upvote_percentage) {
      return current.upvote_percentage > best.upvote_percentage ? current : best;
    }
    if (current.total_votes !== best.total_votes) {
      return current.total_votes > best.total_votes ? current : best;
    }
    if (current.upvotes !== best.upvotes) {
      return current.upvotes > best.upvotes ? current : best;
    }

    return compareStrings(current.user_label, best.user_label) < 0 ? current : best;
  }, null);

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
        .select("profile_id, vote_value")
        .in(
          "study_caption_mapping_id",
          chunk.map((value) => Number.parseInt(value, 10)),
        )
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

const buildStudyUserUpvoteRateReport = ({
  study,
  voteRows,
  profilesById,
}: {
  study: StudySummary;
  voteRows: CaptionVoteRow[];
  profilesById: Map<string, ProfileSummary>;
}): StudyUserUpvoteRateReport => {
  const statsByProfileId = new Map<string, { total_votes: number; upvotes: number }>();
  let totalUpvotes = 0;

  for (const vote of voteRows) {
    const bucket = statsByProfileId.get(vote.profile_id) ?? { total_votes: 0, upvotes: 0 };
    bucket.total_votes += 1;
    if (isPositiveStudyVote(vote.vote_value)) {
      bucket.upvotes += 1;
      totalUpvotes += 1;
    }

    statsByProfileId.set(vote.profile_id, bucket);
  }

  const userSummaries = [...statsByProfileId.entries()].map(([profileId, stats]) => {
    const profile = profilesById.get(profileId);
    const downvotes = stats.total_votes - stats.upvotes;

    return {
      profile_id: profileId,
      user_label: getProfileLabel(profileId, profile),
      email: profile?.email ?? null,
      total_votes: stats.total_votes,
      upvotes: stats.upvotes,
      downvotes,
      upvote_percentage:
        stats.total_votes === 0 ? 0 : roundNumber(stats.upvotes / stats.total_votes),
    };
  });

  return {
    study,
    total_votes: voteRows.length,
    total_upvotes: totalUpvotes,
    distinct_voters: userSummaries.length,
    weighted_upvote_percentage:
      voteRows.length === 0 ? 0 : roundNumber(totalUpvotes / voteRows.length),
    user_summaries: userSummaries,
  };
};

export const dynamic = "force-dynamic";

export default async function StudyUserUpvoteRatePage({
  params,
}: StudyUserUpvoteRatePageProps) {
  const { id } = await params;
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
  const voteRows = await getVotesByStudyCaptionMappingId(
    supabase,
    [...new Set(mappings.map((mapping) => mapping.id))],
  );
  const uniqueProfileIds = [...new Set(voteRows.map((vote) => vote.profile_id))];
  const profilesById = await getProfilesById(supabase, uniqueProfileIds);
  const report = buildStudyUserUpvoteRateReport({
    study: selectedStudy,
    voteRows,
    profilesById,
  });
  const topUserSummary = getTopUserUpvoteSummary(report.user_summaries);

  return (
    <main className="page-shell min-h-screen p-6 text-foreground">
      <section className="app-panel mx-auto w-full max-w-7xl space-y-6 rounded-2xl p-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-kicker text-xs font-semibold uppercase tracking-[0.24em]">
                Humor Study Stats
              </p>
              <h1 className="text-2xl font-semibold">Study Upvote Percentage by User</h1>
            </div>
            <Link
              href="/"
              className="app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
            >
              Home
            </Link>
          </div>
          <p className="app-muted text-sm">
            Upvote percentage = <code>upvotes / total votes</code> for each user within the
            selected study. Default sort: upvote percentage descending. Click a column header to
            sort.
          </p>
          <ReportLoadForm
            disabled={studies.length === 0}
            className="flex flex-wrap items-end gap-3"
            pathBuilder={{
              fieldName: "studyId",
              prefix: "/study",
              suffix: "user-upvote-rate",
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
          {studies.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              No studies were found in the <code>studies</code> table.
            </p>
          ) : null}
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
              Highest User Rate
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {formatPercent(topUserSummary?.upvote_percentage ?? 0)}
            </p>
            <p className="app-muted mt-1 text-xs">
              {topUserSummary?.user_label ?? "No user votes"}
            </p>
          </article>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">User Breakdown</h2>
          {report.user_summaries.length ? (
            <StudyUserUpvoteRateTable rows={report.user_summaries} />
          ) : (
            <article className="app-card rounded-xl p-4">
              <p className="app-muted text-sm">
                No votes were found for the selected study&apos;s captions.
              </p>
            </article>
          )}
        </section>
      </section>
    </main>
  );
}
