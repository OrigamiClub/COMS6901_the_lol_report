"use client";

import { useState } from "react";

import { formatDurationFromMinutes } from "@/utils/format-duration";

export type StudyEngagementRiskTableRow = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  risk_drivers: string;
  consensus_agreement_rate: number | null;
  comparable_consensus_votes: number;
  median_minutes_between_votes: number | null;
  characters_per_minute: number | null;
  total_caption_characters: number;
  upvote_percentage: number;
  switch_rate: number | null;
  longest_same_vote_run: number;
};

type SortDirection = "asc" | "desc";

type StudyEngagementRiskSortKey =
  | "risk_score"
  | "risk_level"
  | "risk_drivers"
  | "user_label"
  | "email"
  | "total_votes"
  | "consensus_agreement_rate"
  | "median_minutes_between_votes"
  | "characters_per_minute"
  | "upvote_percentage"
  | "switch_rate"
  | "longest_same_vote_run";

type StudyEngagementRiskTableProps = {
  rows: StudyEngagementRiskTableRow[];
};

const DEFAULT_SORT_KEY: StudyEngagementRiskSortKey = "risk_score";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const compareNumbers = (left: number, right: number) => left - right;

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const compareNullableNumbers = (left: number | null, right: number | null) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  return compareNumbers(left, right);
};

const compareNullableStrings = (left: string | null, right: string | null) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  return compareStrings(left, right);
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
};

const formatCharsPerMinute = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

const getDefaultSortDirection = (sortBy: StudyEngagementRiskSortKey): SortDirection => {
  switch (sortBy) {
    case "user_label":
    case "email":
    case "risk_drivers":
      return "asc";
    default:
      return "desc";
  }
};

const applySortDirection = (comparison: number, direction: SortDirection) =>
  direction === "asc" ? comparison : -comparison;

const getRiskLevelRank = (riskLevel: StudyEngagementRiskTableRow["risk_level"]) => {
  switch (riskLevel) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
};

const compareStudyEngagementRiskSummary = (
  left: StudyEngagementRiskTableRow,
  right: StudyEngagementRiskTableRow,
  sortBy: StudyEngagementRiskSortKey,
  direction: SortDirection,
) => {
  let primary = 0;

  switch (sortBy) {
    case "risk_score":
      primary = compareNumbers(left.risk_score, right.risk_score);
      break;
    case "risk_level":
      primary = compareNumbers(getRiskLevelRank(left.risk_level), getRiskLevelRank(right.risk_level));
      break;
    case "risk_drivers":
      primary = compareStrings(left.risk_drivers, right.risk_drivers);
      break;
    case "user_label":
      primary = compareStrings(left.user_label, right.user_label);
      break;
    case "email":
      primary = compareNullableStrings(left.email, right.email);
      break;
    case "total_votes":
      primary = compareNumbers(left.total_votes, right.total_votes);
      break;
    case "consensus_agreement_rate":
      primary = compareNullableNumbers(
        left.consensus_agreement_rate,
        right.consensus_agreement_rate,
      );
      break;
    case "median_minutes_between_votes":
      primary = compareNullableNumbers(
        left.median_minutes_between_votes,
        right.median_minutes_between_votes,
      );
      break;
    case "characters_per_minute":
      primary = compareNullableNumbers(left.characters_per_minute, right.characters_per_minute);
      break;
    case "upvote_percentage":
      primary = compareNumbers(left.upvote_percentage, right.upvote_percentage);
      break;
    case "switch_rate":
      primary = compareNullableNumbers(left.switch_rate, right.switch_rate);
      break;
    case "longest_same_vote_run":
      primary = compareNumbers(left.longest_same_vote_run, right.longest_same_vote_run);
      break;
  }

  primary = applySortDirection(primary, direction);
  if (primary !== 0) {
    return primary;
  }

  const tieBreakers = [
    sortBy === "risk_score"
      ? 0
      : applySortDirection(
          compareNumbers(left.risk_score, right.risk_score),
          DEFAULT_SORT_DIRECTION,
        ),
    sortBy === "total_votes"
      ? 0
      : applySortDirection(
          compareNumbers(left.total_votes, right.total_votes),
          getDefaultSortDirection("total_votes"),
        ),
    sortBy === "user_label" ? 0 : compareStrings(left.user_label, right.user_label),
    sortBy === "email" ? 0 : compareNullableStrings(left.email, right.email),
  ];

  return tieBreakers.find((comparison) => comparison !== 0) ?? 0;
};

