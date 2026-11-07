"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { cancelRunAction, startRunAction, tagNextBatchAction } from "@/app/tagging/actions";

type RunSummary = {
  id: number;
  status: string;
  model_name: string;
  prompt_version: string;
  study_id: number | null;
  created_datetime_utc: string;
  total: number;
  done: number;
  errored: number;
  unfit: number;
  captions_done: number;
};

type RunNote = {
  image_id: string;
  unfit_notes: string | null;
  error_message: string | null;
  status: string;
};

type StudyOption = {
  id: number;
  slug: string | null;
};

type TaggingRunProgressProps = {
  aiEnabled: boolean;
  canStart: boolean;
  studies: StudyOption[];
  /** Pre-selects this study in the run scope picker (from `/tagging?studyId=`). */
  initialStudyId: number | null;
  run: RunSummary | null;
  notes: RunNote[];
};

type LiveProgress = Pick<RunSummary, "done" | "errored" | "captions_done" | "total">;

export function TaggingRunProgress({
  aiEnabled,
  canStart,
  studies,
  initialStudyId,
  run,
  notes,
}: TaggingRunProgressProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLooping, setIsLooping] = useState(false);
  const [live, setLive] = useState<LiveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRequested = useRef(false);
  const [scope, setScope] = useState<string>(initialStudyId === null ? "all" : initialStudyId.toString());

  const progress: LiveProgress | null = live ?? (run ? { done: run.done, errored: run.errored, captions_done: run.captions_done, total: run.total } : null);
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isRunning = run?.status === "running";

  const loop = async (runId: number, retryErrors: boolean) => {
    stopRequested.current = false;
    setIsLooping(true);
    setError(null);
    try {
      while (!stopRequested.current) {
        const result = await tagNextBatchAction(runId, retryErrors);
        if (!result.ok) {
          setError(result.error);
          break;
        }
        setLive({
          done: result.data.done,
          errored: result.data.errored,
          captions_done: result.data.captions_done,
          total: result.data.total,
        });
        if (result.data.finished) break;
      }
    } finally {
      setIsLooping(false);
      router.refresh();
    }
  };

  const handleStart = () => {
    setError(null);
    startTransition(async () => {
      const result = await startRunAction(scope === "all" ? null : Number.parseInt(scope, 10));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLive(null);
      router.refresh();
      void loop(result.data.runId, false);
    });
  };

  const handleCancel = () => {
    if (!run) return;
    stopRequested.current = true;
    startTransition(async () => {
      const result = await cancelRunAction(run.id);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  };

  return (
    <section className="app-card space-y-4 rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tagging run</h2>
          {run ? (
            <p className="app-muted text-xs">
              Run #{run.id} · {run.study_id === null ? "all studies" : `study #${run.study_id}`} · {run.status} ·{" "}
              {run.model_name} · {run.prompt_version} · started{" "}
              {new Date(run.created_datetime_utc).toLocaleString()}
            </p>
          ) : (
            <p className="app-muted text-xs">No runs yet.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isRunning && !isLooping ? (
            <>
              <button
                type="button"
                disabled={!aiEnabled || isPending}
                onClick={() => run && void loop(run.id, false)}
                className="app-button app-button-primary rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Resume
              </button>
              {(progress?.errored ?? 0) > 0 ? (
                <button
                  type="button"
                  disabled={!aiEnabled || isPending}
                  onClick={() => run && void loop(run.id, true)}
                  className="app-button rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry failed
                </button>
              ) : null}
            </>
          ) : null}
          {isLooping ? (
            <button
              type="button"
              onClick={() => {
                stopRequested.current = true;
              }}
              className="app-button rounded-md px-3 py-1.5 text-sm"
            >
              Pause after this batch
            </button>
          ) : null}
          {isRunning ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleCancel}
              className="app-button rounded-md px-3 py-1.5 text-sm"
            >
              Cancel run
            </button>
          ) : null}
          <label className="sr-only" htmlFor="tagging-run-scope">
            Studies to tag
          </label>
          <select
            id="tagging-run-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            disabled={isPending || isLooping}
            className="app-input h-9 max-w-64 rounded-md px-2 text-sm outline-none"
          >
            <option value="all">All studies</option>
            {studies.map((study) => (
              <option key={study.id} value={study.id}>
                #{study.id} {study.slug ?? ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!aiEnabled || !canStart || isPending || isLooping}
            onClick={handleStart}
            title={canStart ? undefined : "Approve at least one tag in each taxonomy first."}
            className="app-button rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {run ? "Start new run" : "Start run"}
          </button>
        </div>
      </div>

      {run && isRunning ? (
        <p className="app-muted text-xs">
          Starting a new run snapshots the currently active tags and cancels the running one. Old runs and their tags
          are kept for comparison.
        </p>
      ) : null}

      {progress ? (
        <div className="space-y-2">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[var(--card-border)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Images tagged"
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, background: "var(--accent-strong)" }}
            />
          </div>
          <p className="text-sm">
            {progress.done} / {progress.total} images ({percent}%) · {progress.captions_done} captions tagged
            {progress.errored > 0 ? ` · ${progress.errored} failed` : ""}
            {run && run.unfit > 0 ? ` · ${run.unfit} with "no tag fit" notes` : ""}
            {isLooping ? " · working…" : ""}
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {notes.length > 0 ? (
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-medium">Recent notes and errors ({notes.length})</summary>
          <ul className="mt-2 space-y-2">
            {notes.map((note) => (
              <li key={note.image_id} className="rounded-lg border border-[var(--card-border)] p-2 text-sm">
                <code className="app-muted text-xs">{note.image_id}</code>
                {note.error_message ? (
                  <p className="text-red-600 dark:text-red-400">Error: {note.error_message}</p>
                ) : null}
                {note.unfit_notes ? <p className="app-muted">No good fit: {note.unfit_notes}</p> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
