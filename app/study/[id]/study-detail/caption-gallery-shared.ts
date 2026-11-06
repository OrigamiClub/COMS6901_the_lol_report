import type { StudyVoteValue } from "@/utils/study-vote-events";

export type VoteDistributionRow = {
  vote_value: StudyVoteValue;
  label: string;
  count: number;
  percentage: number;
};

export const CAPTION_GALLERY_SORT_OPTIONS = [
  { value: "most-votes", label: "Most votes" },
  { value: "highest-upvote-rate", label: "Highest upvote rate" },
  { value: "lowest-upvote-rate", label: "Lowest upvote rate" },
  { value: "most-very-funny", label: "Most Very Funny" },
  { value: "most-not-funny-at-all", label: "Most not funny at all" },
  { value: "most-didnt-get-it", label: "Most didn't get it" },
] as const;

export type CaptionGallerySort = (typeof CAPTION_GALLERY_SORT_OPTIONS)[number]["value"];

export const DEFAULT_CAPTION_GALLERY_SORT: CaptionGallerySort = "most-votes";

export type CaptionDetailRow = {
  caption_id: string;
  caption_text: string;
  image_url: string | null;
  image_description: string | null;
  vote_distribution_rows: VoteDistributionRow[];
  total_votes: number;
  distinct_voters: number;
  upvotes: number;
  upvote_percentage: number;
  median_time_to_vote_minutes: number | null;
};

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: "base" });

const getVoteDistributionCount = (row: CaptionDetailRow, voteValue: StudyVoteValue) =>
  row.vote_distribution_rows.find((distributionRow) => distributionRow.vote_value === voteValue)
    ?.count ?? 0;

const compareNumbersDescending = (left: number, right: number) => right - left;
const compareNumbersAscending = (left: number, right: number) => left - right;

export const isCaptionGallerySort = (value: string): value is CaptionGallerySort =>
  CAPTION_GALLERY_SORT_OPTIONS.some((option) => option.value === value);

export const sortCaptionRows = (
  rows: CaptionDetailRow[],
  selectedSort: CaptionGallerySort,
): CaptionDetailRow[] =>
  [...rows].sort((left, right) => {
    if (selectedSort === "highest-upvote-rate") {
      if (left.upvote_percentage !== right.upvote_percentage) {
        return compareNumbersDescending(left.upvote_percentage, right.upvote_percentage);
      }
      if (left.total_votes !== right.total_votes) {
        return compareNumbersDescending(left.total_votes, right.total_votes);
      }
    }

    if (selectedSort === "lowest-upvote-rate") {
      if (left.upvote_percentage !== right.upvote_percentage) {
        return compareNumbersAscending(left.upvote_percentage, right.upvote_percentage);
      }
      if (left.total_votes !== right.total_votes) {
        return compareNumbersDescending(left.total_votes, right.total_votes);
      }
    }

    if (selectedSort === "most-very-funny") {
      const leftVeryFunnyCount = getVoteDistributionCount(left, "very funny");
      const rightVeryFunnyCount = getVoteDistributionCount(right, "very funny");
      if (leftVeryFunnyCount !== rightVeryFunnyCount) {
        return compareNumbersDescending(leftVeryFunnyCount, rightVeryFunnyCount);
      }
      if (left.total_votes !== right.total_votes) {
        return compareNumbersDescending(left.total_votes, right.total_votes);
      }
    }

    if (selectedSort === "most-not-funny-at-all") {
      const leftNotFunnyAtAllCount = getVoteDistributionCount(left, "not funny at all");
      const rightNotFunnyAtAllCount = getVoteDistributionCount(right, "not funny at all");
      if (leftNotFunnyAtAllCount !== rightNotFunnyAtAllCount) {
        return compareNumbersDescending(leftNotFunnyAtAllCount, rightNotFunnyAtAllCount);
      }
      if (left.total_votes !== right.total_votes) {
        return compareNumbersDescending(left.total_votes, right.total_votes);
      }
    }

    if (selectedSort === "most-didnt-get-it") {
      const leftDidntGetItCount = getVoteDistributionCount(left, "didnt get it");
      const rightDidntGetItCount = getVoteDistributionCount(right, "didnt get it");
      if (leftDidntGetItCount !== rightDidntGetItCount) {
        return compareNumbersDescending(leftDidntGetItCount, rightDidntGetItCount);
      }
      if (left.total_votes !== right.total_votes) {
        return compareNumbersDescending(left.total_votes, right.total_votes);
      }
    }

    if (left.total_votes !== right.total_votes) {
      return compareNumbersDescending(left.total_votes, right.total_votes);
    }
    if (left.upvote_percentage !== right.upvote_percentage) {
      return compareNumbersDescending(left.upvote_percentage, right.upvote_percentage);
    }

    return compareStrings(left.caption_text, right.caption_text);
  });
