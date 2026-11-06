"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, useId, useRef, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LoadingOverlay } from "@/components/loading-overlay";
import { formatDurationFromMinutes } from "@/utils/format-duration";

const MIN_VOTE_SECONDS_PARAM = "minVoteSeconds";
const MAX_VOTE_SECONDS_PARAM = "maxVoteSeconds";
const LEGACY_MIN_VOTE_MS_PARAM = "minVoteMs";
const LEGACY_MAX_VOTE_MS_PARAM = "maxVoteMs";

const CHART_COLORS = {
  axis: "#64748b",
  grid: "rgba(148, 163, 184, 0.22)",
  selectedBar: "#f97316",
  selectedBarStroke: "#ea580c",
  unselectedBar: "rgba(14, 165, 233, 0.45)",
  unselectedBarStroke: "#0ea5e9",
};

export type VoteTimeDistributionRow = {
  bucket_start_second: number;
  bucket_end_second: number;
  vote_frequency: number;
};

type StudyDetailVoteTimeFilterProps = {
  distributionRows: VoteTimeDistributionRow[];
  availableMinVoteSecond: number | null;
  availableMaxVoteSecond: number | null;
  selectedMinVoteSecond: number | null;
  selectedMaxVoteSecond: number | null;
  timedVoteCount: number;
  filteredVoteCount: number;
  untimedVoteCount: number;
  hasInvalidSelection: boolean;
};

type StudyDetailVoteTimeFilterControlsProps = {
  distributionRows: VoteTimeDistributionRow[];
  availableMinVoteSecond: number;
  availableMaxVoteSecond: number;
  selectedMinVoteSecond: number;
  selectedMaxVoteSecond: number;
  timedVoteCount: number;
  filteredVoteCount: number;
  untimedVoteCount: number;
  hasInvalidSelection: boolean;
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

const formatCount = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  return Math.round(numeric).toLocaleString();
};

const formatVoteDurationFromSeconds = (valueSeconds: number) =>
  formatDurationFromMinutes(Math.max(0, valueSeconds) / 60);

const getChartDomainFromSelection = ({
  availableMaxVoteSecond,
  selectedMinVoteSecond,
  selectedMaxVoteSecond,
}: {
  availableMaxVoteSecond: number;
  selectedMinVoteSecond: number;
  selectedMaxVoteSecond: number;
}) => {
  if (selectedMinVoteSecond === 0 && selectedMaxVoteSecond === availableMaxVoteSecond) {
    return {
      min: 0,
      max: Math.max(availableMaxVoteSecond, 1),
    };
  }

  const min = Math.max(0, Math.floor(selectedMinVoteSecond * 0.5));
  const max = Math.min(
    availableMaxVoteSecond,
    Math.max(Math.ceil(selectedMaxVoteSecond * 1.5), min + 1),
  );

  return { min, max };
};

const formatCompactVoteDuration = (value: unknown) => {
  const numeric = toNumeric(value);
  if (!Number.isFinite(numeric)) {
    return "n/a";
  }

  const seconds = Math.max(0, Math.round(numeric));
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const totalMinutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (totalMinutes < 60) {
    return remainingSeconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
};

const VoteTimeDistributionTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    payload?: VoteTimeDistributionRow;
  }>;
}) => {
  if (!active || !payload?.[0]?.payload) {
    return null;
  }

  const bucketStartSecond = payload[0].payload.bucket_start_second;
  const bucketEndSecond = payload[0].payload.bucket_end_second;
  const voteFrequency = Math.round(toNumeric(payload[0].value ?? 0));

  return (
    <div className="app-tooltip rounded-xl p-3 text-xs">
      <p className="font-semibold">
        Bucket: {formatVoteDurationFromSeconds(bucketStartSecond)} to{" "}
        {formatVoteDurationFromSeconds(bucketEndSecond)}
      </p>
      <p className="mt-2">
        Frequency: {Number.isFinite(voteFrequency) ? voteFrequency.toLocaleString() : "n/a"} vote
        event{voteFrequency === 1 ? "" : "s"}
      </p>
      <p className="app-muted mt-2">
        5-second bucket starting at {bucketStartSecond.toLocaleString()}s
      </p>
    </div>
  );
};

