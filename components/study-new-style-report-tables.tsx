"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";

import { formatDurationFromMinutes } from "@/utils/format-duration";
import {
  DEFAULT_STUDY_NEW_STYLE_SORT_DIRECTION,
  DEFAULT_STUDY_NEW_STYLE_USER_SORT_KEY,
  getNextStudyNewStyleUserSortDirection,
  sortStudyNewStyleUserRows,
  type StudyNewStyleSortDirection,
  type StudyNewStyleUserSortKey,
} from "@/utils/study-new-style-user-sort";

export type StudyNewStyleUserTableRow = {
  profile_id: string;
  user_label: string;
  email: string | null;
  navigation_events: number;
  like_events: number;
  captions_seen: number;
  captions_liked: number;
  liked_navigation_events: number;
  skipped_navigation_events: number;
  like_rate: number | null;
  median_time_to_next_caption_minutes: number | null;
  median_time_to_vote_minutes: number | null;
  primary_input_method: string;
  last_interaction_datetime_utc: string | null;
};

export type StudyNewStyleCaptionTableRow = {
  mapping_id: number;
  caption_id: string;
  caption_text: string;
  caption_preview: string;
  image_url: string | null;
  image_description: string | null;
  like_rate: number | null;
};

type SortDirection = "asc" | "desc";
type CaptionBreakdownView = "table" | "card";

type CaptionSortKey = "caption_preview" | "like_rate";

const DEFAULT_CAPTION_SORT_KEY: CaptionSortKey = "like_rate";
const DEFAULT_SORT_DIRECTION: SortDirection = "desc";

const CAPTION_BREAKDOWN_VIEW_OPTIONS: { value: CaptionBreakdownView; label: string }[] = [
  { value: "table", label: "Table" },
  { value: "card", label: "Card" },
];

const CAPTION_SORT_OPTIONS: { value: CaptionSortKey; label: string }[] = [
  { value: "caption_preview", label: "Caption" },
  { value: "like_rate", label: "Like rate" },
];

const compareNumbers = (left: number, right: number) => left - right;

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const compareNullableNumbers = (left: number | null, right: number | null) => {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }

  return compareNumbers(left, right);
};

const applySortDirection = (comparison: number, direction: SortDirection) =>
  direction === "asc" ? comparison : -comparison;

const getSortIndicator = (direction: SortDirection) => (direction === "asc" ? "^" : "v");

const UserSortArrowIcon = ({ direction }: { direction: StudyNewStyleSortDirection }) => (
  <svg
    aria-hidden="true"
    className="size-3.5 shrink-0 stroke-current"
    fill="none"
    viewBox="0 0 16 16"
  >
    {direction === "asc" ? (
      <path
        d="M8 3.5v9M4.5 7 8 3.5 11.5 7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ) : (
      <path
        d="M8 12.5v-9M4.5 9 8 12.5 11.5 9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    )}
  </svg>
);

const getDefaultCaptionSortDirection = (sortBy: CaptionSortKey): SortDirection => {
  switch (sortBy) {
    case "caption_preview":
      return "asc";
    default:
      return "desc";
  }
};

const getNextCaptionSortDirection = (
  activeSortBy: CaptionSortKey,
  activeSortDirection: SortDirection,
  nextSortBy: CaptionSortKey,
) => {
  if (activeSortBy === nextSortBy) {
    return activeSortDirection === "asc" ? "desc" : "asc";
  }

  return getDefaultCaptionSortDirection(nextSortBy);
};

const isCaptionSortKey = (value: string): value is CaptionSortKey =>
  CAPTION_SORT_OPTIONS.some((option) => option.value === value);

const getAriaSort = <TColumn extends string>(
  activeSortBy: TColumn,
  activeSortDirection: SortDirection,
  column: TColumn,
) => {
  if (activeSortBy !== column) {
    return "none";
  }

  return activeSortDirection === "asc" ? "ascending" : "descending";
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
};

const lastInteractionFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
  timeZoneName: "short",
  year: "numeric",
});

