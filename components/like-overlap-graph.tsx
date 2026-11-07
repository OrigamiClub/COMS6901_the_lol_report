"use client";

import { useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type LikeGraphData = {
  /** Participants who liked at least one caption. */
  nodes: { label: string; liked: number; seen: number }[];
  /** [node index, node index, captions both liked]. */
  edges: [number, number, number][];
};

type LayoutNode = SimulationNodeDatum & { index: number };
type LayoutLink = SimulationLinkDatum<LayoutNode> & { value: number };

/** One participant pair: captions both liked, and that as a share of captions either liked. */
type Pair = { a: number; b: number; shared: number; similarity: number };

type EdgeMode = "shared" | "similarity";

/** Render budget: the default threshold keeps at most this many lines on screen. */
const DEFAULT_EDGE_BUDGET = 500;
/**
 * Similarity ignores pairs with fewer shared likes than this, so two people who
 * each liked the same single caption don't show up as "100% similar".
 */
const MIN_SHARED_FOR_SIMILARITY = 3;
const LAYOUT_TICKS = 300;
const NODE_COLOR = "#2a78d6";
const FOCUS_COLOR = "#0d366b";
const PADDING = 24;
const TOP_PARTNERS = 5;
const TOP_PAIRS = 25;

const MODE_OPTIONS: { value: EdgeMode; label: string; description: string }[] = [
  { value: "shared", label: "Shared likes", description: "Captions both people liked." },
  {
    value: "similarity",
    label: "Similarity",
    description: `Shared likes ÷ captions either person liked (pairs with ${MIN_SHARED_FOR_SIMILARITY}+ shared likes).`,
  },
];

/** Dot radius grows with the square root of likes, so area tracks the count. */
const radiusFor = (liked: number, maxLiked: number) => 3 + 6 * Math.sqrt(liked / maxLiked);

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

/** Lowest slider step that keeps the visible pairs within the render budget. */
const pickDefaultThreshold = (values: number[], steps: number[]) =>
  steps.find((step) => values.filter((value) => value >= step).length <= DEFAULT_EDGE_BUDGET) ?? steps.at(-1) ?? 0;

export function LikeOverlapGraph({ data }: { data: LikeGraphData }) {
  const maxLiked = Math.max(1, ...data.nodes.map((node) => node.liked));

  const pairs = useMemo<Pair[]>(
    () =>
      data.edges.map(([a, b, shared]) => {
        const union = (data.nodes[a]?.liked ?? 0) + (data.nodes[b]?.liked ?? 0) - shared;
        return { a, b, shared, similarity: union > 0 ? shared / union : 0 };
      }),
    [data.edges, data.nodes],
  );
  const maxShared = Math.max(1, ...pairs.map((pair) => pair.shared));

  /** Metric for a pair in a mode, or null if the pair doesn't qualify in that mode. */
  const valueOf = (pair: Pair, edgeMode: EdgeMode) =>
    edgeMode === "shared" ? pair.shared : pair.shared >= MIN_SHARED_FOR_SIMILARITY ? pair.similarity : null;

  const sliderSteps = useMemo(
    () => ({
      shared: Array.from({ length: maxShared }, (_, index) => index + 1),
      similarity: Array.from({ length: 100 }, (_, index) => (index + 1) / 100),
    }),
    [maxShared],
  );

  const [mode, setMode] = useState<EdgeMode>("shared");
  const [thresholds, setThresholds] = useState<Record<EdgeMode, number>>(() => ({
    shared: pickDefaultThreshold(
      pairs.map((pair) => pair.shared),
      sliderSteps.shared,
    ),
    similarity: pickDefaultThreshold(
      pairs.flatMap((pair) => (pair.shared >= MIN_SHARED_FOR_SIMILARITY ? [pair.similarity] : [])),
      sliderSteps.similarity,
    ),
  }));
  const [hideIsolated, setHideIsolated] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const focus = hovered ?? pinned;
  const threshold = thresholds[mode];

  const modePairs = useMemo(
    () =>
      pairs.flatMap((pair) => {
        const value = mode === "shared" ? pair.shared : pair.shared >= MIN_SHARED_FOR_SIMILARITY ? pair.similarity : null;
        return value === null ? [] : [{ ...pair, value }];
      }),
    [pairs, mode],
  );
  const maxValue = Math.max(threshold, ...modePairs.map((pair) => pair.value));
  const visiblePairs = useMemo(() => modePairs.filter((pair) => pair.value >= threshold), [modePairs, threshold]);
  /** 0 at the threshold, 1 at the strongest pair, so the slider doesn't flatten differences. */
  const strengthOf = (value: number) => (maxValue === threshold ? 0.5 : (value - threshold) / (maxValue - threshold));

  const layout = useMemo(() => {
    const span = maxValue - threshold;
    const strength = (value: number) => (span <= 0 ? 0.5 : (value - threshold) / span);
    const connected = new Set(visiblePairs.flatMap(({ a, b }) => [a, b]));
    const nodes: LayoutNode[] = data.nodes
      .map((_, index) => ({ index }))
      .filter((node) => !hideIsolated || connected.has(node.index));
    const byIndex = new Map(nodes.map((node) => [node.index, node]));
    const links: LayoutLink[] = visiblePairs.map(({ a, b, value }) => ({
      source: byIndex.get(a) as LayoutNode,
      target: byIndex.get(b) as LayoutNode,
      value,
    }));

    forceSimulation(nodes)
      .force(
        "link",
        forceLink<LayoutNode, LayoutLink>(links)
          .distance((link) => 30 + 110 * (1 - strength(link.value)))
          .strength((link) => 0.05 + 0.6 * strength(link.value)),
      )
      .force("charge", forceManyBody().strength(-45))
      .force("center", forceCenter(0, 0))
      .force("collide", forceCollide<LayoutNode>((node) => radiusFor(data.nodes[node.index]?.liked ?? 0, maxLiked) + 2))
      .stop()
      .tick(LAYOUT_TICKS);

    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(0, ...xs) - PADDING;
    const minY = Math.min(0, ...ys) - PADDING;
    const width = Math.max(...xs, 0) + PADDING - minX;
    const height = Math.max(...ys, 0) + PADDING - minY;
    return { nodes, links, viewBox: `${minX} ${minY} ${Math.max(width, 1)} ${Math.max(height, 1)}` };
  }, [data.nodes, visiblePairs, hideIsolated, maxValue, maxLiked, threshold]);

  const edgeWidth = (value: number) => 0.6 + 5.4 * strengthOf(value);
  const formatValue = (value: number) => (mode === "shared" ? value.toLocaleString() : formatPercent(value));
  const describePair = (pair: Pair) => `${pair.shared} shared, ${formatPercent(pair.similarity)} similar`;

  const partnersOf = (index: number) =>
    pairs
      .filter((pair) => (pair.a === index || pair.b === index) && valueOf(pair, mode) !== null)
      .sort((x, y) => (valueOf(y, mode) ?? 0) - (valueOf(x, mode) ?? 0))
      .slice(0, TOP_PARTNERS);

  const topPairs = [...modePairs].sort((x, y) => y.value - x.value || y.shared - x.shared).slice(0, TOP_PAIRS);
  const focusNode = focus === null ? null : data.nodes[focus];
  const modeOption = MODE_OPTIONS.find((option) => option.value === mode);
  const steps = sliderSteps[mode];
  const stepIndex = Math.max(0, steps.indexOf(threshold));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <fieldset className="space-y-1">
          <legend className="app-muted mb-1">Line strength</legend>
          <div className="flex gap-1" role="radiogroup">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => {
                  setMode(option.value);
                  setPinned(null);
                }}
                className={`app-button rounded-md px-3 py-1 text-sm ${mode === option.value ? "app-button-primary" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="app-muted space-y-1">
          <span className="block">
            Minimum {mode === "shared" ? "shared likes" : "similarity"} per line: {formatValue(threshold)}
          </span>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={stepIndex}
            onChange={(event) => {
              const next = steps[Number(event.target.value)];
              if (next === undefined) return;
              setThresholds((current) => ({ ...current, [mode]: next }));
              setPinned(null);
            }}
            className="w-56"
          />
        </label>
        <label className="app-muted flex items-center gap-2">
          <input type="checkbox" checked={hideIsolated} onChange={(event) => setHideIsolated(event.target.checked)} />
          Hide participants with no lines
        </label>
        <p className="app-muted text-xs">
          {layout.nodes.length.toLocaleString()} of {data.nodes.length.toLocaleString()} participants ·{" "}
          {visiblePairs.length.toLocaleString()} of {modePairs.length.toLocaleString()} pairs shown
        </p>
      </div>
      <p className="app-muted text-xs">{modeOption?.description}</p>

      <div className="app-table-shell overflow-hidden rounded-xl">
        <svg
          viewBox={layout.viewBox}
          className="block h-[36rem] w-full"
          role="img"
          aria-label="Network of participants linked by captions they both liked. The top pairs table below lists the same data."
          onClick={() => setPinned(null)}
        >
          <g>
            {layout.links.map((link) => {
              const source = link.source as LayoutNode;
              const target = link.target as LayoutNode;
              const incident = focus !== null && (source.index === focus || target.index === focus);
              return (
                <line
                  key={`${source.index}-${target.index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={incident ? FOCUS_COLOR : "var(--muted)"}
                  strokeOpacity={focus === null ? 0.3 : incident ? 0.9 : 0.06}
                  strokeWidth={edgeWidth(link.value)}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          <g>
            {layout.nodes.map((node) => {
              const info = data.nodes[node.index];
              if (!info) return null;
              const isFocus = focus === node.index;
              const r = radiusFor(info.liked, maxLiked);
              return (
                <g
                  key={node.index}
                  transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(node.index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPinned((current) => (current === node.index ? null : node.index));
                  }}
                >
                  {/* Larger invisible hit target than the dot itself. */}
                  <circle r={r + 6} fill="transparent" />
                  <circle
                    r={r}
                    fill={isFocus ? FOCUS_COLOR : NODE_COLOR}
                    fillOpacity={focus === null || isFocus ? 1 : 0.55}
                    stroke="var(--background)"
                    strokeWidth={2}
                  />
                  <title>{`${info.label}: liked ${info.liked} of ${info.seen} seen`}</title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="min-h-5 text-sm" aria-live="polite">
        {focusNode && focus !== null ? (
          <>
            <strong>{focusNode.label}</strong>: liked {focusNode.liked} of {focusNode.seen} captions seen.
            {partnersOf(focus).length > 0 ? (
              <>
                {" "}
                {mode === "shared" ? "Most shared likes" : "Most similar"} with{" "}
                {partnersOf(focus)
                  .map((pair) => `${data.nodes[pair.a === focus ? pair.b : pair.a]?.label ?? "?"} (${describePair(pair)})`)
                  .join(", ")}
                .
              </>
            ) : (
              ` No ${mode === "shared" ? "shared likes" : `pairs with ${MIN_SHARED_FOR_SIMILARITY}+ shared likes`}.`
            )}
            {pinned === focus ? <span className="app-muted"> Click the dot again or the background to unpin.</span> : null}
          </>
        ) : (
          <span className="app-muted">Hover over a participant for details; click to pin.</span>
        )}
      </p>

      {mode === "shared" ? (
        <p className="app-muted text-xs">
          Raw shared-like counts favor people who like a lot of captions, so big dots naturally sit in the middle.
          Switch to Similarity to compare taste regardless of how much each person likes.
        </p>
      ) : null}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Top {TOP_PAIRS} pairs by {mode === "shared" ? "shared likes" : "similarity"}
        </summary>
        <div className="app-table-shell mt-2 overflow-x-auto rounded-xl">
          <table className="app-table w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 text-right font-semibold">Shared likes</th>
                <th className="px-3 py-2 text-right font-semibold">Similarity</th>
                <th className="px-3 py-2 text-right font-semibold">Each one&apos;s likes</th>
              </tr>
            </thead>
            <tbody>
              {topPairs.map((pair) => (
                <tr key={`${pair.a}-${pair.b}`}>
                  <td className="px-3 py-2">{data.nodes[pair.a]?.label}</td>
                  <td className="px-3 py-2">{data.nodes[pair.b]?.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pair.shared}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPercent(pair.similarity)}</td>
                  <td className="app-muted px-3 py-2 text-right tabular-nums">
                    {data.nodes[pair.a]?.liked} / {data.nodes[pair.b]?.liked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
