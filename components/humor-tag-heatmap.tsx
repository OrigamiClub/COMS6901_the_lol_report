"use client";

import { useState, type CSSProperties } from "react";

export type HeatmapTag = { id: number; name: string; slug: string };

export type HeatmapCell = {
  humor_style_tag_id: number;
  subject_tag_id: number;
  captions: number;
  /** Denominator for the rate: views (like rate) or votes (upvote rate). */
  sample: number;
  /** Numerator: liked views or upvotes. */
  hits: number;
};

type HumorTagHeatmapProps = {
  humorStyles: HeatmapTag[];
  subjects: HeatmapTag[];
  cells: HeatmapCell[];
  /** "Like rate" or "Upvote rate". */
  metricLabel: string;
  /** "views" or "votes". */
  sampleLabel: string;
  /** "liked" or "upvoted". */
  hitLabel: string;
  studyRate: number;
  minSample: number;
};

/** Sequential blue ramp, steps 100→700 (light → dark). */
const RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];
/** Index of the first step dark enough to need white ink. */
const WHITE_INK_FROM = 6;
const DARK_INK = "#122033";
const LIGHT_INK = "#ffffff";

const hexToRgb = (hex: string) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));

const interpolate = (t: number) => {
  const position = Math.min(Math.max(t, 0), 1) * (RAMP.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, RAMP.length - 1);
  const mix = position - lower;
  const [a, b] = [hexToRgb(RAMP[lower] as string), hexToRgb(RAMP[upper] as string)];
  const rgb = a.map((channel, index) => Math.round(channel + ((b[index] as number) - channel) * mix));
  return { color: `rgb(${rgb.join(", ")})`, ink: position >= WHITE_INK_FROM ? LIGHT_INK : DARK_INK };
};

/**
 * Light mode: low rates are pale (recede to the light surface), high rates dark.
 * Dark mode runs the same ramp the other way so low rates recede to the dark surface.
 */
const heatStyle = (t: number): CSSProperties => {
  const light = interpolate(t);
  const dark = interpolate(1 - t);
  return {
    "--heat-light": light.color,
    "--heat-light-ink": light.ink,
    "--heat-dark": dark.color,
    "--heat-dark-ink": dark.ink,
  } as CSSProperties;
};

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
const formatDelta = (value: number) => {
  const points = value * 100;
  return `${points >= 0 ? "+" : "−"}${Math.abs(points).toFixed(1)} pts`;
};

