"use client";

import {
  startTransition as startDeferredTransition,
  type ChangeEvent,
  useDeferredValue,
  useId,
  useState,
} from "react";

import {
  CAPTION_GALLERY_SORT_OPTIONS,
  DEFAULT_CAPTION_GALLERY_SORT,
  isCaptionGallerySort,
  sortCaptionRows,
  type CaptionDetailRow,
} from "./caption-gallery-shared";

type StudyDetailCaptionGalleryProps = {
  captionRows: CaptionDetailRow[];
};

const formatPercent = (value: number) => `${(value * 100).toFixed(2)}%`;

export function StudyDetailCaptionGallery({
  captionRows,
}: StudyDetailCaptionGalleryProps) {
  const [selectedSort, setSelectedSort] = useState(DEFAULT_CAPTION_GALLERY_SORT);
  const deferredSort = useDeferredValue(selectedSort);
  const sortSelectId = useId();
  const sortedCaptionRows = sortCaptionRows(captionRows, deferredSort);
  const isSorting = selectedSort !== deferredSort;
  const isSortDisabled = captionRows.length < 2;

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSort = event.target.value;
    if (!isCaptionGallerySort(nextSort)) {
      return;
    }

    startDeferredTransition(() => {
      setSelectedSort(nextSort);
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Caption Gallery</h2>
        <div className="flex items-end gap-3">
          {isSorting ? <p className="app-muted text-sm">Sorting...</p> : null}
          <label htmlFor={sortSelectId} className="app-muted space-y-1 text-sm">
            <span className="block">Sort</span>
            <select
              id={sortSelectId}
              value={selectedSort}
              onChange={handleSortChange}
              disabled={isSortDisabled}
              className="app-input h-9 min-w-56 rounded-md px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {CAPTION_GALLERY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedCaptionRows.length ? (
          sortedCaptionRows.map((row) => (
            <div key={row.caption_id}>
              <article className="app-card overflow-hidden rounded-xl">
                {row.image_url ? (
                  <div className="bg-white/40 p-3 dark:bg-slate-950/20">
                    <img
                      src={row.image_url}
                      alt={row.image_description ?? row.caption_text}
                      loading="lazy"
                      decoding="async"
                      className="h-auto w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="grid min-h-48 place-items-center bg-white/30 p-6 text-sm dark:bg-slate-950/20">
                    <span className="app-muted">Image unavailable</span>
                  </div>
                )}
                <div className="p-4">
                  <p className="text-lg font-semibold leading-7 sm:text-xl">{row.caption_text}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    {row.vote_distribution_rows.map((distributionRow) => (
                      <div
                        key={`${row.caption_id}-${distributionRow.vote_value}`}
                        className="rounded-md border border-white/45 bg-white/40 px-3 py-2 dark:border-cyan-200/10 dark:bg-slate-950/20"
                      >
                        <p className="app-muted font-medium uppercase tracking-wide">
                          {distributionRow.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          {distributionRow.count.toLocaleString()}
                        </p>
                        <p className="app-muted mt-1">
                          {formatPercent(distributionRow.percentage)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </div>
          ))
        ) : (
          <div className="app-card rounded-xl p-6 text-center text-sm">
            No captions were mapped to this study.
          </div>
        )}
      </div>
    </section>
  );
}
