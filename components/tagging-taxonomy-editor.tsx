"use client";

import { useState, useTransition } from "react";

import {
  approveProposedTagsAction,
  deleteProposedTagAction,
  draftTaxonomyAction,
  saveTagAction,
  setTagStatusAction,
  type ActionResult,
} from "@/app/tagging/actions";
import { LoadingOverlay } from "@/components/loading-overlay";
import { MEME_TAG_DIMENSION_LABELS, type MemeTagDimension } from "@/utils/meme-tagging/schema";

type EditorTag = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  status: string;
};

type TaggingTaxonomyEditorProps = {
  dimension: MemeTagDimension;
  tags: EditorTag[];
  aiEnabled: boolean;
};

const STATUS_ORDER: Record<string, number> = { active: 0, proposed: 1, retired: 2 };

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  proposed: "Proposed",
  retired: "Retired",
};

export function TaggingTaxonomyEditor({ dimension, tags, aiEnabled }: TaggingTaxonomyEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [isDrafting, setIsDrafting] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");

  const sortedTags = [...tags].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name),
  );
  const proposedCount = tags.filter((tag) => tag.status === "proposed").length;
  const activeCount = tags.filter((tag) => tag.status === "active").length;

  const run = (action: () => Promise<ActionResult<unknown>>, successText?: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (successText) setMessage({ tone: "ok", text: successText });
        setEditingId(null);
      } else {
        setMessage({ tone: "error", text: result.error });
      }
    });
  };

  const handleDraft = () => {
    setMessage(null);
    setIsDrafting(true);
    startTransition(async () => {
      const result = await draftTaxonomyAction(dimension);
      setIsDrafting(false);
      setMessage(
        result.ok
          ? { tone: "ok", text: `Added ${result.data.added} proposed tag(s). Review them, then approve.` }
          : { tone: "error", text: result.error },
      );
    });
  };

  const beginEdit = (tag: EditorTag | null) => {
    setEditingId(tag ? tag.id : "new");
    setDraftName(tag?.name ?? "");
    setDraftDescription(tag?.description ?? "");
  };

  const editForm = (id: number | undefined) => (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => saveTagAction({ id, dimension, name: draftName, description: draftDescription }));
      }}
    >
      <input
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        placeholder="Tag name"
        aria-label="Tag name"
        className="app-input h-9 w-full rounded-md px-2 text-sm outline-none"
      />
      <textarea
        value={draftDescription}
        onChange={(event) => setDraftDescription(event.target.value)}
        placeholder="One-sentence definition used by the AI"
        aria-label="Tag description"
        rows={2}
        className="app-input w-full rounded-md px-2 py-1 text-sm outline-none"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={isPending} className="app-button app-button-primary rounded-md px-3 py-1 text-sm">
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          className="app-button rounded-md px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <section className="app-card space-y-4 rounded-xl p-4">
      {isDrafting ? <LoadingOverlay label="Drafting taxonomy with AI..." /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{MEME_TAG_DIMENSION_LABELS[dimension]}</h2>
          <p className="app-muted text-xs">
            {activeCount} active · {proposedCount} proposed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleDraft}
            disabled={!aiEnabled || isPending}
            className="app-button rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Draft with AI
          </button>
          <button
            type="button"
            onClick={() => run(() => approveProposedTagsAction(dimension), "Proposed tags approved.")}
            disabled={proposedCount === 0 || isPending}
            className="app-button app-button-primary rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            Approve all proposed
          </button>
        </div>
      </div>

      {message ? (
        <p role="status" className={`text-sm ${message.tone === "error" ? "text-red-600 dark:text-red-400" : "app-muted"}`}>
          {message.text}
        </p>
      ) : null}

      <ul className="space-y-2">
        {sortedTags.length === 0 ? (
          <li className="app-muted text-sm">No tags yet. Draft with AI or add one manually.</li>
        ) : null}
        {sortedTags.map((tag) => (
          <li
            key={tag.id}
            className={`rounded-lg border border-[var(--card-border)] p-3 ${tag.status === "retired" ? "opacity-60" : ""}`}
          >
            {editingId === tag.id ? (
              editForm(tag.id)
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {tag.name} <code className="app-muted text-xs font-normal">{tag.slug}</code>
                  </p>
                  {tag.description ? <p className="app-muted text-sm">{tag.description}</p> : null}
                  <p className="app-muted mt-1 text-xs uppercase tracking-wide">{STATUS_LABELS[tag.status] ?? tag.status}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => beginEdit(tag)} className="app-button rounded-md px-2 py-1 text-xs">
                    Edit
                  </button>
                  {tag.status === "proposed" ? (
                    <>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => setTagStatusAction(tag.id, "active"))}
                        className="app-button rounded-md px-2 py-1 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => run(() => deleteProposedTagAction(tag.id))}
                        className="app-button rounded-md px-2 py-1 text-xs"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}
                  {tag.status === "active" ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => setTagStatusAction(tag.id, "retired"))}
                      className="app-button rounded-md px-2 py-1 text-xs"
                    >
                      Retire
                    </button>
                  ) : null}
                  {tag.status === "retired" ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => setTagStatusAction(tag.id, "active"))}
                      className="app-button rounded-md px-2 py-1 text-xs"
                    >
                      Reactivate
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editingId === "new" ? (
        <div className="rounded-lg border border-[var(--card-border)] p-3">{editForm(undefined)}</div>
      ) : (
        <button type="button" onClick={() => beginEdit(null)} className="app-button rounded-md px-3 py-1.5 text-sm">
          Add tag
        </button>
      )}
    </section>
  );
}
