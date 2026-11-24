"use client";

import { useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import { louvain } from "@/utils/like-graph/louvain";

export type LikeGraphData = {
  /** Participants who liked at least one caption. */
  nodes: { label: string; liked: number; seen: number; liked_captions: number[] }[];
  /** [node index, node index, captions both liked]. */
  edges: [number, number, number][];
  /** Captions liked by at least one participant; `liked_captions` indexes into this. */
  captions: {
    caption_id: string;
    text: string;
    image_url: string | null;
    image_description: string | null;
    style: string | null;
  }[];
};

type LayoutNode = SimulationNodeDatum & { index: number };
type LayoutLink = SimulationLinkDatum<LayoutNode> & { value: number };

/** One participant pair: captions both liked, and that as a share of captions either liked. */
type Pair = { a: number; b: number; shared: number; similarity: number };

type EdgeMode = "shared" | "similarity";
type LayoutMode = "grouped" | "network";

const LAYOUT_OPTIONS: { value: LayoutMode; label: string }[] = [
  { value: "grouped", label: "By group" },
  { value: "network", label: "Free" },
];

const DEFAULT_NEIGHBORS = 3;
const MAX_NEIGHBORS = 10;
/** Everyone with at least one like is shown by default; raise it to drop people whose overlap could be chance. */
const DEFAULT_MIN_LIKES = 1;
/** Groups smaller than this aren't summarized. */
const MIN_GROUP_SIZE = 3;
/**
 * Groups get the eight categorical colors in order; larger group numbers fall back to gray.
 * Beyond the first three, some color pairs are close for color-blind viewers, so every group
 * also carries a "Group N" label (on the graph, the group cards, and hover).
 */
const GROUP_COLOR_COUNT = 8;
const TOP_GROUP_CAPTIONS = 3;
/** A caption must be liked by at least this share of a group to count as a group favorite. */
const MIN_GROUP_LIKE_SHARE = 0.3;
/** A group is named after a humor style only if that style's share of its likes is at least this much above everyone's. */
const MIN_STYLE_LIFT_FOR_NAME = 0.03;
/** Graph labels shorten style names past this length so neighboring labels don't collide. */
const MAX_LABEL_STYLE_CHARS = 16;
const LAYOUT_TICKS = 300;
const PADDING = 24;
const TOP_PARTNERS = 5;
const TOP_PAIRS = 25;

const MODE_OPTIONS: { value: EdgeMode; label: string; description: string }[] = [
  {
    value: "similarity",
    label: "Similarity",
    description:
      "Lines connect each person to the people whose likes overlap most (shared likes ÷ captions either liked). Dot size = number of lines.",
  },
  {
    value: "shared",
    label: "Shared likes",
    description: "Lines connect each person to the people they share the most liked captions with. Dot size = likes.",
  },
];

/** Light-mode values, used as fallbacks if the theme variables aren't loaded (so dots never render black). */
const GROUP_COLOR_FALLBACKS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const OTHER_GROUP_FALLBACK = "#8f8e89";

const groupColor = (group: number | undefined) =>
  group !== undefined && group < GROUP_COLOR_COUNT
    ? `var(--graph-group-${group + 1}, ${GROUP_COLOR_FALLBACKS[group] ?? OTHER_GROUP_FALLBACK})`
    : `var(--graph-group-other, ${OTHER_GROUP_FALLBACK})`;

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * How much more alike a group's members are with each other than with everyone else shown,
 * as average pairwise similarity inside ÷ average similarity to outsiders.
 */
type GroupStrength = { within: number; across: number; ratio: number | null; level: "tight" | "moderate" | "loose" };

/**
 * Cutoffs calibrated on study 122, where groups ranged from 1.16× to 1.90×. A random set of people
 * scores about 1×, and Louvain always finds some grouping, so groups near 1× may be mostly chance.
 */
const TIGHT_RATIO = 1.5;
const LOOSE_RATIO = 1.25;

const strengthLevel = (ratio: number | null): GroupStrength["level"] =>
  ratio === null || ratio >= TIGHT_RATIO ? "tight" : ratio >= LOOSE_RATIO ? "moderate" : "loose";

const STRENGTH_TEXT: Record<GroupStrength["level"], string> = {
  tight: "Tight group",
  moderate: "Moderate group",
  loose: "Loose group: treat with caution",
};
const formatPoints = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(Math.round(value * 100))} pts`;

/** Dot radius grows with the square root of the value, so area tracks it. */
const radiusFor = (value: number, max: number) => 3 + 6 * Math.sqrt(value / Math.max(max, 1));

export function LikeOverlapGraph({ data }: { data: LikeGraphData }) {
  const maxLiked = Math.max(1, ...data.nodes.map((node) => node.liked));
  const [mode, setMode] = useState<EdgeMode>("similarity");
  const [neighbors, setNeighbors] = useState(DEFAULT_NEIGHBORS);
  const [minLikes, setMinLikes] = useState(Math.min(DEFAULT_MIN_LIKES, maxLiked));
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grouped");
  const focus = hovered ?? pinned;

  const pairs = useMemo<Pair[]>(
    () =>
      data.edges.map(([a, b, shared]) => {
        const union = (data.nodes[a]?.liked ?? 0) + (data.nodes[b]?.liked ?? 0) - shared;
        return { a, b, shared, similarity: union > 0 ? shared / union : 0 };
      }),
    [data.edges, data.nodes],
  );

  const graph = useMemo(() => {
    const metric = (pair: Pair) => (mode === "shared" ? pair.shared : pair.similarity);
    const eligible = (index: number) => (data.nodes[index]?.liked ?? 0) >= minLikes;

    // Each eligible person's partners, strongest first (ties: more shared likes first).
    const partners = new Map<number, Pair[]>();
    for (const pair of pairs) {
      if (!eligible(pair.a) || !eligible(pair.b)) continue;
      for (const node of [pair.a, pair.b]) {
        const list = partners.get(node);
        if (list) list.push(pair);
        else partners.set(node, [pair]);
      }
    }
    for (const list of partners.values()) list.sort((x, y) => metric(y) - metric(x) || y.shared - x.shared);

    // Union of everyone's top-k partners.
    const edgeByKey = new Map<string, Pair>();
    for (const list of partners.values()) {
      for (const pair of list.slice(0, neighbors)) edgeByKey.set(`${pair.a}-${pair.b}`, pair);
    }
    const edges = [...edgeByKey.values()].map((pair) => ({ ...pair, value: metric(pair) }));

    const nodeIndexes = [...new Set(edges.flatMap((edge) => [edge.a, edge.b]))].sort((a, b) => a - b);
    const local = new Map(nodeIndexes.map((node, index) => [node, index]));
    const communities = louvain(
      nodeIndexes.length,
      edges.map((edge) => [local.get(edge.a) as number, local.get(edge.b) as number, Math.max(edge.value, 1e-6)]),
    );
    const groupOf = new Map(nodeIndexes.map((node, index) => [node, communities[index] as number]));

    const degree = new Map<number, number>();
    for (const edge of edges) {
      degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
      degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
    }

    return {
      partners,
      edges,
      nodeIndexes,
      groupOf,
      degree,
      maxDegree: Math.max(1, ...degree.values()),
      eligibleCount: data.nodes.filter((node) => node.liked >= minLikes).length,
    };
  }, [data.nodes, pairs, mode, neighbors, minLikes]);

  const groups = useMemo(() => {
    const members = new Map<number, number[]>();
    for (const [node, group] of graph.groupOf) {
      const list = members.get(group);
      if (list) list.push(node);
      else members.set(group, [node]);
    }

    /** Share of `people` who liked each caption. */
    const likeShare = (people: number[]) => {
      const counts = new Map<number, number>();
      for (const person of people) {
        for (const caption of data.nodes[person]?.liked_captions ?? []) counts.set(caption, (counts.get(caption) ?? 0) + 1);
      }
      return (caption: number) => (counts.get(caption) ?? 0) / Math.max(people.length, 1);
    };
    /** Share of `people`'s likes that went to each humor style. */
    const styleShare = (people: number[]) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (const person of people) {
        for (const caption of data.nodes[person]?.liked_captions ?? []) {
          const style = data.captions[caption]?.style;
          if (!style) continue;
          counts.set(style, (counts.get(style) ?? 0) + 1);
          total += 1;
        }
      }
      return (style: string) => (counts.get(style) ?? 0) / Math.max(total, 1);
    };
    const overallCaption = likeShare(graph.nodeIndexes);
    const overallStyle = styleShare(graph.nodeIndexes);
    const styleNames = [...new Set(data.captions.flatMap((caption) => (caption.style ? [caption.style] : [])))];

    // Similarity for every pair shown (pairs with no shared likes are absent, i.e. 0).
    const shown = new Set(graph.nodeIndexes);
    const pairSimilarity = pairs.filter((pair) => shown.has(pair.a) && shown.has(pair.b));
    const strengthOf = (people: number[]): GroupStrength => {
      const inGroup = new Set(people);
      let withinSum = 0;
      let acrossSum = 0;
      for (const pair of pairSimilarity) {
        const aIn = inGroup.has(pair.a);
        const bIn = inGroup.has(pair.b);
        if (aIn && bIn) withinSum += pair.similarity;
        else if (aIn !== bIn) acrossSum += pair.similarity;
      }
      const n = people.length;
      const outsiders = shown.size - n;
      const within = n > 1 ? withinSum / ((n * (n - 1)) / 2) : 0;
      const across = outsiders > 0 ? acrossSum / (n * outsiders) : 0;
      const ratio = across > 0 ? within / across : null;
      return { within, across, ratio, level: strengthLevel(ratio) };
    };

    const summaries = [...members.entries()]
      .filter(([, people]) => people.length >= MIN_GROUP_SIZE)
      .sort((a, b) => a[0] - b[0])
      .map(([group, people]) => {
        const groupCaption = likeShare(people);
        const favorites = data.captions
          .map((caption, index) => ({ caption, group: groupCaption(index), overall: overallCaption(index) }))
          .filter((row) => row.group >= MIN_GROUP_LIKE_SHARE && row.group > row.overall)
          .sort((x, y) => y.group - y.overall - (x.group - x.overall))
          .slice(0, TOP_GROUP_CAPTIONS);
        const groupStyle = styleShare(people);
        const style = styleNames
          .map((name) => ({ name, lift: groupStyle(name) - overallStyle(name) }))
          .sort((x, y) => y.lift - x.lift)[0];
        const leaning = style && style.lift >= MIN_STYLE_LIFT_FOR_NAME ? style : null;
        return {
          group,
          people,
          averageLikes: people.reduce((sum, person) => sum + (data.nodes[person]?.liked ?? 0), 0) / people.length,
          favorites,
          style: leaning,
          strength: strengthOf(people),
        };
      });
    const inSmallGroups = [...members.values()].filter((people) => people.length < MIN_GROUP_SIZE).flat().length;
    const styleByGroup = new Map(summaries.map((summary) => [summary.group, summary.style?.name ?? null]));
    return { summaries, inSmallGroups, styleByGroup };
  }, [graph, pairs, data.nodes, data.captions]);

  const radiusOf = (node: number) =>
    mode === "shared"
      ? radiusFor(data.nodes[node]?.liked ?? 0, maxLiked)
      : radiusFor(graph.degree.get(node) ?? 0, graph.maxDegree);

  const layout = useMemo(() => {
    const radius = (node: number) =>
      mode === "shared"
        ? radiusFor(data.nodes[node]?.liked ?? 0, maxLiked)
        : radiusFor(graph.degree.get(node) ?? 0, graph.maxDegree);
    const values = graph.edges.map((edge) => edge.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const strength = (value: number) => (high === low ? 0.5 : (value - low) / (high - low));

    const nodes: LayoutNode[] = graph.nodeIndexes.map((index) => ({ index }));
    const byIndex = new Map(nodes.map((node) => [node.index, node]));
    const links: LayoutLink[] = graph.edges.map((edge) => ({
      source: byIndex.get(edge.a) as LayoutNode,
      target: byIndex.get(edge.b) as LayoutNode,
      value: edge.value,
    }));

    const grouped = layoutMode === "grouped";
    const groupOfNode = (node: LayoutNode) => graph.groupOf.get(node.index);
    const sameGroup = (link: LayoutLink) =>
      groupOfNode(link.source as LayoutNode) === groupOfNode(link.target as LayoutNode);

    // Grouped view: each group gets an anchor on a ring (largest first, clockwise from the top),
    // with the ring sized so neighboring groups don't overlap.
    const groupSizes = new Map<number, number>();
    for (const group of graph.groupOf.values()) groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
    const groupIds = [...groupSizes.keys()].sort((a, b) => a - b);
    const clusterRadius = (group: number) => 14 * Math.sqrt(groupSizes.get(group) ?? 1) + 10;
    const circumference = groupIds.reduce((sum, group) => sum + 2 * clusterRadius(group) + 30, 0);
    const ringRadius = groupIds.length > 1 ? Math.max(circumference / (2 * Math.PI), 80) : 0;
    const anchors = new Map<number, { x: number; y: number }>();
    let travelled = 0;
    for (const group of groupIds) {
      const arc = 2 * clusterRadius(group) + 30;
      const angle = ((travelled + arc / 2) / circumference) * 2 * Math.PI - Math.PI / 2;
      anchors.set(group, { x: ringRadius * Math.cos(angle), y: ringRadius * Math.sin(angle) });
      travelled += arc;
    }
    const anchorOf = (node: LayoutNode) => anchors.get(groupOfNode(node) ?? -1) ?? { x: 0, y: 0 };

    const simulation = forceSimulation(nodes)
      .force(
        "link",
        forceLink<LayoutNode, LayoutLink>(links)
          .distance((link) => (grouped && !sameGroup(link) ? 160 : 25 + 90 * (1 - strength(link.value))))
          .strength((link) =>
            grouped && !sameGroup(link) ? 0.01 : 0.15 + 0.6 * strength(link.value),
          ),
      )
      .force("charge", forceManyBody().strength(grouped ? -25 : -40))
      .force("collide", forceCollide<LayoutNode>((node) => radius(node.index) + 2));
    if (grouped) {
      simulation
        .force("groupX", forceX<LayoutNode>((node) => anchorOf(node).x).strength(0.25))
        .force("groupY", forceY<LayoutNode>((node) => anchorOf(node).y).strength(0.25));
    } else {
      simulation.force("center", forceCenter(0, 0));
    }
    simulation.stop().tick(LAYOUT_TICKS);

    // Label position per group: centered above its members.
    const labels = grouped
      ? groupIds.flatMap((group) => {
          const members = nodes.filter((node) => groupOfNode(node) === group);
          if (members.length < MIN_GROUP_SIZE) return [];
          const xs = members.map((node) => node.x ?? 0);
          const top = Math.min(...members.map((node) => (node.y ?? 0) - radius(node.index)));
          // Two lines (number, then humor style) sit above the group's topmost dot.
          return [{ group, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: top - 21 }];
        })
      : [];

    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(0, ...xs) - PADDING;
    const minY = Math.min(0, ...ys, ...labels.map((label) => label.y - 12)) - PADDING;
    const width = Math.max(...xs, 0) + PADDING - minX;
    const height = Math.max(...ys, 0) + PADDING - minY;
    return { nodes, links, labels, low, high, viewBox: `${minX} ${minY} ${Math.max(width, 1)} ${Math.max(height, 1)}` };
  }, [graph, mode, data.nodes, maxLiked, layoutMode]);

  const edgeWidth = (value: number) =>
    layout.high === layout.low ? 2 : 0.6 + 4.4 * ((value - layout.low) / (layout.high - layout.low));
  const describePair = (pair: Pair) => `${pair.shared} shared, ${formatPercent(pair.similarity)} similar`;
  /** "Group 2 · Wordplay" when the group leans toward a style, else "Group 2". */
  const groupLabel = (group: number | undefined) => {
    if (group === undefined) return "no group";
    const style = groups.styleByGroup.get(group);
    return style ? `Group ${group + 1} · ${style}` : `Group ${group + 1}`;
  };
  const isDimmed = (node: number) =>
    selectedGroup !== null ? graph.groupOf.get(node) !== selectedGroup : focus !== null && focus !== node;

  const topPairs = [...graph.edges].sort((x, y) => y.value - x.value || y.shared - x.shared).slice(0, TOP_PAIRS);
  const focusNode = focus === null ? null : data.nodes[focus];
  const focusPartners = focus === null ? [] : (graph.partners.get(focus) ?? []).slice(0, TOP_PARTNERS);
  const modeOption = MODE_OPTIONS.find((option) => option.value === mode);
  const hiddenForLikes = data.nodes.length - graph.eligibleCount;

  const resetSelection = () => {
    setPinned(null);
    setSelectedGroup(null);
  };

  const minLikesControl = (
    <label className="app-muted space-y-1">
      <span className="block">Minimum likes per person: {minLikes}</span>
      <input
        type="range"
        min={1}
        max={maxLiked}
        value={minLikes}
        onChange={(event) => {
          setMinLikes(Number(event.target.value));
          resetSelection();
        }}
        className="w-44"
      />
    </label>
  );

  if (graph.nodeIndexes.length < 2) {
    return (
      <div className="space-y-2 text-sm">
        {minLikesControl}
        <p className="app-muted">Fewer than two people meet the minimum likes. Lower it to see the graph.</p>
      </div>
    );
  }

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
                  resetSelection();
                }}
                className={`app-button rounded-md px-3 py-1 text-sm ${mode === option.value ? "app-button-primary" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1">
          <legend className="app-muted mb-1">Layout</legend>
          <div className="flex gap-1" role="radiogroup">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={layoutMode === option.value}
                onClick={() => setLayoutMode(option.value)}
                className={`app-button rounded-md px-3 py-1 text-sm ${layoutMode === option.value ? "app-button-primary" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="app-muted space-y-1">
          <span className="block">Closest matches per person: {neighbors}</span>
          <input
            type="range"
            min={1}
            max={MAX_NEIGHBORS}
            value={neighbors}
            onChange={(event) => {
              setNeighbors(Number(event.target.value));
              resetSelection();
            }}
            className="w-44"
          />
        </label>
        {minLikesControl}
        <p className="app-muted text-xs">
          {graph.nodeIndexes.length.toLocaleString()} of {data.nodes.length.toLocaleString()} participants shown
          {hiddenForLikes > 0 ? ` (${hiddenForLikes} with fewer than ${minLikes} likes hidden)` : ""} ·{" "}
          {graph.edges.length.toLocaleString()} lines
        </p>
      </div>
      <p className="app-muted text-xs">
        {modeOption?.description}
        {layoutMode === "grouped"
          ? " By group: each group is pulled to its own spot, so lines between groups are long and faint."
          : " Free: positions come only from the lines, so groups can overlap."}
      </p>

      <div className="app-table-shell overflow-hidden rounded-xl">
        <svg
          viewBox={layout.viewBox}
          className="block h-[36rem] w-full"
          role="img"
          aria-label="Network of participants linked to their closest matches by shared likes, colored by group. The group summaries and top pairs table below list the same data."
          onClick={resetSelection}
        >
          <g>
            {layout.links.map((link) => {
              const source = link.source as LayoutNode;
              const target = link.target as LayoutNode;
              const incident = focus !== null && (source.index === focus || target.index === focus);
              const inSelectedGroup =
                selectedGroup !== null &&
                graph.groupOf.get(source.index) === selectedGroup &&
                graph.groupOf.get(target.index) === selectedGroup;
              const emphasized = selectedGroup !== null ? inSelectedGroup : incident;
              const anySelection = focus !== null || selectedGroup !== null;
              return (
                <line
                  key={`${source.index}-${target.index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  style={{ stroke: emphasized ? "var(--foreground)" : "var(--muted)" }}
                  strokeOpacity={
                    anySelection
                      ? emphasized
                        ? 0.75
                        : 0.05
                      : layoutMode === "grouped" &&
                          graph.groupOf.get(source.index) !== graph.groupOf.get(target.index)
                        ? 0.08
                        : 0.28
                  }
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
              const group = graph.groupOf.get(node.index);
              const r = radiusOf(node.index);
              const isFocus = focus === node.index;
              return (
                <g
                  key={node.index}
                  transform={`translate(${node.x ?? 0} ${node.y ?? 0})`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(node.index)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedGroup(null);
                    setPinned((current) => (current === node.index ? null : node.index));
                  }}
                >
                  {/* Larger invisible hit target than the dot itself. */}
                  <circle r={r + 6} fill="transparent" />
                  <circle
                    r={r}
                    style={{
                      fill: groupColor(group),
                      stroke: isFocus ? "var(--foreground)" : "var(--background)",
                    }}
                    fillOpacity={isDimmed(node.index) ? 0.25 : 1}
                    strokeWidth={isFocus ? 2.5 : 1.5}
                  />
                  <title>{`${info.label} (${groupLabel(group)}): liked ${info.liked} of ${info.seen} seen`}</title>
                </g>
              );
            })}
          </g>
          <g aria-hidden="true">
            {layout.labels.map((label) => (
              <text
                key={label.group}
                x={label.x}
                y={label.y}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                style={{
                  fill: "var(--foreground)",
                  opacity: selectedGroup === null || selectedGroup === label.group ? 1 : 0.3,
                  paintOrder: "stroke",
                  stroke: "var(--background)",
                  strokeWidth: 3,
                }}
                className="pointer-events-none select-none"
              >
                <tspan x={label.x}>Group {label.group + 1}</tspan>
                {groups.styleByGroup.get(label.group) ? (
                  <tspan x={label.x} dy={13} fontSize={10} fontWeight={500}>
                    {truncate(groups.styleByGroup.get(label.group) as string, MAX_LABEL_STYLE_CHARS)}
                  </tspan>
                ) : null}
              </text>
            ))}
          </g>
        </svg>
      </div>

      <p className="min-h-5 text-sm" aria-live="polite">
        {focusNode && focus !== null ? (
          <>
            <strong>{focusNode.label}</strong> ({groupLabel(graph.groupOf.get(focus))}): liked {focusNode.liked} of{" "}
            {focusNode.seen} captions seen.
            {focusPartners.length > 0 ? (
              <>
                {" "}
                Closest matches:{" "}
                {focusPartners
                  .map((pair) => `${data.nodes[pair.a === focus ? pair.b : pair.a]?.label ?? "?"} (${describePair(pair)})`)
                  .join(", ")}
                .
              </>
            ) : null}
            {pinned === focus ? <span className="app-muted"> Click the dot again or the background to unpin.</span> : null}
          </>
        ) : (
          <span className="app-muted">
            Hover over a participant for details; click to pin. Click a group below to highlight it.
          </span>
        )}
      </p>

      <section className="space-y-2">
        <h3 className="text-base font-semibold">Groups</h3>
        <p className="app-muted text-xs">
          Found automatically from the lines above (Louvain clustering), largest first. The eight largest get their own color; any
          beyond that are gray. Favorites are captions liked by at least {formatPercent(MIN_GROUP_LIKE_SHARE)} of
          the group, ranked by how much more the group liked them than everyone shown (group % vs everyone %).
          Each group is named after the humor style it over-likes most, if one stands out by at least{" "}
          {Math.round(MIN_STYLE_LIFT_FOR_NAME * 100)} pts. Strength compares average similarity inside the group with
          similarity to everyone else (a random set of people scores about 1×): tight is {TIGHT_RATIO}× or more, loose
          is under {LOOSE_RATIO}×, where the grouping may be mostly chance.
        </p>
        <ul className="grid gap-2 md:grid-cols-2">
          {groups.summaries.map((summary) => {
            const isSelected = selectedGroup === summary.group;
            return (
              <li key={summary.group}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setPinned(null);
                    setSelectedGroup(isSelected ? null : summary.group);
                  }}
                  className={`app-card w-full space-y-1 rounded-lg p-3 text-left text-sm ${
                    isSelected ? "outline outline-2 outline-[var(--foreground)]" : ""
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: groupColor(summary.group) }}
                    />
                    {groupLabel(summary.group)}
                  </span>
                  <span className="app-muted block text-xs">
                    {summary.people.length} people · {summary.averageLikes.toFixed(1)} likes on average
                  </span>
                  {summary.style ? (
                    <span className="block">
                      Leans toward <strong>{summary.style.name}</strong>{" "}
                      <span className="app-muted">({formatPoints(summary.style.lift)} share of their likes)</span>
                    </span>
                  ) : (
                    <span className="app-muted block">No humor style stands out for this group.</span>
                  )}
                  <span
                    className={`block text-xs ${summary.strength.level === "loose" ? "text-amber-700 dark:text-amber-400" : "app-muted"}`}
                  >
                    <strong className="font-semibold">{STRENGTH_TEXT[summary.strength.level]}</strong>
                    {summary.strength.ratio !== null
                      ? ` · members are ${summary.strength.ratio.toFixed(1)}× as alike with each other as with everyone else (${formatPercent(summary.strength.within)} vs ${formatPercent(summary.strength.across)} average similarity)`
                      : " · no overlap with anyone outside the group"}
                  </span>
                  {summary.favorites.length > 0 ? (
                    <span className="grid grid-cols-2 items-start gap-2 pt-1 sm:grid-cols-3">
                      {summary.favorites.map((favorite) => (
                        <span key={favorite.caption.caption_id} className="block min-w-0">
                          {favorite.caption.image_url ? (
                            <span className="flex h-28 items-center justify-center rounded-md bg-white/40 p-1 dark:bg-slate-950/20">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={favorite.caption.image_url}
                                alt={favorite.caption.image_description ?? favorite.caption.text}
                                loading="lazy"
                                decoding="async"
                                className="max-h-full max-w-full object-contain"
                              />
                            </span>
                          ) : null}
                          <span className="block text-xs leading-snug break-words">{favorite.caption.text}</span>
                          <span className="app-muted mt-0.5 block text-xs tabular-nums">
                            {formatPercent(favorite.group)} of group vs {formatPercent(favorite.overall)} of everyone
                          </span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="app-muted block">No caption stands out for this group.</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {groups.inSmallGroups > 0 ? (
          <p className="app-muted text-xs">
            {groups.inSmallGroups} people are in groups smaller than {MIN_GROUP_SIZE} and aren&apos;t summarized.
          </p>
        ) : null}
      </section>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">
          Top {TOP_PAIRS} pairs by {mode === "shared" ? "shared likes" : "similarity"}
        </summary>
        <div className="app-table-shell mt-2 overflow-x-auto rounded-xl">
          <table className="app-table w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 font-semibold">Participant</th>
                <th className="px-3 py-2 font-semibold">Groups</th>
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
                  <td className="app-muted px-3 py-2 text-xs">
                    {groupLabel(graph.groupOf.get(pair.a))} / {groupLabel(graph.groupOf.get(pair.b))}
                  </td>
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
