import Link from "next/link";

type StudyHeaderActionsProps = {
  studyId: number;
  /** Hide the link to the page you are already on. */
  current?: "study-overview" | "humor-tags" | "tagging";
};

/** Studies from this ID on use the newer swipe interface, whose main page is the new-style report. */
export const NEW_STYLE_MIN_STUDY_ID = 7;

const buttonClass = "app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition";

/**
 * Header buttons shared by per-study pages: back to the study's main page (new-style
 * report for study 7+, study detail for older studies),
 * its humor-tag report, the tagging page scoped to the study, and Home.
 */
export function StudyHeaderActions({ studyId, current }: StudyHeaderActionsProps) {
  const links = [
    {
      key: "study-overview",
      href: `/study/${studyId}/${studyId >= NEW_STYLE_MIN_STUDY_ID ? "new-style-report" : "study-detail"}`,
      label: `Study #${studyId}`,
    },
    { key: "humor-tags", href: `/study/${studyId}/humor-tags`, label: "Humor tags" },
    { key: "tagging", href: `/tagging?studyId=${studyId}`, label: "Tag this study" },
  ].filter((link) => link.key !== current);

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link key={link.key} href={link.href} className={buttonClass}>
          {link.label}
        </Link>
      ))}
      <Link href="/" className={buttonClass}>
        Home
      </Link>
    </div>
  );
}
