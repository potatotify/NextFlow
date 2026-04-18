import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { create } from "zustand";

import type { NodeData } from "@/types/nodes";

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_UNDO_HISTORY = 50;

interface WorkflowStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodes: string[];
  workflowId: string | null;
  workflowName: string;
  isSaving: boolean;
  past: Snapshot[];
  future: Snapshot[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setSelectedNodes: (selectedNodeIds: string[]) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  removeNodes: (nodeIds: string[]) => void;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  setWorkflowId: (id: string | null) => void;
  setWorkflowName: (name: string) => void;
  setIsSaving: (value: boolean) => void;
  undo: () => void;
  redo: () => void;
}

const createSnapshot = (nodes: Node[], edges: Edge[]): Snapshot => ({
  nodes: structuredClone(nodes),
  edges: structuredClone(edges),
});

const pushSnapshot = (past: Snapshot[], snapshot: Snapshot): Snapshot[] => {
  const next = [...past, snapshot];
  if (next.length <= MAX_UNDO_HISTORY) {
    return next;
  }

  return next.slice(next.length - MAX_UNDO_HISTORY);
};

const shouldCaptureNodeChangeSnapshot = (changes: NodeChange[]): boolean => {
  if (changes.length === 0) return false;

  return changes.some((change) => {
    if (change.type !== "position") return true;
    return change.dragging === false;
  });
};

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodes: [],
  workflowId: null,
  workflowName: "Untitled",
  isSaving: false,
  past: [],
  future: [],
  setNodes: (nodes) => set(() => ({ nodes })),
  setEdges: (edges) => set(() => ({ edges })),
  onNodesChange: (changes) => {
    const { nodes, edges, past, future } = get();
    const shouldCaptureSnapshot = shouldCaptureNodeChangeSnapshot(changes);
    set(() => ({
      nodes: applyNodeChanges(changes, nodes),
      past: shouldCaptureSnapshot ? pushSnapshot(past, createSnapshot(nodes, edges)) : past,
      future: shouldCaptureSnapshot ? [] : future,
    }));
  },
  onEdgesChange: (changes) => {
    const { nodes, edges, past } = get();
    set(() => ({
      edges: applyEdgeChanges(changes, edges),
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  onConnect: (connection) => {
    const { nodes, edges, past } = get();
    set(() => ({
      edges: addEdge({ ...connection, type: "custom", animated: false }, edges),
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  setSelectedNodes: (selectedNodeIds) => set(() => ({ selectedNodes: selectedNodeIds })),
  addNode: (node) => {
    const { nodes, edges, past } = get();
    set(() => ({
      nodes: [...nodes, node],
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  removeNode: (nodeId) => {
    const { nodes, edges, past } = get();
    set(() => ({
      nodes: nodes.filter((node) => node.id !== nodeId),
      edges: edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      selectedNodes: [],
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  removeNodes: (nodeIds) => {
    const nodeIdSet = new Set(nodeIds);
    const { nodes, edges, past } = get();
    set(() => ({
      nodes: nodes.filter((node) => !nodeIdSet.has(node.id)),
      edges: edges.filter((edge) => !nodeIdSet.has(edge.source) && !nodeIdSet.has(edge.target)),
      selectedNodes: [],
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  updateNodeData: (nodeId, data) => {
    const { nodes, edges, past } = get();
    set(() => ({
      nodes: nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...(node.data as unknown as NodeData), ...data } } : node,
      ),
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: [],
    }));
  },
  setWorkflowId: (id) => set(() => ({ workflowId: id })),
  setWorkflowName: (name) => set(() => ({ workflowName: name })),
  setIsSaving: (value) => set(() => ({ isSaving: value })),
  undo: () => {
    const { nodes, edges, past, future } = get();
    const previous = past[past.length - 1];
    if (!previous) return;

    set(() => ({
      nodes: previous.nodes,
      edges: previous.edges,
      past: past.slice(0, -1),
      future: [createSnapshot(nodes, edges), ...future],
      selectedNodes: [],
    }));
  },
  redo: () => {
    const { nodes, edges, past, future } = get();
    const next = future[0];
    if (!next) return;

    set(() => ({
      nodes: next.nodes,
      edges: next.edges,
      past: pushSnapshot(past, createSnapshot(nodes, edges)),
      future: future.slice(1),
      selectedNodes: [],
    }));
  },
}));
