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

import {
  HumorTagHeatmap,
  type HeatmapCell,
  type HeatmapMeme,
  type HeatmapTag,
} from "@/components/humor-tag-heatmap";
import { louvain } from "@/utils/like-graph/louvain";

export type LikeGraphData = {
  /** Participants who liked at least one caption. */
  nodes: { label: string; liked: number; seen: number; liked_captions: number[]; seen_captions: number[] }[];
  /** [node index, node index, captions both liked]. */
  edges: [number, number, number][];
  /** Captions seen by at least one participant; `liked_captions` and `seen_captions` index into this. */
  captions: {
    caption_id: string;
    text: string;
    image_url: string | null;
    image_description: string | null;
    style: string | null;
    style_tag_id: number | null;
    subject_tag_id: number | null;
  }[];
};

/** Row and column order of the study heatmap, reused for the per-group heatmap. */
export type LikeGraphHeatmapAxes = { humorStyles: HeatmapTag[]; subjects: HeatmapTag[] };

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
/** A group's rate for a caption is only compared when at least this many members saw it. */
const MIN_VIEWERS_TO_COMPARE = 5;
const DISAGREEMENT_COUNT = 5;
/** Only list captions where the most and least enthusiastic groups differ by at least this much. */
const MIN_DISAGREEMENT_GAP = 0.3;
/** Group heatmap cells seen by fewer members than this are drawn dashed and left out of the color scale. */
const GROUP_HEATMAP_MIN_VIEWERS = 5;
/**
 * Fit = average similarity to the rest of one's group ÷ to the next-closest group. Groups come from each
 * person's few closest matches, so someone can be closer on average to another group. On study 122 at the
 * defaults these cutoffs split people about 75 fit / 48 between / 47 closer to another group.
 */
const FIT_RATIO = 1.1;
const BETWEEN_RATIO = 0.9;
const PERSON_MATCHES = 3;
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

/** Likers and viewers of one caption among a set of people. */
const countAmong = (members: Set<number>, likers: number[], viewers: number[]) => ({
  likers: likers.filter((person) => members.has(person)).length,
  viewers: viewers.filter((person) => members.has(person)).length,
});

