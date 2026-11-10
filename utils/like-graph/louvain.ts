/**
 * Louvain community detection (modularity maximization) on an undirected,
 * weighted graph. Deterministic: nodes are visited in index order.
 *
 * @param nodeCount number of nodes, indexed 0..nodeCount-1
 * @param edges [a, b, weight] with a !== b; duplicates are summed
 * @returns community id per node, renumbered 0..k-1 by descending size
 */
export const louvain = (nodeCount: number, edges: [number, number, number][]): number[] => {
  // Adjacency per node; a self entry holds 2× the internal weight so degree = sum of entries.
  let adjacency: Map<number, number>[] = Array.from({ length: nodeCount }, () => new Map());
  for (const [a, b, weight] of edges) {
    if (a === b || weight <= 0) continue;
    adjacency[a]?.set(b, (adjacency[a]?.get(b) ?? 0) + weight);
    adjacency[b]?.set(a, (adjacency[b]?.get(a) ?? 0) + weight);
  }

  // membership[original node] = node in the current (aggregated) graph
  let membership = Array.from({ length: nodeCount }, (_, index) => index);

  for (let level = 0; level < 20; level += 1) {
    const size = adjacency.length;
    const degree = adjacency.map((neighbors) => [...neighbors.values()].reduce((sum, weight) => sum + weight, 0));
    const totalWeight = degree.reduce((sum, value) => sum + value, 0);
    if (totalWeight === 0) break;

    const community = Array.from({ length: size }, (_, index) => index);
    const communityDegree = [...degree];
    let movedAny = false;

    for (let pass = 0; pass < 50; pass += 1) {
      let moved = false;
      for (let node = 0; node < size; node += 1) {
        const current = community[node] as number;
        const nodeDegree = degree[node] as number;
        const weightTo = new Map<number, number>();
        for (const [neighbor, weight] of adjacency[node] as Map<number, number>) {
          if (neighbor === node) continue;
          const neighborCommunity = community[neighbor] as number;
          weightTo.set(neighborCommunity, (weightTo.get(neighborCommunity) ?? 0) + weight);
        }

        communityDegree[current] = (communityDegree[current] as number) - nodeDegree;
        const gain = (target: number) =>
          (weightTo.get(target) ?? 0) - ((communityDegree[target] as number) * nodeDegree) / totalWeight;

        let best = current;
        let bestGain = gain(current);
        for (const candidate of weightTo.keys()) {
          const candidateGain = gain(candidate);
          if (candidateGain > bestGain + 1e-12) {
            best = candidate;
            bestGain = candidateGain;
          }
        }

        communityDegree[best] = (communityDegree[best] as number) + nodeDegree;
        if (best !== current) {
          community[node] = best;
          moved = true;
          movedAny = true;
        }
      }
      if (!moved) break;
    }

    if (!movedAny) break;

    // Renumber communities and fold the graph so each community becomes one node.
    const renumber = new Map<number, number>();
    for (const value of community) if (!renumber.has(value)) renumber.set(value, renumber.size);
    const folded: Map<number, number>[] = Array.from({ length: renumber.size }, () => new Map());
    adjacency.forEach((neighbors, node) => {
      const from = renumber.get(community[node] as number) as number;
      for (const [neighbor, weight] of neighbors) {
        const to = renumber.get(community[neighbor] as number) as number;
        folded[from]?.set(to, (folded[from]?.get(to) ?? 0) + weight);
      }
    });
    membership = membership.map((node) => renumber.get(community[node] as number) as number);
    adjacency = folded;
  }

  // Renumber by descending community size (ties by first member) so ids are stable and meaningful.
  const sizes = new Map<number, number>();
  for (const value of membership) sizes.set(value, (sizes.get(value) ?? 0) + 1);
  const firstSeen = new Map<number, number>();
  membership.forEach((value, index) => {
    if (!firstSeen.has(value)) firstSeen.set(value, index);
  });
  const order = [...sizes.keys()].sort(
    (a, b) => (sizes.get(b) as number) - (sizes.get(a) as number) || (firstSeen.get(a) as number) - (firstSeen.get(b) as number),
  );
  const rank = new Map(order.map((value, index) => [value, index]));
  return membership.map((value) => rank.get(value) as number);
};
