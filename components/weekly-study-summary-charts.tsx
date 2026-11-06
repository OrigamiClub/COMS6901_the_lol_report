"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type WeeklyStudyChartRow = {
  study_id: number;
  study_label: string;
  weighted_score_pct: number;
  total_votes: number;
  caption_count: number;
  votes_per_caption: number;
};

type WeeklyStudySummaryChartsProps = {
  data: WeeklyStudyChartRow[];
};

const COLORS = {
  grid: "rgba(148, 163, 184, 0.28)",
  axis: "#64748b",
  weighted: "#ec4899",
  totalVotes: "#f97316",
  votesPerCaption: "#14b8a6",
  withVotes: "#f43f5e",
  scatter: "#f59e0b",
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

const formatPercent = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  return `${numeric.toFixed(2)}%`;
};

const formatNumber = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  return numeric.toLocaleString();
};

const scoreLegendName = (key: string) => {
  if (key === "weighted_score_pct") {
    return "Weighted score";
  }

  return key;
};

const engagementLegendName = (key: string) => {
  if (key === "total_votes") {
    return "Total votes";
  }
  if (key === "caption_count") {
    return "Captions";
  }
  if (key === "votes_per_caption") {
    return "Votes / caption";
  }

  return key;
};

export function WeeklyStudySummaryCharts({ data }: WeeklyStudySummaryChartsProps) {
  if (data.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Charts</h2>
        <p className="app-muted text-sm">
          No studies available for chart rendering.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Charts</h2>
        <p className="app-muted text-sm">
          Visual trends for score quality, engagement, and participation.
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <article className="app-chart-card rounded-xl p-4">
          <h3 className="text-sm font-semibold">
            Score Trend by Study
          </h3>
          <p className="app-muted mt-1 text-xs">
            Weighted score only.
          </p>
          <div className="mt-3 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="study_label" stroke={COLORS.axis} tick={{ fontSize: 12 }} />
                <YAxis
                  stroke={COLORS.axis}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatPercent(value),
                    scoreLegendName(typeof name === "string" ? name : ""),
                  ]}
                />
                <Legend
                  iconType="circle"
                  formatter={(value) => scoreLegendName(String(value))}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="weighted_score_pct"
                  stroke={COLORS.weighted}
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="app-chart-card rounded-xl p-4">
          <h3 className="text-sm font-semibold">
            Engagement Mix
          </h3>
          <p className="app-muted mt-1 text-xs">
            Total votes, caption count, and votes per caption.
          </p>
          <div className="mt-3 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                <XAxis dataKey="study_label" stroke={COLORS.axis} tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke={COLORS.axis}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => formatNumber(value)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={COLORS.axis}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => Number(value).toFixed(1)}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const dataKey = typeof name === "string" ? name : "";
                    if (dataKey === "votes_per_caption") {
                      const numeric = toNumeric(value);
                      return [
                        Number.isFinite(numeric) ? numeric.toFixed(2) : "n/a",
                        engagementLegendName(dataKey),
                      ];
                    }

                    return [formatNumber(value), engagementLegendName(dataKey)];
                  }}
                />
                <Legend
                  iconType="circle"
                  formatter={(value) => engagementLegendName(String(value))}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="total_votes"
                  fill={COLORS.totalVotes}
                  radius={[4, 4, 0, 0]}
                  barSize={24}
                />
                <Bar
                  yAxisId="left"
                  dataKey="caption_count"
                  fill={COLORS.withVotes}
                  radius={[4, 4, 0, 0]}
                  barSize={14}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="votes_per_caption"
                  stroke={COLORS.votesPerCaption}
                  strokeWidth={3}
                  dot={{ r: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="app-chart-card rounded-xl p-4">
          <h3 className="text-sm font-semibold">
            Participation vs Score
          </h3>
          <p className="app-muted mt-1 text-xs">
            Captions on x-axis, weighted score on y-axis, bubble size by total votes.
          </p>
          <div className="mt-3 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 10, right: 10, bottom: 10, left: 0 }}
                accessibilityLayer
              >
                <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="caption_count"
                  name="Captions"
                  stroke={COLORS.axis}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="weighted_score_pct"
                  name="Weighted score"
                  stroke={COLORS.axis}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}%`}
                  domain={[0, 100]}
                />
                <ZAxis type="number" dataKey="total_votes" range={[60, 420]} name="Total votes" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(value, name) => {
                    const key = String(name);
                    if (key === "weighted_score_pct") {
                      return [formatPercent(value), "Weighted score"];
                    }

                    return [formatNumber(value), key === "caption_count" ? "Captions" : "Total votes"];
                  }}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as WeeklyStudyChartRow | undefined;
                    return point ? `Study ${point.study_id} (${point.study_label})` : "";
                  }}
                />
                <Scatter name="Studies" data={data} fill={COLORS.scatter} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
