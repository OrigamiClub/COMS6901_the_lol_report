"use client";

import { useState } from "react";

import { formatDurationFromMinutes } from "@/utils/format-duration";

export type StudyUserUpvoteRateTableRow = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
  upvotes: number;
  downvotes: number;
  upvote_percentage: number;
  median_time_to_vote_minutes?: number | null;
};

type SortDirection = "asc" | "desc";

type UserUpvoteSortKey =
  | "user_label"
  | "email"
  | "upvote_percentage"
  | "upvotes"
  | "downvotes"
  | "total_votes"
  | "median_time_to_vote_minutes";

type StudyUserUpvoteRateTableProps = {
  rows: StudyUserUpvoteRateTableRow[];
  showMedianTimeToVote?: boolean;
};

const DEFAULT_SORT_KEY: UserUpvoteSortKey = "upvote_percentage";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const compareNumbers = (left: number, right: number) => left - right;

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

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

const compareNullableNumbers = (
  left: number | null | undefined,
  right: number | null | undefined,
) => {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : 1;
  }
  if (right === null || right === undefined) {
    return -1;
  }

  return compareNumbers(left, right);
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

const getDefaultSortDirection = (sortBy: UserUpvoteSortKey): SortDirection => {
  switch (sortBy) {
    case "user_label":
    case "email":
      return "asc";
    default:
      return "desc";
  }
};

const applySortDirection = (comparison: number, direction: SortDirection) =>
  direction === "asc" ? comparison : -comparison;

const compareUserUpvoteSummary = (
  left: StudyUserUpvoteRateTableRow,
  right: StudyUserUpvoteRateTableRow,
  sortBy: UserUpvoteSortKey,
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
    case "upvote_percentage":
      primary = compareNumbers(left.upvote_percentage, right.upvote_percentage);
      break;
    case "upvotes":
      primary = compareNumbers(left.upvotes, right.upvotes);
      break;
    case "downvotes":
      primary = compareNumbers(left.downvotes, right.downvotes);
      break;
    case "total_votes":
      primary = compareNumbers(left.total_votes, right.total_votes);
      break;
    case "median_time_to_vote_minutes":
      primary = compareNullableNumbers(
        left.median_time_to_vote_minutes,
        right.median_time_to_vote_minutes,
      );
      break;
  }

  primary = applySortDirection(primary, direction);
  if (primary !== 0) {
    return primary;
  }

  const tieBreakers = [
    sortBy === "upvote_percentage"
      ? 0
      : applySortDirection(
          compareNumbers(left.upvote_percentage, right.upvote_percentage),
          DEFAULT_SORT_DIRECTION,
        ),
    sortBy === "total_votes"
      ? 0
      : applySortDirection(
          compareNumbers(left.total_votes, right.total_votes),
          DEFAULT_SORT_DIRECTION,
        ),
    sortBy === "median_time_to_vote_minutes"
      ? 0
      : applySortDirection(
          compareNullableNumbers(
            left.median_time_to_vote_minutes,
            right.median_time_to_vote_minutes,
          ),
          DEFAULT_SORT_DIRECTION,
        ),
    sortBy === "upvotes"
      ? 0
      : applySortDirection(compareNumbers(left.upvotes, right.upvotes), DEFAULT_SORT_DIRECTION),
    sortBy === "downvotes"
      ? 0
      : applySortDirection(
          compareNumbers(left.downvotes, right.downvotes),
          DEFAULT_SORT_DIRECTION,
        ),
    sortBy === "user_label" ? 0 : compareStrings(left.user_label, right.user_label),
    sortBy === "email" ? 0 : compareNullableStrings(left.email, right.email),
  ];

  return tieBreakers.find((comparison) => comparison !== 0) ?? 0;
};

const getAriaSort = (
  activeSortBy: UserUpvoteSortKey,
  activeSortDirection: SortDirection,
  column: UserUpvoteSortKey,
) => {
  if (activeSortBy !== column) {
    return "none";
  }

  return activeSortDirection === "asc" ? "ascending" : "descending";
};

const getSortIndicator = (direction: SortDirection) => (direction === "asc" ? "↑" : "↓");

export function StudyUserUpvoteRateTable({
  rows,
  showMedianTimeToVote = false,
}: StudyUserUpvoteRateTableProps) {
  const [sortBy, setSortBy] = useState<UserUpvoteSortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] =
    useState<SortDirection>(DEFAULT_SORT_DIRECTION);

  const sortedRows = [...rows].sort((left, right) =>
    compareUserUpvoteSummary(left, right, sortBy, sortDirection),
  );

  const handleSort = (column: UserUpvoteSortKey) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortBy(column);
    setSortDirection(getDefaultSortDirection(column));
  };

  const renderSortableHeader = (label: string, column: UserUpvoteSortKey) => (
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
            {renderSortableHeader("Upvote %", "upvote_percentage")}
            {renderSortableHeader("Upvotes", "upvotes")}
            {renderSortableHeader("Downvotes", "downvotes")}
            {renderSortableHeader("Total votes", "total_votes")}
            {showMedianTimeToVote
              ? renderSortableHeader("Median caption time", "median_time_to_vote_minutes")
              : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {sortedRows.map((row) => (
            <tr key={row.profile_id}>
              <td className="px-3 py-2 font-medium">{row.user_label}</td>
              <td className="px-3 py-2">{row.email ?? "n/a"}</td>
              <td className="px-3 py-2">{formatPercent(row.upvote_percentage)}</td>
              <td className="px-3 py-2">{row.upvotes.toLocaleString()}</td>
              <td className="px-3 py-2">{row.downvotes.toLocaleString()}</td>
              <td className="px-3 py-2">{row.total_votes.toLocaleString()}</td>
              {showMedianTimeToVote ? (
                <td className="px-3 py-2">
                  {formatDurationFromMinutes(row.median_time_to_vote_minutes)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