const formatLastInteraction = (value: string | null) => {
  if (value === null) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return lastInteractionFormatter.format(date);
};

const getUserFilterSearchText = (row: StudyNewStyleUserTableRow) =>
  `${row.user_label} ${row.email ?? ""}`.toLowerCase();

const filterUserRows = (rows: StudyNewStyleUserTableRow[], rawFilter: string) => {
  const normalizedFilter = rawFilter.trim().toLowerCase();
  if (!normalizedFilter) {
    return rows;
  }

  return rows.filter((row) => getUserFilterSearchText(row).includes(normalizedFilter));
};

const compareCaptionRows = (
  left: StudyNewStyleCaptionTableRow,
  right: StudyNewStyleCaptionTableRow,
  sortBy: CaptionSortKey,
  direction: SortDirection,
) => {
  let primary = 0;

  switch (sortBy) {
    case "caption_preview":
      primary = compareStrings(left.caption_preview, right.caption_preview);
      break;
    case "like_rate":
      primary = compareNullableNumbers(left.like_rate, right.like_rate);
      break;
  }

  primary = applySortDirection(primary, direction);
  if (primary !== 0) {
    return primary;
  }

  const tieBreakers = [
    sortBy === "caption_preview"
      ? 0
      : compareStrings(left.caption_preview, right.caption_preview),
    compareNumbers(left.mapping_id, right.mapping_id),
  ];

  return tieBreakers.find((comparison) => comparison !== 0) ?? 0;
};

const sortStudyNewStyleCaptionRows = (
  rows: StudyNewStyleCaptionTableRow[],
  sortBy: CaptionSortKey,
  sortDirection: SortDirection,
) => [...rows].sort((left, right) => compareCaptionRows(left, right, sortBy, sortDirection));

type StudyNewStyleUserTableProps = {
  rows: StudyNewStyleUserTableRow[];
};

