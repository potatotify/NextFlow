import type { Edge, Node } from "@xyflow/react";

const buildAdjacency = (nodes: Node[], edges: Edge[]) => {
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;

    const current = adjacency.get(edge.source) ?? [];
    adjacency.set(edge.source, [...current, edge.target]);
  }

  return adjacency;
};

export const detectCycle = (nodes: Node[], edges: Edge[]): boolean => {
  const adjacency = buildAdjacency(nodes, edges);
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const hasCycle = (nodeId: string): boolean => {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    for (const neighbor of neighbors) {
      if (hasCycle(neighbor)) return true;
    }

    inStack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    if (hasCycle(node.id)) return true;
  }

  return false;
};