export function LikeOverlapGraph({
  data,
  heatmapAxes = null,
}: {
  data: LikeGraphData;
  heatmapAxes?: LikeGraphHeatmapAxes | null;
}) {
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

  /** For each caption, who liked it and who saw it (node indexes). */
  const audience = useMemo(() => {
    const likers: number[][] = data.captions.map(() => []);
    const viewers: number[][] = data.captions.map(() => []);
    data.nodes.forEach((node, person) => {
      for (const caption of node.liked_captions) likers[caption]?.push(person);
      for (const caption of node.seen_captions) viewers[caption]?.push(person);
    });
    return { likers, viewers };
  }, [data.nodes, data.captions]);

  const similarityBetween = useMemo(() => {
    const lookup = new Map<number, number>();
    const size = data.nodes.length;
    for (const pair of pairs) lookup.set(Math.min(pair.a, pair.b) * size + Math.max(pair.a, pair.b), pair.similarity);
    return (a: number, b: number) => lookup.get(Math.min(a, b) * size + Math.max(a, b)) ?? 0;
  }, [pairs, data.nodes.length]);

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
    return { summaries, inSmallGroups, styleByGroup, members };
  }, [graph, pairs, data.nodes, data.captions]);

  /** Captions the summarized groups disagree on most: highest vs lowest like rate among members who saw it. */
  const disagreements = useMemo(() => {
    const memberSets = groups.summaries.map((summary) => ({ group: summary.group, members: new Set(summary.people) }));
    if (memberSets.length < 2) return [];
    const everyone = new Set(graph.nodeIndexes);
    return data.captions
      .flatMap((caption, index) => {
        const likers = audience.likers[index] ?? [];
        const viewers = audience.viewers[index] ?? [];
        const rates = memberSets
          .map(({ group, members }) => ({ group, ...countAmong(members, likers, viewers) }))
          .filter((row) => row.viewers >= MIN_VIEWERS_TO_COMPARE)
          .map((row) => ({ ...row, rate: row.likers / row.viewers }));
        if (rates.length < 2) return [];
        rates.sort((x, y) => y.rate - x.rate || y.viewers - x.viewers);
        const high = rates[0] as (typeof rates)[number];
        const low = rates[rates.length - 1] as (typeof rates)[number];
        const overall = countAmong(everyone, likers, viewers);
        return [{ caption, high, low, gap: high.rate - low.rate, overall }];
      })
      .filter((row) => row.gap >= MIN_DISAGREEMENT_GAP)
      .sort((x, y) => y.gap - x.gap)
      .slice(0, DISAGREEMENT_COUNT);
  }, [groups.summaries, graph.nodeIndexes, data.captions, audience]);

  /** The study heatmap recomputed from the selected group's views and likes only. */
  const groupHeatmap = useMemo(() => {
    if (!heatmapAxes || selectedGroup === null) return null;
    const members = new Set(groups.members.get(selectedGroup) ?? []);
    const cells = new Map<string, HeatmapCell>();
    const memesByCell: Record<string, HeatmapMeme[]> = {};
    let hits = 0;
    let sample = 0;
    data.captions.forEach((caption, index) => {
      if (caption.style_tag_id === null || caption.subject_tag_id === null) return;
      const counts = countAmong(members, audience.likers[index] ?? [], audience.viewers[index] ?? []);
      if (counts.viewers === 0) return;
      const key = `${caption.style_tag_id}|${caption.subject_tag_id}`;
      const cell = cells.get(key) ?? {
        humor_style_tag_id: caption.style_tag_id,
        subject_tag_id: caption.subject_tag_id,
        captions: 0,
        sample: 0,
        hits: 0,
      };
      cell.captions += 1;
      cell.sample += counts.viewers;
      cell.hits += counts.likers;
      cells.set(key, cell);
      (memesByCell[key] ??= []).push({
        id: `${caption.caption_id}-${index}`,
        caption_text: caption.text,
        image_url: caption.image_url,
        image_description: caption.image_description,
        sample: counts.viewers,
        hits: counts.likers,
      });
      hits += counts.likers;
      sample += counts.viewers;
    });
    const usedStyles = new Set([...cells.values()].map((cell) => cell.humor_style_tag_id));
    const usedSubjects = new Set([...cells.values()].map((cell) => cell.subject_tag_id));
    return {
      humorStyles: heatmapAxes.humorStyles.filter((tag) => usedStyles.has(tag.id)),
      subjects: heatmapAxes.subjects.filter((tag) => usedSubjects.has(tag.id)),
      cells: [...cells.values()],
      memesByCell,
      rate: sample > 0 ? hits / sample : 0,
    };
  }, [heatmapAxes, selectedGroup, groups.members, data.captions, audience]);

  /** Details for the clicked participant: closest matches, how well they fit their group, and their main style. */
  const person = useMemo(() => {
    if (pinned === null || !graph.groupOf.has(pinned)) return null;
    const own = graph.groupOf.get(pinned) as number;
    const averageTo = (people: number[]) => {
      const others = people.filter((other) => other !== pinned);
      return others.length > 0 ? others.reduce((sum, other) => sum + similarityBetween(pinned, other), 0) / others.length : 0;
    };
    const ownAverage = averageTo(groups.members.get(own) ?? []);
    const nextClosest = [...groups.members.entries()]
      .filter(([group, people]) => group !== own && people.length >= MIN_GROUP_SIZE)
      .map(([group, people]) => ({ group, average: averageTo(people) }))
      .sort((x, y) => y.average - x.average)[0];
    const styleCounts = new Map<string, number>();
    let tagged = 0;
    for (const caption of data.nodes[pinned]?.liked_captions ?? []) {
      const style = data.captions[caption]?.style;
      if (!style) continue;
      styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
      tagged += 1;
    }
    const topStyle = [...styleCounts.entries()].sort((x, y) => y[1] - x[1])[0];
    return {
      index: pinned,
      own,
      ownAverage,
      nextClosest: nextClosest ?? null,
      fit:
        !nextClosest || ownAverage >= FIT_RATIO * nextClosest.average
          ? ("fits" as const)
          : ownAverage >= BETWEEN_RATIO * nextClosest.average
            ? ("between" as const)
            : ("closer-elsewhere" as const),
      topStyle: topStyle && tagged > 0 ? { name: topStyle[0], share: topStyle[1] / tagged } : null,
      matches: (graph.partners.get(pinned) ?? []).slice(0, PERSON_MATCHES).map((pair) => ({
        other: pair.a === pinned ? pair.b : pair.a,
        pair,
      })),
    };
  }, [pinned, graph, groups.members, similarityBetween, data.nodes, data.captions]);

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
  const hoverNode = hovered === null ? null : data.nodes[hovered];
  const hoverPartners = hovered === null ? [] : (graph.partners.get(hovered) ?? []).slice(0, TOP_PARTNERS);
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
        {hoverNode && hovered !== null ? (
          <>
            <strong>{hoverNode.label}</strong> ({groupLabel(graph.groupOf.get(hovered))}): liked {hoverNode.liked} of{" "}
            {hoverNode.seen} captions seen.
            {hoverPartners.length > 0 ? (
              <>
                {" "}
                Closest matches:{" "}
                {hoverPartners
                  .map((pair) => `${data.nodes[pair.a === hovered ? pair.b : pair.a]?.label ?? "?"} (${describePair(pair)})`)
                  .join(", ")}
                .
              </>
            ) : null}
          </>
        ) : (
          <span className="app-muted">
            Hover over a participant for a quick look; click for details. Click a group below to highlight it and see
            its heatmap.
          </span>
        )}
      </p>

      {person ? (
        <section className="app-card space-y-2 rounded-xl p-4 text-sm" aria-label={`Details for ${data.nodes[person.index]?.label}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">{data.nodes[person.index]?.label}</h3>
              <p className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: groupColor(person.own) }}
                />
                {groupLabel(person.own)}
                <span className="app-muted">
                  · liked {data.nodes[person.index]?.liked} of {data.nodes[person.index]?.seen} captions seen
                </span>
              </p>
            </div>
            <button type="button" onClick={() => setPinned(null)} className="app-button rounded-md px-3 py-1 text-sm">
              Close
            </button>
          </div>
          <p>
            {person.nextClosest === null ? (
              <>Average similarity to the rest of the group: {formatPercent(person.ownAverage)}.</>
            ) : person.fit === "fits" ? (
              <>
                <strong>Fits the group:</strong> {formatPercent(person.ownAverage)} average similarity to the rest of{" "}
                {groupLabel(person.own)}, vs {formatPercent(person.nextClosest.average)} to the next closest,{" "}
                {groupLabel(person.nextClosest.group)}.
              </>
            ) : person.fit === "between" ? (
              <>
                <strong>Between groups:</strong> about as close to {groupLabel(person.nextClosest.group)} (
                {formatPercent(person.nextClosest.average)} average similarity) as to the rest of their own group (
                {formatPercent(person.ownAverage)}).
              </>
            ) : (
              <>
                <strong>Closer on average to {groupLabel(person.nextClosest.group)}</strong> (
                {formatPercent(person.nextClosest.average)} vs {formatPercent(person.ownAverage)} with their own group).
                They were placed by their few closest matches, which sit in {groupLabel(person.own)}.
              </>
            )}
            {person.topStyle ? (
              <>
                {" "}
                Most of their likes are <strong>{person.topStyle.name}</strong> ({formatPercent(person.topStyle.share)}
                ).
              </>
            ) : null}
          </p>
          {person.matches.length > 0 ? (
            <div className="space-y-1">
              <p className="app-muted text-xs">Closest matches (click to switch):</p>
              <ul className="flex flex-wrap gap-2">
                {person.matches.map(({ other, pair }) => (
                  <li key={other}>
                    <button
                      type="button"
                      onClick={() => setPinned(other)}
                      className="app-button flex items-center gap-2 rounded-md px-3 py-1 text-left text-xs"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: groupColor(graph.groupOf.get(other)) }}
                      />
                      <span>
                        <span className="font-medium">{data.nodes[other]?.label}</span>{" "}
                        <span className="app-muted">
                          {groupLabel(graph.groupOf.get(other))} · {describePair(pair)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

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

      {groupHeatmap && selectedGroup !== null ? (
        <section className="space-y-2" aria-label={`Heatmap for ${groupLabel(selectedGroup)}`}>
          <h3 className="text-base font-semibold">What {groupLabel(selectedGroup)} likes, by humor style × subject</h3>
          <p className="app-muted text-xs">
            The study heatmap above, using only this group&apos;s {groups.members.get(selectedGroup)?.length ?? 0}{" "}
            members: rate = members who liked ÷ members who saw. Compared with the group&apos;s own average; cells seen
            by fewer than {GROUP_HEATMAP_MIN_VIEWERS} members are dashed.
          </p>
          <HumorTagHeatmap
            key={selectedGroup}
            humorStyles={groupHeatmap.humorStyles}
            subjects={groupHeatmap.subjects}
            cells={groupHeatmap.cells}
            metricLabel="Like rate"
            sampleLabel="members who saw"
            hitLabel="liked"
            studyRate={groupHeatmap.rate}
            baselineLabel="group"
            minSample={GROUP_HEATMAP_MIN_VIEWERS}
            memesByCell={groupHeatmap.memesByCell}
          />
        </section>
      ) : null}

      {disagreements.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-base font-semibold">Where groups disagree</h3>
          <p className="app-muted text-xs">
            Captions with the biggest gap between the group that liked them most and the group that liked them least,
            among members who saw them (at least {MIN_VIEWERS_TO_COMPARE} per group). Some gap is expected, since groups
            are formed from likes.
          </p>
          <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {disagreements.map(({ caption, high, low, overall }) => (
              <li key={caption.caption_id} className="app-card overflow-hidden rounded-xl">
                {caption.image_url ? (
                  <div className="flex h-44 items-center justify-center bg-white/40 p-2 dark:bg-slate-950/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={caption.image_url}
                      alt={caption.image_description ?? caption.text}
                      loading="lazy"
                      decoding="async"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="space-y-1 p-3 text-sm">
                  <p className="font-medium leading-snug break-words">{caption.text}</p>
                  {[high, low].map((row) => (
                    <p key={row.group} className="flex items-center gap-2 text-xs tabular-nums">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: groupColor(row.group) }}
                      />
                      <span>
                        <strong>{formatPercent(row.rate)}</strong> of {groupLabel(row.group)}{" "}
                        <span className="app-muted">
                          ({row.likers} of {row.viewers})
                        </span>
                      </span>
                    </p>
                  ))}
                  <p className="app-muted text-xs tabular-nums">
                    Everyone shown: {formatPercent(overall.viewers > 0 ? overall.likers / overall.viewers : 0)} (
                    {overall.likers} of {overall.viewers})
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
