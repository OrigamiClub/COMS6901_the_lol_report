"use client";

import { useState } from "react";

import { formatDurationFromMinutes } from "@/utils/format-duration";

export type StudyVoteTimingTableRow = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  first_vote_at_utc: string;
  last_vote_at_utc: string;
  voting_span_minutes: number;
  median_minutes_between_votes: number | null;
};

type SortDirection = "asc" | "desc";

type StudyVoteTimingSortKey =
  | "user_label"
  | "email"
  | "total_votes"
  | "first_vote_at_utc"
  | "last_vote_at_utc"
  | "voting_span_minutes"
  | "median_minutes_between_votes";

type StudyVoteTimingTableProps = {
  rows: StudyVoteTimingTableRow[];
};

const DEFAULT_SORT_KEY: StudyVoteTimingSortKey = "voting_span_minutes";
const DEFAULT_SORT_DIRECTION: SortDirection = "asc";

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

const formatVoteTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
};

const getDefaultSortDirection = (sortBy: StudyVoteTimingSortKey): SortDirection => {
  switch (sortBy) {
    case "user_label":
    case "email":
      return "asc";
    case "total_votes":
      return "desc";
    default:
      return "asc";
  }
};

const applySortDirection = (comparison: number, direction: SortDirection) =>
  direction === "asc" ? comparison : -comparison;

const compareStudyVoteTimingSummary = (
  left: StudyVoteTimingTableRow,
  right: StudyVoteTimingTableRow,
  sortBy: StudyVoteTimingSortKey,
  direction: SortDirection,
) => {
  let primary = 0;

  switch (sortBy) {
    case "user_label":
      primary = compareStrings(left.user_label, right.user_label);
      break;
    case "email":
      primary = compareNullableStrings(left.email, right.email);
      break;
    case "total_votes":
      primary = compareNumbers(left.total_votes, right.total_votes);
      break;
    case "first_vote_at_utc":
      primary = compareStrings(left.first_vote_at_utc, right.first_vote_at_utc);
      break;
    case "last_vote_at_utc":
      primary = compareStrings(left.last_vote_at_utc, right.last_vote_at_utc);
      break;
    case "voting_span_minutes":
      primary = compareNumbers(left.voting_span_minutes, right.voting_span_minutes);
      break;
    case "median_minutes_between_votes":
      primary = compareNullableNumbers(
        left.median_minutes_between_votes,
        right.median_minutes_between_votes,
      );
      break;
  }

  primary = applySortDirection(primary, direction);
  if (primary !== 0) {
    return primary;
  }

  const tieBreakers = [
    sortBy === "voting_span_minutes"
      ? 0
      : applySortDirection(
          compareNumbers(left.voting_span_minutes, right.voting_span_minutes),
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
  activeSortBy: StudyVoteTimingSortKey,
  activeSortDirection: SortDirection,
  column: StudyVoteTimingSortKey,
) => {
  if (activeSortBy !== column) {
    return "none";
  }

  return activeSortDirection === "asc" ? "ascending" : "descending";
};

const getSortIndicator = (direction: SortDirection) => (direction === "asc" ? "↑" : "↓");

export function StudyVoteTimingTable({ rows }: StudyVoteTimingTableProps) {
  const [sortBy, setSortBy] = useState<StudyVoteTimingSortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(DEFAULT_SORT_DIRECTION);

  const sortedRows = [...rows].sort((left, right) =>
    compareStudyVoteTimingSummary(left, right, sortBy, sortDirection),
  );

  const handleSort = (column: StudyVoteTimingSortKey) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortBy(column);
    setSortDirection(getDefaultSortDirection(column));
  };

  const renderSortableHeader = (label: string, column: StudyVoteTimingSortKey) => (
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
            {renderSortableHeader("User", "user_label")}
            {renderSortableHeader("Email", "email")}
            {renderSortableHeader("Total votes", "total_votes")}
            {renderSortableHeader("First vote", "first_vote_at_utc")}
            {renderSortableHeader("Last vote", "last_vote_at_utc")}
            {renderSortableHeader("Voting span", "voting_span_minutes")}
            {renderSortableHeader("Median gap", "median_minutes_between_votes")}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {sortedRows.map((row) => (
            <tr key={row.profile_id}>
              <td className="px-3 py-2 font-medium">{row.user_label}</td>
              <td className="px-3 py-2">{row.email ?? "n/a"}</td>
              <td className="px-3 py-2">{row.total_votes.toLocaleString()}</td>
              <td className="px-3 py-2">{formatVoteTimestamp(row.first_vote_at_utc)}</td>
              <td className="px-3 py-2">{formatVoteTimestamp(row.last_vote_at_utc)}</td>
              <td className="px-3 py-2">
                {formatDurationFromMinutes(row.voting_span_minutes)}
              </td>
              <td className="px-3 py-2">
                {formatDurationFromMinutes(row.median_minutes_between_votes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
