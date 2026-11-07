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
type LayoutLink = SimulationLinkDatum<LayoutNode> & { weight: number };

/** Render budget: the default threshold keeps at most this many lines on screen. */
const DEFAULT_EDGE_BUDGET = 500;
const LAYOUT_TICKS = 300;
const NODE_COLOR = "#2a78d6";
const FOCUS_COLOR = "#0d366b";
const PADDING = 24;
const TOP_PARTNERS = 5;
const TOP_PAIRS = 25;

/** Dot radius grows with the square root of likes, so area tracks the count. */
const radiusFor = (liked: number, maxLiked: number) => 3 + 6 * Math.sqrt(liked / maxLiked);

const pickDefaultThreshold = (edges: LikeGraphData["edges"], maxWeight: number) => {
  for (let threshold = 1; threshold <= maxWeight; threshold += 1) {
    if (edges.filter((edge) => edge[2] >= threshold).length <= DEFAULT_EDGE_BUDGET) return threshold;
  }
  return maxWeight;
};

export function LikeOverlapGraph({ data }: { data: LikeGraphData }) {
  const maxWeight = Math.max(1, ...data.edges.map((edge) => edge[2]));
  const maxLiked = Math.max(1, ...data.nodes.map((node) => node.liked));
  const [minShared, setMinShared] = useState(() => pickDefaultThreshold(data.edges, maxWeight));
  const [hideIsolated, setHideIsolated] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const focus = hovered ?? pinned;

  const visibleEdges = useMemo(() => data.edges.filter((edge) => edge[2] >= minShared), [data.edges, minShared]);

  const layout = useMemo(() => {
    const connected = new Set(visibleEdges.flatMap(([a, b]) => [a, b]));
    const nodes: LayoutNode[] = data.nodes
      .map((_, index) => ({ index }))
      .filter((node) => !hideIsolated || connected.has(node.index));
    const byIndex = new Map(nodes.map((node) => [node.index, node]));
    const links: LayoutLink[] = visibleEdges.map(([a, b, weight]) => ({
      source: byIndex.get(a) as LayoutNode,
      target: byIndex.get(b) as LayoutNode,
      weight,
    }));
    // Normalize against the visible range so the threshold doesn't flatten the differences.
    const span = Math.max(1, maxWeight - minShared);
    const strength = (link: LayoutLink) => (link.weight - minShared) / span;

    forceSimulation(nodes)
      .force(
        "link",
        forceLink<LayoutNode, LayoutLink>(links)
          .distance((link) => 30 + 110 * (1 - strength(link)))
          .strength((link) => 0.05 + 0.6 * strength(link)),
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
  }, [data.nodes, visibleEdges, hideIsolated, maxWeight, maxLiked, minShared]);

  const edgeWidth = (weight: number) =>
    maxWeight === minShared ? 2 : 0.6 + 5.4 * ((weight - minShared) / (maxWeight - minShared));

  const partnersOf = (index: number) =>
    data.edges
      .flatMap(([a, b, weight]) => (a === index ? [{ other: b, weight }] : b === index ? [{ other: a, weight }] : []))
      .sort((x, y) => y.weight - x.weight)
      .slice(0, TOP_PARTNERS);

  const topPairs = useMemo(() => [...data.edges].sort((a, b) => b[2] - a[2]).slice(0, TOP_PAIRS), [data.edges]);
  const focusNode = focus === null ? null : data.nodes[focus];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="app-muted space-y-1">
          <span className="block">Minimum shared likes per line: {minShared}</span>
          <input
            type="range"
            min={1}
            max={maxWeight}
            value={minShared}
            onChange={(event) => {
              setMinShared(Number(event.target.value));
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
          {visibleEdges.length.toLocaleString()} of {data.edges.length.toLocaleString()} pairs shown
        </p>
      </div>

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
                  strokeWidth={edgeWidth(link.weight)}
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
                Most shared likes with{" "}
                {partnersOf(focus)
                  .map(({ other, weight }) => `${data.nodes[other]?.label ?? "?"} (${weight})`)
                  .join(", ")}
                .
              </>
            ) : (
              " No shared likes with anyone."
            )}
            {pinned === focus ? <span className="app-muted"> Click the dot again or the background to unpin.</span> : null}
          </>
        ) : (
          <span className="app-muted">Hover over a participant for details; click to pin.</span>
        )}
      </p>

      <p className="app-muted text-xs">
        Raw shared-like counts favor people who like a lot of captions, so big dots naturally sit in the middle.
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Top {TOP_PAIRS} pairs by shared likes</summary>
        <div className="app-table-shell mt-2 overflow-x-auto rounded-xl">
          <table className="app-table w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 text-right font-semibold">Shared likes</th>
                <th className="px-3 py-2 text-right font-semibold">Each one&apos;s likes</th>
              </tr>
            </thead>
            <tbody>
              {topPairs.map(([a, b, weight]) => (
                <tr key={`${a}-${b}`}>
                  <td className="px-3 py-2">{data.nodes[a]?.label}</td>
                  <td className="px-3 py-2">{data.nodes[b]?.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{weight}</td>
                  <td className="app-muted px-3 py-2 text-right tabular-nums">
                    {data.nodes[a]?.liked} / {data.nodes[b]?.liked}
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
