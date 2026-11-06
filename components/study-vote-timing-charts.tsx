"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDurationFromMinutes } from "@/utils/format-duration";

export type StudyVoteTimingChartRow = {
  point_rank: number;
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  first_vote_at_utc: string;
  last_vote_at_utc: string;
  minutes_to_first_vote: number;
  minutes_to_last_vote: number;
  voting_span_minutes: number;
  average_minutes_between_votes: number | null;
  color: string;
};

export type StudyVoteTimingChart = {
  study_id: number;
  study_label: string;
  study_window_label: string;
  study_started_at_utc: string;
  study_start_source: string;
  study_duration_minutes: number | null;
  total_votes: number;
  distinct_voters: number;
  included_voters: number;
  excluded_voters: number;
  max_voting_span_minutes: number;
  rows: StudyVoteTimingChartRow[];
};

type StudyVoteTimingChartsProps = {
  charts: StudyVoteTimingChart[];
};

const COLORS = {
  grid: "rgba(148, 163, 184, 0.28)",
  axis: "#64748b",
  reference: "#22d3ee",
  line: "#ec4899",
};

const toNumeric = (value: unknown) => {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number.parseFloat(value);
  }

  return Number.NaN;
};

const formatDuration = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  return formatDurationFromMinutes(numeric);
};

const formatVotes = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  return Math.round(numeric).toLocaleString();
};

const VoteTimingTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: StudyVoteTimingChartRow }>;
}) => {
  if (!active || !payload?.[0]?.payload) {
    return null;
  }

  const row = payload[0].payload;

  return (
    <div className="app-tooltip rounded-xl p-3 text-xs">
      <p className="font-semibold">{row.user_label}</p>
      {row.email ? <p className="app-muted">{row.email}</p> : null}
      <p className="mt-2">
        Voting span: {formatDuration(row.voting_span_minutes)}
      </p>
      <p>Votes: {formatVotes(row.total_votes)}</p>
      <p>
        Avg gap: {formatDuration(row.average_minutes_between_votes)}
      </p>
      <p className="app-muted mt-2">First: {row.first_vote_at_utc}</p>
      <p className="app-muted">Last: {row.last_vote_at_utc}</p>
    </div>
  );
};

const VotingSpanDot = ({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: StudyVoteTimingChartRow;
}) => {
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  return <circle cx={cx} cy={cy} r={4} fill={payload.color} stroke="#ffffff" strokeWidth={1.5} />;
};

const ActiveVotingSpanDot = ({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: StudyVoteTimingChartRow;
}) => {
  if (cx === undefined || cy === undefined || !payload) {
    return null;
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={7}
      fill={payload.color}
      stroke="#ffffff"
      strokeWidth={2}
    />
  );
};

export function StudyVoteTimingCharts({ charts }: StudyVoteTimingChartsProps) {
  if (charts.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Charts</h2>
        <p className="app-muted text-sm">
          No studies are available for vote timing charts.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Voting Span by User</h2>
        <p className="app-muted text-sm">
          Each dot shows elapsed voting span in minutes, ordered from fastest to slowest.
        </p>
      </header>

      <div className="grid gap-4">
        {charts.map((chart) => (
          <article
            key={chart.study_id}
            className="app-chart-card space-y-3 rounded-xl p-4"
          >
            <header className="space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{chart.study_label}</h3>
                  <p className="app-muted text-xs">
                    Window: {chart.study_window_label}
                  </p>
                </div>
                <p className="app-muted text-xs">
                  Start clock: {chart.study_started_at_utc} ({chart.study_start_source})
                </p>
              </div>
              <p className="app-muted text-xs">
                Votes: {chart.total_votes.toLocaleString()} | Distinct voters:{" "}
                {chart.distinct_voters.toLocaleString()} | Included in chart:{" "}
                {chart.included_voters.toLocaleString()}
                {chart.excluded_voters > 0
                  ? ` | Filtered out: ${chart.excluded_voters.toLocaleString()}`
                  : ""}
              </p>
            </header>

            {chart.rows.length === 0 ? (
              <p className="app-muted text-sm">
                No users met the current vote threshold for this study.
              </p>
            ) : (
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chart.rows}
                    margin={{ top: 12, right: 18, bottom: 12, left: 0 }}
                    accessibilityLayer
                  >
                    <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="point_rank"
                      stroke={COLORS.axis}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `#${Math.round(Number(value))}`}
                      domain={[1, Math.max(chart.rows.length, 1)]}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="number"
                      stroke={COLORS.axis}
                      width={180}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => formatDuration(value)}
                      domain={[
                        0,
                        Math.max(chart.max_voting_span_minutes, chart.study_duration_minutes ?? 0, 1),
                      ]}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(148, 163, 184, 0.6)", strokeDasharray: "4 4" }}
                      content={<VoteTimingTooltip />}
                    />
                    {chart.study_duration_minutes !== null ? (
                      <ReferenceLine
                        y={chart.study_duration_minutes}
                        stroke={COLORS.reference}
                        strokeDasharray="4 4"
                        label={{
                          value: "Study duration",
                          position: "insideTopRight",
                          fill: COLORS.reference,
                          fontSize: 11,
                        }}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="voting_span_minutes"
                      name="Voting span"
                      stroke={COLORS.line}
                      strokeWidth={3}
                      dot={<VotingSpanDot />}
                      activeDot={<ActiveVotingSpanDot />}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {chart.rows.length > 0 ? (
              <p className="app-muted text-xs">
                Fastest span: {chart.rows[0].user_label} ({formatDuration(chart.rows[0].voting_span_minutes)})
                {" | "}
                Slowest span: {chart.rows[chart.rows.length - 1].user_label} (
                {formatDuration(chart.rows[chart.rows.length - 1].voting_span_minutes)}) | Hover any
                dot for user details.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
