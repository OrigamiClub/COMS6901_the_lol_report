export type StudyVoteValue =
  | "didnt get it"
  | "not funny at all"
  | "not very funny"
  | "meh"
  | "funny"
  | "very funny";

export const STUDY_VOTE_VALUE_ORDER: StudyVoteValue[] = [
  "very funny",
  "funny",
  "meh",
  "not very funny",
  "not funny at all",
  "didnt get it",
];

export type StudyCaptionVoteEventRow = {
  id: number;
  profile_id: string;
  caption_id: string;
  study_caption_mapping_id: number | null;
  vote_value: StudyVoteValue;
  time_to_vote_ms: number | null;
  created_datetime_utc: string;
};

export const isPositiveStudyVote = (voteValue: StudyVoteValue) =>
  voteValue === "funny" || voteValue === "very funny";

export const getStudyVoteSign = (voteValue: StudyVoteValue): 1 | -1 =>
  isPositiveStudyVote(voteValue) ? 1 : -1;

export const getStudyVoteValueLabel = (voteValue: StudyVoteValue): string => {
  switch (voteValue) {
    case "very funny":
      return "Very funny";
    case "funny":
      return "Funny";
    case "meh":
      return "Meh";
    case "not very funny":
      return "Not very funny";
    case "not funny at all":
      return "Not funny at all";
    case "didnt get it":
      return "Didn't get it";
  }
};