export function StudyNewStyleUserTable({ rows }: StudyNewStyleUserTableProps) {
  const [sortBy, setSortBy] = useState<StudyNewStyleUserSortKey>(
    DEFAULT_STUDY_NEW_STYLE_USER_SORT_KEY,
  );
  const [sortDirection, setSortDirection] = useState<StudyNewStyleSortDirection>(
    DEFAULT_STUDY_NEW_STYLE_SORT_DIRECTION,
  );
  const [filterText, setFilterText] = useState("");
  const deferredFilterText = useDeferredValue(filterText);
  const [isPending, startTransition] = useTransition();
  const filteredRows = useMemo(
    () => filterUserRows(rows, deferredFilterText),
    [rows, deferredFilterText],
  );
  const sortedRows = useMemo(
    () => sortStudyNewStyleUserRows(filteredRows, sortBy, sortDirection),
    [filteredRows, sortBy, sortDirection],
  );
  const isFiltering = filterText !== deferredFilterText;

  const handleSort = (column: StudyNewStyleUserSortKey) => {
    const nextSortDirection = getNextStudyNewStyleUserSortDirection({
      activeSortBy: sortBy,
      activeSortDirection: sortDirection,
      nextSortBy: column,
    });

    startTransition(() => {
      setSortBy(column);
      setSortDirection(nextSortDirection);
    });
  };

  const renderSortableHeader = (label: string, column: StudyNewStyleUserSortKey) => (
    <th
      aria-sort={getAriaSort(sortBy, sortDirection, column)}
      className="px-3 py-2 text-left font-semibold"
      scope="col"
    >
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleSort(column)}
        className="inline-flex cursor-pointer items-center gap-2 text-left hover:underline focus-visible:outline-none focus-visible:underline disabled:cursor-wait"
      >
        <span>{label}</span>
        {sortBy === column ? (
          <span className="app-muted inline-flex items-center" aria-hidden="true">
            <UserSortArrowIcon direction={sortDirection} />
          </span>
        ) : null}
      </button>
    </th>
  );

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="app-muted space-y-1 text-sm">
          <span className="block">Filter users</span>
          <input
            type="search"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Name or email"
            className="app-input h-9 w-72 rounded-md px-2 text-sm outline-none"
          />
        </label>
        {filterText ? (
          <button
            type="button"
            onClick={() => setFilterText("")}
            className="app-button cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition"
          >
            Clear
          </button>
        ) : null}
        <p className="app-muted pb-2 text-sm">
          Showing {sortedRows.length.toLocaleString()} of {rows.length.toLocaleString()} users
          {isFiltering ? "..." : ""}
        </p>
      </div>
      <div
        className="app-table-shell overflow-x-auto rounded-xl"
        aria-busy={isPending || isFiltering}
      >
        {sortedRows.length ? (
          <table className="app-table min-w-full divide-y divide-slate-200/60 text-sm dark:divide-slate-700/60">
            <thead>
              <tr>
                {renderSortableHeader("User", "user_label")}
                {renderSortableHeader("Nav events", "navigation_events")}
                {renderSortableHeader("Likes", "like_events")}
                {renderSortableHeader("Seen", "captions_seen")}
                {renderSortableHeader("Like rate", "like_rate")}
                {renderSortableHeader("Median next", "median_time_to_next_caption_minutes")}
                {renderSortableHeader("Median like", "median_time_to_vote_minutes")}
                {renderSortableHeader("Input", "primary_input_method")}
                {renderSortableHeader("Last Interaction", "last_interaction_datetime_utc")}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {sortedRows.map((row) => (
                <tr key={row.profile_id}>
                  <td className="min-w-56 px-3 py-2 align-top">
                    <div className="font-medium">{row.user_label}</div>
                    <div className="app-muted mt-1 break-all text-xs">{row.email ?? "n/a"}</div>
                  </td>
                  <td className="px-3 py-2 align-top">{row.navigation_events.toLocaleString()}</td>
                  <td className="px-3 py-2 align-top">{row.like_events.toLocaleString()}</td>
                  <td className="px-3 py-2 align-top">{row.captions_seen.toLocaleString()}</td>
                  <td className="px-3 py-2 align-top">
                    <div>{formatPercent(row.like_rate)}</div>
                    <div className="app-muted text-xs">
                      {row.captions_liked.toLocaleString()} liked /{" "}
                      {row.captions_seen.toLocaleString()} seen
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {formatDurationFromMinutes(row.median_time_to_next_caption_minutes)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {formatDurationFromMinutes(row.median_time_to_vote_minutes)}
                  </td>
                  <td className="px-3 py-2 align-top">{row.primary_input_method}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    {formatLastInteraction(row.last_interaction_datetime_utc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="app-muted p-3 text-sm">No users match the current filter.</p>
        )}
      </div>
    </>
  );
}

type CaptionTableViewProps = {
  rows: StudyNewStyleCaptionTableRow[];
  sortBy: CaptionSortKey;
  sortDirection: SortDirection;
  onSort: (column: CaptionSortKey) => void;
};

function StudyNewStyleCaptionTableView({
  rows,
  sortBy,
  sortDirection,
  onSort,
}: CaptionTableViewProps) {
  const renderSortableHeader = (label: string, column: CaptionSortKey) => (
    <th
      aria-sort={getAriaSort(sortBy, sortDirection, column)}
      className="px-3 py-2 text-left font-semibold"
      scope="col"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
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
            {renderSortableHeader("Caption", "caption_preview")}
            {renderSortableHeader("Like rate", "like_rate")}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {rows.map((row) => (
            <tr key={row.mapping_id}>
              <td className="max-w-4xl px-3 py-2 align-middle">
                <div className="flex min-w-72 items-center gap-3">
                  <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/40 dark:bg-slate-950/20">
                    {row.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image_url}
                        alt={row.image_description ?? row.caption_text}
                        loading="lazy"
                        decoding="async"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="app-muted text-[10px]">No image</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{row.caption_preview}</p>
                    <p className="app-muted truncate font-mono text-xs">{row.caption_id}</p>
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-2 align-middle">
                {formatPercent(row.like_rate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CaptionCardGridProps = {
  rows: StudyNewStyleCaptionTableRow[];
};

function CaptionCardGrid({ rows }: CaptionCardGridProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {rows.map((row) => (
        <article key={row.mapping_id} className="app-card overflow-hidden rounded-xl">
          {row.image_url ? (
            <div className="flex min-h-56 items-center justify-center bg-white/40 p-3 dark:bg-slate-950/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.image_url}
                alt={row.image_description ?? row.caption_text}
                loading="lazy"
                decoding="async"
                className="max-h-[30rem] max-w-full object-contain"
              />
            </div>
          ) : (
            <div className="grid min-h-56 place-items-center bg-white/30 p-6 text-sm dark:bg-slate-950/20">
              <span className="app-muted">Image unavailable</span>
            </div>
          )}
          <div className="p-4">
            <p className="text-base font-semibold leading-6">{row.caption_text}</p>
            <p className="app-muted mt-2 break-all font-mono text-xs">{row.caption_id}</p>
            <dl className="mt-4 text-sm">
              <div>
                <dt className="app-kicker text-xs font-semibold uppercase tracking-wide">
                  Like rate
                </dt>
                <dd className="mt-1 font-semibold text-foreground">
                  {formatPercent(row.like_rate)}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </div>
  );
}

type CaptionCardControlsProps = {
  sortBy: CaptionSortKey;
  sortDirection: SortDirection;
  onSortChange: (sortBy: CaptionSortKey) => void;
  onSortDirectionToggle: () => void;
};

function CaptionCardControls({
  sortBy,
  sortDirection,
  onSortChange,
  onSortDirectionToggle,
}: CaptionCardControlsProps) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="app-muted space-y-1 text-sm">
        <span className="block">Sort</span>
        <select
          value={sortBy}
          onChange={(event) => {
            if (isCaptionSortKey(event.target.value)) {
              onSortChange(event.target.value);
            }
          }}
          className="app-input h-9 min-w-48 rounded-md px-2 text-sm outline-none"
        >
          {CAPTION_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onSortDirectionToggle}
        className="app-button grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-sm font-medium transition"
        aria-label={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
      >
        <UserSortArrowIcon direction={sortDirection} />
      </button>
    </div>
  );
}

export function StudyNewStyleCaptionBreakdown({
  rows,
}: {
  rows: StudyNewStyleCaptionTableRow[];
}) {
  const [view, setView] = useState<CaptionBreakdownView>("table");
  const [sortBy, setSortBy] = useState<CaptionSortKey>(DEFAULT_CAPTION_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const sortedRows = useMemo(
    () => sortStudyNewStyleCaptionRows(rows, sortBy, sortDirection),
    [rows, sortBy, sortDirection],
  );

  const handleSort = (column: CaptionSortKey) => {
    const nextSortDirection = getNextCaptionSortDirection(sortBy, sortDirection, column);
    setSortBy(column);
    setSortDirection(nextSortDirection);
  };

  const handleCardSortChange = (nextSortBy: CaptionSortKey) => {
    setSortBy(nextSortBy);
    setSortDirection(getDefaultCaptionSortDirection(nextSortBy));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="app-input inline-flex h-10 items-center gap-1 rounded-lg p-1">
          {CAPTION_BREAKDOWN_VIEW_OPTIONS.map((option) => {
            const isActive = view === option.value;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setView(option.value)}
                className={`h-8 cursor-pointer rounded-md px-3 text-sm font-medium transition ${
                  isActive
                    ? "bg-white text-slate-950 shadow-sm dark:bg-cyan-300/20 dark:text-cyan-50"
                    : "app-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {view === "card" ? (
          <CaptionCardControls
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortChange={handleCardSortChange}
            onSortDirectionToggle={() =>
              setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
            }
          />
        ) : null}
      </div>
      {view === "table" ? (
        <StudyNewStyleCaptionTableView
          rows={sortedRows}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ) : (
        <CaptionCardGrid rows={sortedRows} />
      )}
    </div>
  );
}