export function HumorTagHeatmap({
  humorStyles,
  subjects,
  cells,
  metricLabel,
  sampleLabel,
  hitLabel,
  studyRate,
  minSample,
}: HumorTagHeatmapProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const cellByKey = new Map(cells.map((cell) => [`${cell.humor_style_tag_id}|${cell.subject_tag_id}`, cell]));
  const rate = (cell: HeatmapCell) => (cell.sample === 0 ? 0 : cell.hits / cell.sample);
  const reliable = cells.filter((cell) => cell.sample >= minSample);
  const rates = reliable.map(rate);
  const minRate = rates.length > 0 ? Math.min(...rates) : 0;
  const maxRate = rates.length > 0 ? Math.max(...rates) : 1;
  const scale = (value: number) => (maxRate === minRate ? 0.5 : (value - minRate) / (maxRate - minRate));

  const nameById = new Map([...humorStyles, ...subjects].map((tag) => [tag.id, tag.name]));
  const activeCell = activeKey ? cellByKey.get(activeKey) : undefined;
  const [activeStyleId, activeSubjectId] = activeKey ? activeKey.split("|").map(Number) : [];

  const describe = (cell: HeatmapCell) =>
    cell.sample === 0
      ? `${cell.captions} caption(s), no ${sampleLabel} yet`
      : `${formatPercent(rate(cell))} ${metricLabel.toLowerCase()} (${cell.hits.toLocaleString()} ${hitLabel} of ${cell.sample.toLocaleString()} ${sampleLabel}, ${formatDelta(rate(cell) - studyRate)} vs. study) · ${cell.captions} caption(s)`;

  if (humorStyles.length === 0 || subjects.length === 0) {
    return <p className="app-muted text-sm">No captions have both a humor-style and a subject tag yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="app-table-shell overflow-x-auto rounded-xl">
        <table className="w-full border-separate border-spacing-[2px] p-2 text-sm">
          <thead>
            <tr>
              <th className="app-muted px-2 py-1 text-left text-xs font-semibold">Humor style ↓ · Subject →</th>
              {subjects.map((subject) => (
                <th
                  key={subject.id}
                  scope="col"
                  className={`min-w-[5.5rem] px-1 py-1 text-center align-bottom text-xs font-semibold ${
                    activeSubjectId === subject.id ? "underline" : ""
                  }`}
                >
                  {subject.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {humorStyles.map((style) => (
              <tr key={style.id}>
                <th
                  scope="row"
                  className={`whitespace-nowrap px-2 py-1 text-left text-xs font-semibold ${
                    activeStyleId === style.id ? "underline" : ""
                  }`}
                >
                  {style.name}
                </th>
                {subjects.map((subject) => {
                  const key = `${style.id}|${subject.id}`;
                  const cell = cellByKey.get(key);
                  const isActive = activeKey === key;
                  const ring = isActive ? "outline outline-2 outline-offset-1 outline-[var(--foreground)]" : "";
                  if (!cell) {
                    return (
                      <td
                        key={key}
                        className="app-muted h-11 rounded text-center text-xs"
                        aria-label={`${style.name} × ${subject.name}: no captions`}
                      >
                        ·
                      </td>
                    );
                  }
                  const isReliable = cell.sample >= minSample;
                  const label = `${style.name} × ${subject.name}: ${describe(cell)}`;
                  return (
                    <td
                      key={key}
                      tabIndex={0}
                      aria-label={label}
                      title={label}
                      onMouseEnter={() => setActiveKey(key)}
                      onMouseLeave={() => setActiveKey(null)}
                      onFocus={() => setActiveKey(key)}
                      onBlur={() => setActiveKey(null)}
                      style={isReliable ? heatStyle(scale(rate(cell))) : undefined}
                      className={`h-11 cursor-default rounded text-center tabular-nums ${ring} ${
                        isReliable
                          ? "app-heat-cell font-semibold"
                          : "app-muted border border-dashed border-[var(--muted)] text-xs"
                      }`}
                    >
                      {cell.sample === 0 ? "—" : formatPercent(rate(cell))}
                      {!isReliable ? <span className="block text-[10px]">n={cell.sample}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="min-h-5 text-sm" aria-live="polite">
        {activeCell ? (
          <>
            <strong>
              {nameById.get(activeStyleId as number)} × {nameById.get(activeSubjectId as number)}
            </strong>
            : {describe(activeCell)}
          </>
        ) : (
          <span className="app-muted">Hover or tab to a cell for details.</span>
        )}
      </p>

      <div className="app-muted flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
        <span className="flex items-center gap-2">
          {metricLabel}
          <span>{formatPercent(minRate)}</span>
          <span
            className="app-heat-legend inline-block h-3 w-32 rounded"
            aria-hidden="true"
            style={
              {
                "--heat-legend-light": `linear-gradient(90deg, ${RAMP.join(", ")})`,
                "--heat-legend-dark": `linear-gradient(90deg, ${[...RAMP].reverse().join(", ")})`,
              } as CSSProperties
            }
          />
          <span>{formatPercent(maxRate)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded border border-dashed border-[var(--muted)]" aria-hidden="true" />
          Fewer than {minSample} {sampleLabel} (not colored)
        </span>
        <span>· = no captions with this pair</span>
        <span>Study average {formatPercent(studyRate)}</span>
      </div>
    </div>
  );
}