const getAriaSort = (
  activeSortBy: StudyEngagementRiskSortKey,
  activeSortDirection: SortDirection,
  column: StudyEngagementRiskSortKey,
) => {
  if (activeSortBy !== column) {
    return "none";
  }

  return activeSortDirection === "asc" ? "ascending" : "descending";
};

const getSortIndicator = (direction: SortDirection) => (direction === "asc" ? "↑" : "↓");

const getRiskBadgeClassName = (riskLevel: StudyEngagementRiskTableRow["risk_level"]) => {
  switch (riskLevel) {
    case "high":
      return "bg-rose-500/18 text-rose-800 ring-1 ring-rose-500/35 dark:text-rose-100";
    case "medium":
      return "bg-amber-500/18 text-amber-900 ring-1 ring-amber-500/35 dark:text-amber-100";
    default:
      return "bg-emerald-500/18 text-emerald-900 ring-1 ring-emerald-500/35 dark:text-emerald-100";
  }
};

export function StudyEngagementRiskTable({ rows }: StudyEngagementRiskTableProps) {
  const [sortBy, setSortBy] = useState<StudyEngagementRiskSortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);

  const sortedRows = [...rows].sort((left, right) =>
    compareStudyEngagementRiskSummary(left, right, sortBy, sortDirection),
  );

  const handleSort = (column: StudyEngagementRiskSortKey) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortBy(column);
    setSortDirection(getDefaultSortDirection(column));
  };

  const renderSortableHeader = (label: string, column: StudyEngagementRiskSortKey) => (
    <th
      aria-sort={getAriaSort(sortBy, sortDirection, column)}
      className="px-3 py-2 text-left font-semibold"
      scope="col"
    >
      <button
        type="button"
        onClick={() => handleSort(column)}
        className="inline-flex cursor-pointer items-center gap-2 text-left hover:underline focus-visible:outline-none focus-visible:underline"
      >
        <span>{label}</span>
        {sortBy === column ? (
          <span className="app-muted text-xs" aria-hidden="true">
            {getSortIndicator(sortDirection)}
          </span>
        ) : null}
      </button>
    </th>
  );

  return (
    <div className="app-table-shell overflow-x-auto rounded-xl">
      <table className="app-table min-w-full divide-y divide-slate-200/60 text-sm dark:divide-slate-700/60">
        <thead>
          <tr>
            {renderSortableHeader("Risk", "risk_score")}
            {renderSortableHeader("Drivers", "risk_drivers")}
            {renderSortableHeader("User", "user_label")}
            {renderSortableHeader("Email", "email")}
            {renderSortableHeader("Votes", "total_votes")}
            {renderSortableHeader("Consensus agree", "consensus_agreement_rate")}
            {renderSortableHeader("Median gap", "median_minutes_between_votes")}
            {renderSortableHeader("Chars / min", "characters_per_minute")}
            {renderSortableHeader("Upvote %", "upvote_percentage")}
            {renderSortableHeader("Switch rate", "switch_rate")}
            {renderSortableHeader("Longest run", "longest_same_vote_run")}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {sortedRows.map((row) => (
            <tr key={row.profile_id}>
              <td className="px-3 py-2 align-top">
                <div className="space-y-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getRiskBadgeClassName(row.risk_level)}`}
                  >
                    {row.risk_level.toUpperCase()}
                  </span>
                  <p className="font-semibold">{row.risk_score.toFixed(1)}</p>
                </div>
              </td>
              <td className="px-3 py-2 align-top">{row.risk_drivers}</td>
              <td className="px-3 py-2 align-top font-medium">{row.user_label}</td>
              <td className="px-3 py-2 align-top">{row.email ?? "n/a"}</td>
              <td className="px-3 py-2 align-top">{row.total_votes.toLocaleString()}</td>
              <td className="px-3 py-2 align-top">
                <div>{formatPercent(row.consensus_agreement_rate)}</div>
                <div className="app-muted text-xs">
                  {row.comparable_consensus_votes.toLocaleString()} compared
                </div>
              </td>
              <td className="px-3 py-2 align-top">
                {formatDurationFromMinutes(row.median_minutes_between_votes)}
              </td>
              <td className="px-3 py-2 align-top">
                <div>{formatCharsPerMinute(row.characters_per_minute)}</div>
                <div className="app-muted text-xs">
                  {row.total_caption_characters.toLocaleString()} chars
                </div>
              </td>
              <td className="px-3 py-2 align-top">{formatPercent(row.upvote_percentage)}</td>
              <td className="px-3 py-2 align-top">{formatPercent(row.switch_rate)}</td>
              <td className="px-3 py-2 align-top">{row.longest_same_vote_run.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
