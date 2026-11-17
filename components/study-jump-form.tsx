"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StudyJumpFormProps = {
  studies: { id: number; slug: string | null }[];
  /** First study id that uses the newer interface (opens the new-style report). */
  newStyleMinStudyId: number;
};

/** Type a study number or part of its name, pick a match, and open that study's main report. */
export function StudyJumpForm({ studies, newStyleMinStudyId }: StudyJumpFormProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resolve = (input: string) => {
    const text = input.trim().toLowerCase().replace(/^#/, "");
    if (!text) return null;
    const byId = studies.find((study) => study.id.toString() === text.split(/\s/)[0]);
    if (byId) return byId;
    const matches = studies.filter((study) => study.slug?.toLowerCase().includes(text));
    return matches.length === 1 ? matches[0] : null;
  };

  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const study = resolve(value);
        if (!study) {
          setError("No single study matches. Type a study number or pick one from the list.");
          return;
        }
        setError(null);
        router.push(
          `/study/${study.id}/${study.id >= newStyleMinStudyId ? "new-style-report" : "study-detail"}`,
        );
      }}
    >
      <label className="sr-only" htmlFor="study-jump">
        Jump to study
      </label>
      <div className="space-y-1">
        <input
          id="study-jump"
          list="study-jump-options"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          placeholder="Jump to study: number or name"
          className="app-input h-9 w-72 rounded-md px-2 text-sm outline-none"
        />
        {error ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
      <datalist id="study-jump-options">
        {studies.map((study) => (
          <option key={study.id} value={`#${study.id} ${study.slug ?? ""}`.trim()} />
        ))}
      </datalist>
      <button type="submit" className="app-button rounded-md px-3 py-1.5 text-sm">
        Go
      </button>
    </form>
  );
}
