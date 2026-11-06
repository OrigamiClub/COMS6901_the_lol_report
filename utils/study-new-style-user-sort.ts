export type StudyNewStyleSortDirection = "asc" | "desc";

export type StudyNewStyleUserSortKey =
  | "user_label"
  | "navigation_events"
  | "like_events"
  | "captions_seen"
  | "like_rate"
  | "median_time_to_next_caption_minutes"
  | "median_time_to_vote_minutes"
  | "primary_input_method"
  | "last_interaction_datetime_utc";

type StudyNewStyleSortableUserRow = {
  user_label: string;
  navigation_events: number;
  like_events: number;
  captions_seen: number;
  like_rate: number | null;
  median_time_to_next_caption_minutes: number | null;
  median_time_to_vote_minutes: number | null;
  primary_input_method: string;
  last_interaction_datetime_utc: string | null;
};

export const DEFAULT_STUDY_NEW_STYLE_USER_SORT_KEY: StudyNewStyleUserSortKey = "like_rate";
export const DEFAULT_STUDY_NEW_STYLE_SORT_DIRECTION: StudyNewStyleSortDirection = "desc";

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

const getDateTimeMs = (value: string | null) => {
  if (value === null) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
};

const compareNullableDateTimes = (left: string | null, right: string | null) =>
  compareNullableNumbers(getDateTimeMs(left), getDateTimeMs(right));

const applySortDirection = (comparison: number, direction: StudyNewStyleSortDirection) =>
  direction === "asc" ? comparison : -comparison;

export const getDefaultStudyNewStyleUserSortDirection = (
  sortBy: StudyNewStyleUserSortKey,
): StudyNewStyleSortDirection => {
  switch (sortBy) {
    case "user_label":
    case "primary_input_method":
      return "asc";
    default:
      return "desc";
  }
};

export const getNextStudyNewStyleUserSortDirection = ({
  activeSortBy,
  activeSortDirection,
  nextSortBy,
}: {
  activeSortBy: StudyNewStyleUserSortKey;
  activeSortDirection: StudyNewStyleSortDirection;
  nextSortBy: StudyNewStyleUserSortKey;
}): StudyNewStyleSortDirection => {
  if (activeSortBy === nextSortBy) {
    return activeSortDirection === "asc" ? "desc" : "asc";
  }

  return getDefaultStudyNewStyleUserSortDirection(nextSortBy);
};

const compareStudyNewStyleUserRows = <TRow extends StudyNewStyleSortableUserRow>(
  left: TRow,
  right: TRow,
  sortBy: StudyNewStyleUserSortKey,
  direction: StudyNewStyleSortDirection,
) => {
  let primary = 0;

  switch (sortBy) {
    case "user_label":
      primary = compareStrings(left.user_label, right.user_label);
      break;
    case "navigation_events":
      primary = compareNumbers(left.navigation_events, right.navigation_events);
      break;
    case "like_events":
      primary = compareNumbers(left.like_events, right.like_events);
      break;
    case "captions_seen":
      primary = compareNumbers(left.captions_seen, right.captions_seen);
      break;
    case "like_rate":
      primary = compareNullableNumbers(left.like_rate, right.like_rate);
      break;
    case "median_time_to_next_caption_minutes":
      primary = compareNullableNumbers(
        left.median_time_to_next_caption_minutes,
        right.median_time_to_next_caption_minutes,
      );
      break;
    case "median_time_to_vote_minutes":
      primary = compareNullableNumbers(
        left.median_time_to_vote_minutes,
        right.median_time_to_vote_minutes,
      );
      break;
    case "primary_input_method":
      primary = compareStrings(left.primary_input_method, right.primary_input_method);
      break;
    case "last_interaction_datetime_utc":
      primary = compareNullableDateTimes(
        left.last_interaction_datetime_utc,
        right.last_interaction_datetime_utc,
      );
      break;
  }

  primary = applySortDirection(primary, direction);
  if (primary !== 0) {
    return primary;
  }

  const tieBreakers = [
    sortBy === "navigation_events"
      ? 0
      : applySortDirection(
          compareNumbers(left.navigation_events, right.navigation_events),
          DEFAULT_STUDY_NEW_STYLE_SORT_DIRECTION,
        ),
    sortBy === "like_events"
      ? 0
      : applySortDirection(
          compareNumbers(left.like_events, right.like_events),
          DEFAULT_STUDY_NEW_STYLE_SORT_DIRECTION,
        ),
    sortBy === "user_label" ? 0 : compareStrings(left.user_label, right.user_label),
  ];

  return tieBreakers.find((comparison) => comparison !== 0) ?? 0;
};

export const sortStudyNewStyleUserRows = <TRow extends StudyNewStyleSortableUserRow>(
  rows: TRow[],
  sortBy: StudyNewStyleUserSortKey,
  direction: StudyNewStyleSortDirection,
) => [...rows].sort((left, right) => compareStudyNewStyleUserRows(left, right, sortBy, direction));
