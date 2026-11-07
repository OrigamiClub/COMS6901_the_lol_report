import Link from "next/link";

type StudyHeaderActionsProps = {
  studyId: number;
  /** Hide the humor-tags link when already on that page. */
  current?: "humor-tags";
};

const buttonClass = "app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition";

/** Header buttons shared by per-study report pages: humor-tag report, tagging page scoped to this study, and Home. */
export function StudyHeaderActions({ studyId, current }: StudyHeaderActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {current !== "humor-tags" ? (
        <Link href={`/study/${studyId}/humor-tags`} className={buttonClass}>
          Humor tags
        </Link>
      ) : null}
      <Link href={`/tagging?studyId=${studyId}`} className={buttonClass}>
        Tag this study
      </Link>
      <Link href="/" className={buttonClass}>
        Home
      </Link>
    </div>
  );
}