function StudyDetailVoteTimeFilterControls({
  distributionRows,
  availableMinVoteSecond,
  availableMaxVoteSecond,
  selectedMinVoteSecond,
  selectedMaxVoteSecond,
  timedVoteCount,
  filteredVoteCount,
  untimedVoteCount,
  hasInvalidSelection,
}: StudyDetailVoteTimeFilterControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startNavigationTransition] = useTransition();
  const componentId = useId().replace(/:/g, "-");
  const minInputId = `${componentId}-vote-time-min`;
  const maxInputId = `${componentId}-vote-time-max`;
  const [draftMinVoteSecond, setDraftMinVoteSecond] = useState(selectedMinVoteSecond);
  const [draftMaxVoteSecond, setDraftMaxVoteSecond] = useState(selectedMaxVoteSecond);
  const draftMinVoteSecondRef = useRef(draftMinVoteSecond);
  const draftMaxVoteSecondRef = useRef(draftMaxVoteSecond);

  const hasAdjustableRange = availableMinVoteSecond !== availableMaxVoteSecond;
  const isAtFullRange =
    draftMinVoteSecond === availableMinVoteSecond &&
    draftMaxVoteSecond === availableMaxVoteSecond;
  const chartDomain = getChartDomainFromSelection({
    availableMaxVoteSecond,
    selectedMinVoteSecond,
    selectedMaxVoteSecond,
  });
  const sliderSpan = Math.max(chartDomain.max - chartDomain.min, 1);
  const minThumbPercent = ((draftMinVoteSecond - chartDomain.min) / sliderSpan) * 100;
  const maxThumbPercent = ((draftMaxVoteSecond - chartDomain.min) / sliderSpan) * 100;
  const visibleDistributionRows = distributionRows
    .filter(
      (row) =>
        row.bucket_end_second >= chartDomain.min && row.bucket_start_second <= chartDomain.max,
    )
    .map((row) => ({
      ...row,
      bucket_label: formatCompactVoteDuration(row.bucket_start_second),
    }));

  const commitDraftRange = (nextMinVoteSecond: number, nextMaxVoteSecond: number) => {
    if (
      nextMinVoteSecond === selectedMinVoteSecond &&
      nextMaxVoteSecond === selectedMaxVoteSecond
    ) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete(LEGACY_MIN_VOTE_MS_PARAM);
    nextParams.delete(LEGACY_MAX_VOTE_MS_PARAM);

    if (nextMinVoteSecond <= availableMinVoteSecond) {
      nextParams.delete(MIN_VOTE_SECONDS_PARAM);
    } else {
      nextParams.set(MIN_VOTE_SECONDS_PARAM, String(nextMinVoteSecond));
    }

    if (nextMaxVoteSecond >= availableMaxVoteSecond) {
      nextParams.delete(MAX_VOTE_SECONDS_PARAM);
    } else {
      nextParams.set(MAX_VOTE_SECONDS_PARAM, String(nextMaxVoteSecond));
    }

    const query = nextParams.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;

    if (href === currentHref) {
      return;
    }

    startNavigationTransition(() => {
      router.replace(href, { scroll: false });
    });
  };

  const handleCommit = () => {
    if (isPending) {
      return;
    }

    commitDraftRange(draftMinVoteSecondRef.current, draftMaxVoteSecondRef.current);
  };

  const handleMinChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const nextMinVoteSecond = Math.min(nextValue, draftMaxVoteSecondRef.current);
    draftMinVoteSecondRef.current = nextMinVoteSecond;
    setDraftMinVoteSecond(nextMinVoteSecond);
  };

  const handleMaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const nextMaxVoteSecond = Math.max(nextValue, draftMinVoteSecondRef.current);
    draftMaxVoteSecondRef.current = nextMaxVoteSecond;
    setDraftMaxVoteSecond(nextMaxVoteSecond);
  };

  const handleReset = () => {
    draftMinVoteSecondRef.current = availableMinVoteSecond;
    draftMaxVoteSecondRef.current = availableMaxVoteSecond;
    setDraftMinVoteSecond(availableMinVoteSecond);
    setDraftMaxVoteSecond(availableMaxVoteSecond);
    commitDraftRange(availableMinVoteSecond, availableMaxVoteSecond);
  };

  return (
    <>
      <section className="app-chart-card rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="app-kicker text-xs font-semibold uppercase tracking-[0.22em]">
              Vote Duration Filter
            </p>
            <h2 className="text-lg font-semibold">Vote-time histogram</h2>
            <p className="app-muted max-w-3xl text-sm">
              Bars show frequency in 5-second buckets. Drag either handle below the chart to
              shorten or extend the included window. The visible histogram still zooms to 50%
              below the selected minimum and 50% above the selected maximum.
            </p>
          </div>
          {!isAtFullRange ? (
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="app-button rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset range
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-full border border-white/45 bg-white/45 px-3 py-1.5 text-sm font-semibold dark:border-cyan-200/10 dark:bg-slate-950/20">
            {formatVoteDurationFromSeconds(draftMinVoteSecond)} to{" "}
            {formatVoteDurationFromSeconds(draftMaxVoteSecond)}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="app-muted">
              {filteredVoteCount.toLocaleString()} of {timedVoteCount.toLocaleString()} timed vote
              events included
            </span>
            {isPending ? <span className="app-muted">Updating...</span> : null}
          </div>
        </div>

        <div className="mt-4 h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={visibleDistributionRows}
              margin={{ top: 12, right: 16, bottom: 12, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="bucket_label"
                stroke={CHART_COLORS.axis}
                tick={{ fontSize: 12 }}
                minTickGap={24}
                interval="preserveStartEnd"
              />
              <YAxis
                stroke={CHART_COLORS.axis}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatCount(value)}
                allowDecimals={false}
                width={72}
              />
              <Tooltip
                cursor={{ stroke: "rgba(148, 163, 184, 0.5)", strokeDasharray: "4 4" }}
                content={<VoteTimeDistributionTooltip />}
              />
              <Bar
                dataKey="vote_frequency"
                name="Vote frequency"
                barSize={14}
                isAnimationActive={false}
              >
                {visibleDistributionRows.map((row) => {
                  const intersectsSelection =
                    row.bucket_end_second >= draftMinVoteSecond &&
                    row.bucket_start_second <= draftMaxVoteSecond;

                  return (
                    <Cell
                      key={`${row.bucket_start_second}-${row.bucket_end_second}`}
                      fill={
                        intersectsSelection
                          ? CHART_COLORS.selectedBar
                          : CHART_COLORS.unselectedBar
                      }
                      stroke={
                        intersectsSelection
                          ? CHART_COLORS.selectedBarStroke
                          : CHART_COLORS.unselectedBarStroke
                      }
                      strokeWidth={1}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4">
          <label htmlFor={minInputId} className="sr-only">
            Minimum vote duration in seconds
          </label>
          <label htmlFor={maxInputId} className="sr-only">
            Maximum vote duration in seconds
          </label>

          <div className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200/80 dark:bg-slate-950/60" />
            <div
              className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#f97316_0%,#ec4899_48%,#0ea5e9_100%)]"
              style={{
                left: `${minThumbPercent}%`,
                width: `${Math.max(maxThumbPercent - minThumbPercent, 0)}%`,
              }}
            />
            <input
              id={minInputId}
              type="range"
              min={chartDomain.min}
              max={chartDomain.max}
              step={1}
              value={draftMinVoteSecond}
              onChange={handleMinChange}
              onMouseUp={handleCommit}
              onTouchEnd={handleCommit}
              onKeyUp={handleCommit}
              onBlur={handleCommit}
              disabled={!hasAdjustableRange || isPending}
              className="app-range-slider absolute inset-x-0 top-1/2 z-20 h-10 w-full -translate-y-1/2 disabled:cursor-not-allowed"
            />
            <input
              id={maxInputId}
              type="range"
              min={chartDomain.min}
              max={chartDomain.max}
              step={1}
              value={draftMaxVoteSecond}
              onChange={handleMaxChange}
              onMouseUp={handleCommit}
              onTouchEnd={handleCommit}
              onKeyUp={handleCommit}
              onBlur={handleCommit}
              disabled={!hasAdjustableRange || isPending}
              className="app-range-slider absolute inset-x-0 top-1/2 z-30 h-10 w-full -translate-y-1/2 disabled:cursor-not-allowed"
            />
          </div>

          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span className="app-muted">{formatCompactVoteDuration(chartDomain.min)}</span>
            <span className="app-muted text-right">{formatCompactVoteDuration(chartDomain.max)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-1 text-sm">
          <p className="app-muted">
            The histogram aggregates vote times into 5-second buckets while the underlying filter
            still applies to vote times inclusively across the selected range.
            {untimedVoteCount > 0
              ? ` Untimed vote events excluded from the chart and filtered calculations: ${untimedVoteCount.toLocaleString()}.`
              : null}
          </p>
          {hasInvalidSelection ? (
            <p className="app-muted">
              Invalid vote-time filter value detected in the URL. Using the closest available
              range instead.
            </p>
          ) : null}
        </div>
      </section>
      {isPending ? <LoadingOverlay label="Refreshing study detail..." /> : null}
    </>
  );
}

export function StudyDetailVoteTimeFilter({
  distributionRows,
  availableMinVoteSecond,
  availableMaxVoteSecond,
  selectedMinVoteSecond,
  selectedMaxVoteSecond,
  timedVoteCount,
  filteredVoteCount,
  untimedVoteCount,
  hasInvalidSelection,
}: StudyDetailVoteTimeFilterProps) {
  if (availableMinVoteSecond === null || availableMaxVoteSecond === null) {
    return (
      <section className="app-chart-card rounded-xl p-4">
        <div className="space-y-2">
          <div>
            <p className="app-kicker text-xs font-semibold uppercase tracking-[0.22em]">
              Vote Duration Filter
            </p>
            <h2 className="mt-1 text-lg font-semibold">Vote-time histogram</h2>
          </div>
          <p className="app-muted text-sm">
            No vote events in this study have a recorded time to vote, so the chart filter is
            unavailable and the report remains unfiltered.
          </p>
          {untimedVoteCount > 0 ? (
            <p className="app-muted text-sm">
              Untimed vote events: {untimedVoteCount.toLocaleString()}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <StudyDetailVoteTimeFilterControls
      key={`${availableMinVoteSecond}:${availableMaxVoteSecond}:${selectedMinVoteSecond}:${selectedMaxVoteSecond}`}
      distributionRows={distributionRows}
      availableMinVoteSecond={availableMinVoteSecond}
      availableMaxVoteSecond={availableMaxVoteSecond}
      selectedMinVoteSecond={selectedMinVoteSecond ?? availableMinVoteSecond}
      selectedMaxVoteSecond={selectedMaxVoteSecond ?? availableMaxVoteSecond}
      timedVoteCount={timedVoteCount}
      filteredVoteCount={filteredVoteCount}
      untimedVoteCount={untimedVoteCount}
      hasInvalidSelection={hasInvalidSelection}
    />
  );
}
