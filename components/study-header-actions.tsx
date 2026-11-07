import Link from "next/link";

type StudyHeaderActionsProps = {
  studyId: number;
  /** Hide the link to the page you are already on. */
  current?: "study-detail" | "humor-tags" | "tagging";
};

const buttonClass = "app-button inline-flex rounded-lg px-3 py-2 text-sm font-medium transition";

/**
 * Header buttons shared by per-study pages: back to the study's main detail page,
 * its humor-tag report, the tagging page scoped to the study, and Home.
 */
export function StudyHeaderActions({ studyId, current }: StudyHeaderActionsProps) {
  const links = [
    { key: "study-detail", href: `/study/${studyId}/study-detail`, label: `Study #${studyId}` },
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
