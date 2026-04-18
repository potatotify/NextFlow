"use client";

import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  PanOnScrollMode,
  useReactFlow,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Command, Hand, Moon, MousePointer2, Play, Plus, Redo2, Scissors, Shapes, Sparkles, Sun, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";

import { CustomEdge } from "@/components/canvas/CustomEdge";
import { CropImageNode } from "@/components/nodes/CropImageNode";
import { ExtractFrameNode } from "@/components/nodes/ExtractFrameNode";
import { LLMNode } from "@/components/nodes/LLMNode";
import { TextNode } from "@/components/nodes/TextNode";
import { UploadImageNode } from "@/components/nodes/UploadImageNode";
import { UploadVideoNode } from "@/components/nodes/UploadVideoNode";
import { sampleWorkflow } from "@/data/sample-workflow";
import { detectCycle } from "@/lib/dag-validator";
import { getSourceDataType, isValidConnection as validateTypeConnection } from "@/lib/type-validators";
import { useToastStore } from "@/store/toast-store";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NextFlowNodeType, NodeData } from "@/types/nodes";

const edgeTypes = {
  custom: CustomEdge,
};

const nodeTypes = {
  cropImageNode: CropImageNode,
  extractFrameNode: ExtractFrameNode,
  llmNode: LLMNode,
  textNode: TextNode,
  uploadImageNode: UploadImageNode,
  uploadVideoNode: UploadVideoNode,
};

const getNodeLabel = (nodeType: NextFlowNodeType): string => {
  const labels: Record<NextFlowNodeType, string> = {
    textNode: "Text Node",
    uploadImageNode: "Upload Image",
    uploadVideoNode: "Upload Video",
    llmNode: "Run Any LLM",
    cropImageNode: "Crop Image",
    extractFrameNode: "Extract Frame",
  };

  return labels[nodeType];
};

interface ExecuteResponse {
  nodeRuns?: Array<{
    nodeId: string;
    status: "SUCCESS" | "FAILED";
    outputs?: Record<string, unknown>;
  }>;
}

const toRunningNode = (node: Node): Node => {
  const data = (node.data ?? {}) as unknown as NodeData;
  return {
    ...node,
    data: {
      ...data,
      status: "running",
    },
  };
};

const toResultNode = (
  node: Node,
  runResult: { status: "SUCCESS" | "FAILED"; outputs?: Record<string, unknown>; error?: string } | undefined,
): Node => {
  if (!runResult) {
    return {
      ...node,
      data: {
        ...((node.data ?? {}) as unknown as NodeData),
        status: "idle",
      },
    };
  }

  const previousData = (node.data ?? {}) as unknown as NodeData;
  const nextData: NodeData = {
    ...previousData,
    status: runResult.status === "SUCCESS" ? "success" : "error",
  };

  if (previousData.nodeType === "llmNode" && typeof runResult.outputs?.output === "string") {
    nextData.llmResult = runResult.outputs.output;
    nextData.llmError = undefined;
  }

  if (previousData.nodeType === "llmNode" && runResult.status === "FAILED") {
    nextData.llmResult = "";
    nextData.llmError = runResult.error ?? "LLM node requires a prompt before execution.";
  }

  if (previousData.nodeType === "cropImageNode" && typeof runResult.outputs?.output === "string") {
    nextData.croppedImageUrl = runResult.outputs.output;
  }

  if (previousData.nodeType === "extractFrameNode" && typeof runResult.outputs?.output === "string") {
    nextData.extractedFrameUrl = runResult.outputs.output;
  }

  return {
    ...node,
    data: nextData as unknown as Record<string, unknown>,
  };
};

interface NodeContextMenuState {
  nodeId: string;
  x: number;
  y: number;
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ToolbarMode = "pointer" | "draw-select" | "pan" | "cut";
type AppTheme = "dark" | "light";

const THEME_STORAGE_KEY = "nextflow-theme";

const TOOLBAR_NODE_TYPES: NextFlowNodeType[] = [
  "textNode",
  "uploadImageNode",
  "uploadVideoNode",
  "llmNode",
  "cropImageNode",
  "extractFrameNode",
];

const rectsIntersect = (
  first: SelectionRect,
  second: SelectionRect,
): boolean => {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
};

const segmentIntersects = (
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean => {
  const orientation = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): number => {
    const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(value) < 0.0001) return 0;
    return value > 0 ? 1 : 2;
  };

  const onSegment = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }): boolean => {
    return (
      q.x <= Math.max(p.x, r.x) &&
      q.x >= Math.min(p.x, r.x) &&
      q.y <= Math.max(p.y, r.y) &&
      q.y >= Math.min(p.y, r.y)
    );
  };

  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
};

const toRect = (start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const createNodePayload = (nodeType: NextFlowNodeType, position: { x: number; y: number }): Node => {
  return {
    id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type:
      nodeType === "textNode" ||
      nodeType === "uploadImageNode" ||
      nodeType === "uploadVideoNode" ||
      nodeType === "llmNode" ||
      nodeType === "cropImageNode" ||
      nodeType === "extractFrameNode"
        ? nodeType
        : "default",
    position,
    data: {
      label: getNodeLabel(nodeType),
      nodeType,
      status: "idle",
      text: nodeType === "textNode" ? "" : undefined,
      imageUrl: nodeType === "uploadImageNode" ? "" : undefined,
      imageName: nodeType === "uploadImageNode" ? "" : undefined,
      videoUrl: nodeType === "uploadVideoNode" ? "" : undefined,
      videoName: nodeType === "uploadVideoNode" ? "" : undefined,
      llmModel: nodeType === "llmNode" ? "gemini-2.5-flash" : undefined,
      systemPrompt: nodeType === "llmNode" ? "" : undefined,
      userMessage: nodeType === "llmNode" ? "" : undefined,
      llmResult: nodeType === "llmNode" ? "" : undefined,
      cropXPercent: nodeType === "cropImageNode" ? "0" : undefined,
      cropYPercent: nodeType === "cropImageNode" ? "0" : undefined,
      cropWidthPercent: nodeType === "cropImageNode" ? "100" : undefined,
      cropHeightPercent: nodeType === "cropImageNode" ? "100" : undefined,
      frameTimestamp: nodeType === "extractFrameNode" ? "0" : undefined,
    },
  };
};

const WorkflowCanvasInternal: FC = () => {
  const reactFlow = useReactFlow();
  const [message, setMessage] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<NodeContextMenuState | null>(null);
  const [isNodeRunInFlight, setIsNodeRunInFlight] = useState(false);
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("draw-select");
  const [isNodeMenuOpen, setIsNodeMenuOpen] = useState(false);
  const [isPresetsOpen, setIsPresetsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isNodeHovering, setIsNodeHovering] = useState(false);
  const [theme, setTheme] = useState<AppTheme>("dark");
  const [isConnectingNodes, setIsConnectingNodes] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [nodeSearchText, setNodeSearchText] = useState("");
  const [activeSelectionRect, setActiveSelectionRect] = useState<SelectionRect | null>(null);
  const [committedSelectionRect, setCommittedSelectionRect] = useState<SelectionRect | null>(null);
  const [cutPathPoints, setCutPathPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [cutCursorPoint, setCutCursorPoint] = useState<{ x: number; y: number } | null>(null);
  const [cutCursorAngle, setCutCursorAngle] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastCutCursorPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastCutMoveTimestampRef = useRef<number>(0);
  const smoothedCutAngleRef = useRef(0);
  const isDraggingRef = useRef(false);
  const nodeSpawnCounterRef = useRef(0);
  const selectionRectFrameRef = useRef<number | null>(null);
  const pendingSelectionRectRef = useRef<SelectionRect | null>(null);

  const {
    nodes,
    edges,
    workflowId,
    selectedNodes,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    addNode,
    removeNodes,
    setSelectedNodes,
    undo,
    redo,
    past,
    future,
    setWorkflowId,
    setWorkflowName,
  } = useWorkflowStore();
  const addToast = useToastStore((state) => state.addToast);
  const isNodeInteractionActive = nodes.length > 0 && (isNodeHovering || isConnectingNodes || isDraggingNode);

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      if (!connection.source || !connection.target) return false;

      const sourceNode = nodes.find((node) => node.id === connection.source);
      if (!sourceNode || !connection.targetHandle) return false;

      const sourceNodeData = sourceNode.data as unknown as NodeData | undefined;
      const sourceNodeType = (sourceNodeData?.nodeType ?? sourceNode.type ?? "") as string;
      const sourceType = getSourceDataType(sourceNodeType, connection.sourceHandle);
      if (!sourceType) return false;

      return validateTypeConnection(sourceType, connection.targetHandle);
    },
    [nodes],
  );

  const onConnectSafe = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((node) => node.id === connection.source);
      if (!sourceNode || !connection.targetHandle) {
        setMessage("Invalid connection.");
        return;
      }

      const sourceNodeData = sourceNode.data as unknown as NodeData | undefined;
      const sourceNodeType = (sourceNodeData?.nodeType ?? sourceNode.type ?? "") as string;
      const sourceType = getSourceDataType(sourceNodeType, connection.sourceHandle);
      const isTypeValid = sourceType ? validateTypeConnection(sourceType, connection.targetHandle) : false;

      if (!isTypeValid) {
        setMessage("Invalid connection type for these handles.");
        return;
      }

      const nextEdge: Edge = {
        id: `e_${connection.source}_${connection.sourceHandle ?? "output"}_${connection.target}_${connection.targetHandle ?? "input"}`,
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
      };

      const cycleFound = detectCycle(nodes, [...edges, nextEdge]);
      if (cycleFound) {
        setMessage("Circular connections are not allowed in a DAG workflow.");
        return;
      }

      setMessage(null);
      onConnect(connection);
    },
    [edges, nodes, onConnect],
  );

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData("application/nextflow-node-type") as NextFlowNodeType | "";
      if (!nodeType) return;

      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode(
        createNodePayload(nodeType, {
          x: flowPosition.x,
          y: flowPosition.y,
        }),
      );
    },
    [addNode, reactFlow],
  );

  const onSelectionChange = useCallback(
    (selection: OnSelectionChangeParams) => {
      setSelectedNodes(selection.nodes.map((node) => node.id));
      setCommittedSelectionRect(null);
    },
    [setSelectedNodes],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const closePopovers = useCallback(() => {
    setIsNodeMenuOpen(false);
    setIsPresetsOpen(false);
  }, []);

  const scheduleSelectionRectUpdate = useCallback((nextRect: SelectionRect) => {
    pendingSelectionRectRef.current = nextRect;

    if (selectionRectFrameRef.current !== null) {
      return;
    }

    selectionRectFrameRef.current = window.requestAnimationFrame(() => {
      selectionRectFrameRef.current = null;
      const pendingRect = pendingSelectionRectRef.current;
      if (pendingRect) {
        setActiveSelectionRect(pendingRect);
      }
    });
  }, []);

  const stopToolbarEventPropagation = useCallback((event: React.SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const openNodePicker = useCallback(() => {
    setIsNodeMenuOpen(true);
    setIsPresetsOpen(false);
  }, []);

  const isEditableTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest("input, textarea, select, [contenteditable='true']") ||
      target.isContentEditable,
    );
  };

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme: AppTheme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : "dark";

    setTheme(initialTheme);
    document.documentElement.setAttribute("data-theme", initialTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((previousTheme) => {
      const nextTheme: AppTheme = previousTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nextTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      return nextTheme;
    });
  }, []);

  useEffect(() => {
    if (!isNodeInteractionActive) return;
    closePopovers();
    setIsShortcutsOpen(false);
  }, [closePopovers, isNodeInteractionActive]);

  useEffect(() => {
    if (!message) return;

    const timeout = window.setTimeout(() => {
      setMessage(null);
    }, 3500);

    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (nodes.length > 0) return;

    // When the last node is removed while hovering/dragging, React Flow may not emit
    // leave/end events. Clear interaction flags so toolbar buttons remain functional.
    setIsNodeHovering(false);
    setIsConnectingNodes(false);
    setIsDraggingNode(false);
  }, [nodes.length]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const menuWidth = 176;
      const menuHeight = 225;

      const x = Math.min(event.clientX, viewportWidth - menuWidth - 12);
      const y = Math.min(event.clientY, viewportHeight - menuHeight - 12);

      setContextMenu({ nodeId: node.id, x: Math.max(12, x), y: Math.max(12, y) });
    },
    [],
  );

  const runSingleNode = useCallback(async () => {
    if (!contextMenu || isNodeRunInFlight) return;

    const selectedNode = nodes.find((node) => node.id === contextMenu.nodeId);
    if (!selectedNode) return;

    setIsNodeRunInFlight(true);
    setContextMenu(null);
    setNodes(
      nodes.map((node) => (node.id === selectedNode.id ? toRunningNode(node) : node)),
    );

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "SINGLE",
          workflowId,
          nodes: [selectedNode],
          edges: [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute selected node");
      }

      const result = (await response.json()) as ExecuteResponse;
      const runByNodeId = new Map(result.nodeRuns?.map((run) => [run.nodeId, run]));

      const latestNodes = useWorkflowStore.getState().nodes;
      setNodes(
        latestNodes.map((node) =>
          node.id === selectedNode.id ? toResultNode(node, runByNodeId.get(node.id)) : node,
        ),
      );
    } catch {
      const latestNodes = useWorkflowStore.getState().nodes;
      setNodes(
        latestNodes.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                data: {
                  ...((node.data ?? {}) as unknown as NodeData),
                  status: "error",
                },
              }
            : node,
        ),
      );
      setMessage("Could not run selected node.");
    } finally {
      setIsNodeRunInFlight(false);
    }
  }, [contextMenu, isNodeRunInFlight, nodes, setNodes, workflowId]);

  const runSelectedNodes = useCallback(async () => {
    if (isNodeRunInFlight) return;

    const selectedIds = selectedNodes.filter((nodeId) => nodes.some((node) => node.id === nodeId));
    if (selectedIds.length === 0) {
      return;
    }

    const selectedNodeSet = new Set(selectedIds);
    const selectedWorkflowNodes = nodes.filter((node) => selectedNodeSet.has(node.id));
    const selectedWorkflowEdges = edges.filter((edge) => selectedNodeSet.has(edge.source) && selectedNodeSet.has(edge.target));

    setIsNodeRunInFlight(true);
    setMessage(null);

    const latestNodesBeforeRun = useWorkflowStore.getState().nodes;
    setNodes(latestNodesBeforeRun.map((node) => (selectedNodeSet.has(node.id) ? toRunningNode(node) : node)));

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "PARTIAL",
          workflowId,
          nodes: selectedWorkflowNodes,
          edges: selectedWorkflowEdges,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute selected nodes");
      }

      const result = (await response.json()) as ExecuteResponse;
      const runByNodeId = new Map(result.nodeRuns?.map((run) => [run.nodeId, run]));

      const latestNodesAfterRun = useWorkflowStore.getState().nodes;
      setNodes(
        latestNodesAfterRun.map((node) =>
          selectedNodeSet.has(node.id) ? toResultNode(node, runByNodeId.get(node.id)) : node,
        ),
      );
    } catch {
      const latestNodesAfterRun = useWorkflowStore.getState().nodes;
      setNodes(
        latestNodesAfterRun.map((node) =>
          selectedNodeSet.has(node.id)
            ? {
                ...node,
                data: {
                  ...((node.data ?? {}) as unknown as NodeData),
                  status: "error",
                },
              }
            : node,
        ),
      );
      setMessage("Could not run selected nodes.");
    } finally {
      setIsNodeRunInFlight(false);
      // Clear selection after run completes
      setSelectedNodes([]);
      setCommittedSelectionRect(null);
    }
  }, [edges, isNodeRunInFlight, nodes, selectedNodes, setMessage, setNodes, workflowId]);

  const duplicateNode = useCallback(() => {
    if (!contextMenu) return;

    const sourceNode = nodes.find((node) => node.id === contextMenu.nodeId);
    if (!sourceNode) return;

    const copiedData = structuredClone((sourceNode.data ?? {}) as Record<string, unknown>);
    const duplicatedNode: Node = {
      ...sourceNode,
      id: `node_${Date.now()}`,
      position: {
        x: sourceNode.position.x + 40,
        y: sourceNode.position.y + 40,
      },
      selected: false,
      data: copiedData,
    };

    addNode(duplicatedNode);
    setContextMenu(null);
  }, [addNode, contextMenu, nodes]);

  const deleteNodeFromMenu = useCallback(() => {
    if (!contextMenu) return;
    removeNodes([contextMenu.nodeId]);
    setContextMenu(null);
  }, [contextMenu, removeNodes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase();
      const isTyping = isEditableTarget(event.target);

      if (lowerKey === "n" && !isTyping && nodes.length === 0) {
        event.preventDefault();
        openNodePicker();
        return;
      }

      if (!isTyping && (event.key === "Delete" || event.key === "Backspace") && selectedNodes.length > 0) {
        event.preventDefault();
        removeNodes(selectedNodes);
      }

      const ctrlOrMeta = event.ctrlKey || event.metaKey;
      if (ctrlOrMeta && !event.shiftKey && lowerKey === "z") {
        event.preventDefault();
        undo();
      }

      if (ctrlOrMeta && ((event.shiftKey && lowerKey === "z") || lowerKey === "y")) {
        event.preventDefault();
        redo();
      }

      if (event.key === "Escape") {
        setContextMenu(null);
        setActiveSelectionRect(null);
        setCutPathPoints([]);
        isDraggingRef.current = false;
        closePopovers();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePopovers, nodes.length, openNodePicker, redo, removeNodes, selectedNodes, undo]);

  const addNodeFromToolbar = useCallback(
    (nodeType: NextFlowNodeType) => {
      const canvasBounds = canvasRef.current?.getBoundingClientRect();
      if (!canvasBounds) return;

      const spawnOffset = (nodeSpawnCounterRef.current % 5) * 24;
      nodeSpawnCounterRef.current += 1;

      const flowPosition = reactFlow.screenToFlowPosition({
        x: canvasBounds.left + canvasBounds.width / 2 + spawnOffset,
        y: canvasBounds.top + canvasBounds.height / 2 + spawnOffset,
      });

      addNode(createNodePayload(nodeType, flowPosition));
      setIsNodeMenuOpen(false);
      setNodeSearchText("");
    },
    [addNode, reactFlow],
  );

  const applySamplePreset = useCallback(() => {
    setWorkflowId(null);
    setWorkflowName(sampleWorkflow.name);
    setNodes(sampleWorkflow.nodes);
    setEdges(sampleWorkflow.edges);
    setIsPresetsOpen(false);
    addToast({
      type: "success",
      title: "Sample workflow loaded",
      message: `${sampleWorkflow.name} is ready on the canvas.`,
    });
  }, [addToast, setEdges, setNodes, setWorkflowId, setWorkflowName]);

  const onPanePointerDown = useCallback((event: React.MouseEvent<Element>) => {
    if (isNodeInteractionActive) return;
    if (toolbarMode !== "draw-select" && toolbarMode !== "cut") return;
    if (event.button !== 0) return;

    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds) return;

    const point = { x: event.clientX - canvasBounds.left, y: event.clientY - canvasBounds.top };
    isDraggingRef.current = true;

    if (toolbarMode === "draw-select") {
      selectionStartRef.current = point;
      scheduleSelectionRectUpdate({ x: point.x, y: point.y, width: 0, height: 0 });
      setCommittedSelectionRect(null);
    }

    if (toolbarMode === "cut") {
      setCutPathPoints([point]);
      setCutCursorPoint(point);
      setCutCursorAngle(0);
      smoothedCutAngleRef.current = 0;
      lastCutMoveTimestampRef.current = performance.now();
      lastCutCursorPointRef.current = point;
    }

    event.preventDefault();
  }, [isNodeInteractionActive, toolbarMode]);

  const onPanePointerMove = useCallback((event: React.MouseEvent<Element>) => {
    if (isNodeInteractionActive) return;
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    if (!canvasBounds) return;

    const nextPoint = { x: event.clientX - canvasBounds.left, y: event.clientY - canvasBounds.top };

    if (toolbarMode === "cut") {
      const previousPoint = lastCutCursorPointRef.current;
      if (previousPoint) {
        const dx = nextPoint.x - previousPoint.x;
        const dy = nextPoint.y - previousPoint.y;
        const distanceSq = (dx * dx) + (dy * dy);
        const minDistanceSq = isDraggingRef.current ? 6.25 : 16;
        if (distanceSq > minDistanceSq) {
          const now = performance.now();
          const dt = Math.min(50, Math.max(4, now - (lastCutMoveTimestampRef.current || now)));
          lastCutMoveTimestampRef.current = now;

          const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
          const currentAngle = smoothedCutAngleRef.current;
          const shortestDelta = ((((targetAngle - currentAngle) % 360) + 540) % 360) - 180;
          const alpha = 1 - Math.exp(-dt / 44);
          const unclampedStep = shortestDelta * alpha;
          const maxStep = (dt / 16) * 6;
          const clampedStep = Math.max(-maxStep, Math.min(maxStep, unclampedStep));
          const nextAngle = currentAngle + clampedStep;

          smoothedCutAngleRef.current = nextAngle;
          setCutCursorAngle(nextAngle);
          lastCutCursorPointRef.current = nextPoint;
        }
      } else {
        lastCutCursorPointRef.current = nextPoint;
      }
      setCutCursorPoint(nextPoint);
    }

    if (!isDraggingRef.current) return;

    if (toolbarMode === "draw-select") {
      const startPoint = selectionStartRef.current;
      if (!startPoint) return;
      scheduleSelectionRectUpdate(toRect(startPoint, nextPoint));
    }

    if (toolbarMode === "cut") {
      setCutPathPoints((previousPoints) => {
        const lastPoint = previousPoints[previousPoints.length - 1];
        if (!lastPoint) return [nextPoint];

        const deltaX = nextPoint.x - lastPoint.x;
        const deltaY = nextPoint.y - lastPoint.y;
        if ((deltaX * deltaX) + (deltaY * deltaY) < 16) {
          return previousPoints;
        }

        return [...previousPoints, nextPoint];
      });
    }
  }, [isNodeInteractionActive, toolbarMode]);

  const onPanePointerUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const currentRect = pendingSelectionRectRef.current ?? activeSelectionRect;

    if (selectionRectFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionRectFrameRef.current);
      selectionRectFrameRef.current = null;
    }
    if (pendingSelectionRectRef.current) {
      setActiveSelectionRect(pendingSelectionRectRef.current);
    }
    pendingSelectionRectRef.current = null;

    if (toolbarMode === "draw-select") {
      selectionStartRef.current = null;
      setActiveSelectionRect(null);

      if (!currentRect || currentRect.width < 8 || currentRect.height < 8) {
        setCommittedSelectionRect(null);
        setSelectedNodes([]);
        setNodes(nodes.map((node) => ({ ...node, selected: false })));
        return;
      }

      const canvasBounds = canvasRef.current?.getBoundingClientRect();
      const viewport = reactFlow.getViewport();
      const rectStart = canvasBounds
        ? reactFlow.screenToFlowPosition({
            x: canvasBounds.left + currentRect.x,
            y: canvasBounds.top + currentRect.y,
          })
        : { x: currentRect.x, y: currentRect.y };
      const rectEnd = canvasBounds
        ? reactFlow.screenToFlowPosition({
            x: canvasBounds.left + currentRect.x + currentRect.width,
            y: canvasBounds.top + currentRect.y + currentRect.height,
          })
        : { x: currentRect.x + currentRect.width, y: currentRect.y + currentRect.height };
      const flowSelectionRect = toRect(rectStart, rectEnd);
      const selectedIds = nodes
        .filter((node) => {
          const measuredNode = node as Node & { measured?: { width?: number; height?: number } };
          const nodeWidth = (measuredNode.width ?? measuredNode.measured?.width ?? 220);
          const nodeHeight = (measuredNode.height ?? measuredNode.measured?.height ?? 140);
          const flowRect: SelectionRect = {
            x: node.position.x,
            y: node.position.y,
            width: nodeWidth,
            height: nodeHeight,
          };
          return rectsIntersect(flowSelectionRect, flowRect);
        })
        .map((node) => node.id);

      setSelectedNodes(selectedIds);

      if (selectedIds.length > 0) {
        setCommittedSelectionRect(currentRect);
      } else {
        setCommittedSelectionRect(null);
      }
    }

    if (toolbarMode === "cut") {
      if (cutPathPoints.length >= 2) {
        const viewport = reactFlow.getViewport();
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));

        const toCenterPoint = (node: Node): { x: number; y: number } => {
          const measuredNode = node as Node & { measured?: { width?: number; height?: number } };
          const width = (measuredNode.width ?? measuredNode.measured?.width ?? 220) * viewport.zoom;
          const height = (measuredNode.height ?? measuredNode.measured?.height ?? 140) * viewport.zoom;
          return {
            x: viewport.x + (node.position.x * viewport.zoom) + (width / 2),
            y: viewport.y + (node.position.y * viewport.zoom) + (height / 2),
          };
        };

        const keepEdges = edges.filter((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          const targetNode = nodeMap.get(edge.target);
          if (!sourceNode || !targetNode) return true;

          const sourcePoint = toCenterPoint(sourceNode);
          const targetPoint = toCenterPoint(targetNode);

          for (let index = 0; index < cutPathPoints.length - 1; index += 1) {
            if (segmentIntersects(cutPathPoints[index], cutPathPoints[index + 1], sourcePoint, targetPoint)) {
              return false;
            }
          }

          return true;
        });

        if (keepEdges.length !== edges.length) {
          setEdges(keepEdges);
        }
      }

      setCutPathPoints([]);
    }
  }, [activeSelectionRect, cutPathPoints, edges, nodes, reactFlow, setEdges, setNodes, setSelectedNodes, toolbarMode]);

  const onCanvasMouseLeave = useCallback(() => {
    onPanePointerUp();
    if (toolbarMode === "cut") {
      setCutCursorPoint(null);
      lastCutCursorPointRef.current = null;
      lastCutMoveTimestampRef.current = 0;
    }
  }, [onPanePointerUp, toolbarMode]);

  useEffect(() => {
    if (toolbarMode !== "cut") {
      setCutCursorPoint(null);
      setCutCursorAngle(0);
      smoothedCutAngleRef.current = 0;
      lastCutMoveTimestampRef.current = 0;
      lastCutCursorPointRef.current = null;
    }
  }, [toolbarMode]);

  const visibleNodeOptions = useMemo(() => {
    const query = nodeSearchText.trim().toLowerCase();
    if (!query) return TOOLBAR_NODE_TYPES;
    return TOOLBAR_NODE_TYPES.filter((type) => getNodeLabel(type).toLowerCase().includes(query));
  }, [nodeSearchText]);

  const defaultViewport = useMemo(() => ({ x: 0, y: 0, zoom: 0.8 }), []);
  const shouldShowCutCursor = toolbarMode === "cut" && cutCursorPoint !== null && !isNodeInteractionActive;
  const hasSelectedNodes = committedSelectionRect !== null && selectedNodes.length > 1;
  const selectionToolbarStyle = useMemo(() => {
    const rect = committedSelectionRect ?? activeSelectionRect;
    if (!rect) return { left: 16, top: 16 };

    return {
      left: Math.max(16, rect.x - 122),
      top: Math.max(16, rect.y),
    };
  }, [activeSelectionRect, committedSelectionRect]);

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onClick={() => {
        closeContextMenu();
        closePopovers();
      }}
      onDoubleClick={() => {
        if (nodes.length === 0) {
          openNodePicker();
        }
      }}
      onContextMenu={(event) => {
        if (nodes.length === 0) {
          event.preventDefault();
          openNodePicker();
        }
      }}
    >
      {message ? (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-md border border-[#3f2226] bg-[#1a1114] px-3 py-2 text-sm text-[#f88f9f]">
          {message}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-4 top-4 z-30 flex items-center gap-2">
        <button
          type="button"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={toggleTheme}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-(--nf-border) bg-(--nf-surface) text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover)"
        >
          {theme === "light" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
        </button>

        <button
          type="button"
          aria-label="Share"
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-xl border border-(--nf-border) bg-(--nf-surface) px-3 text-[13px] font-medium text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
            <g fill="none" fillRule="evenodd">
              <path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
              <path fill="currentColor" d="M17 3a2 2 0 0 1 1.492.668l.108.132l3.704 4.939a2 2 0 0 1-.012 2.416l-.108.13l-9.259 10.184a1.25 1.25 0 0 1-1.753.096l-.097-.096l-9.259-10.185a2 2 0 0 1-.215-2.407l.095-.138L5.4 3.8a2 2 0 0 1 1.43-.793L7 3zm-2.477 8H9.477L12 17.307zm5.217 0h-3.063l-2.406 6.015zM7.323 11H4.261l5.468 6.015zm5.059-6h-.764l-2 4h4.764zM17 5h-2.382l2 4H20zM9.382 5H7L4 9h3.382z" />
            </g>
          </svg>
          <span className="hidden text-xs font-medium lg:block">Share</span>
        </button>

        <button
          type="button"
          aria-label="Turn workflow into app"
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-xl border border-(--nf-border) bg-(--nf-surface) px-3 text-[13px] font-medium text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#b8bcc5]">
            <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
            <path d="m18 15 4-4" />
            <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
          </svg>
          <span className="hidden text-xs font-medium lg:block">Turn workflow into app</span>
        </button>

        <button
          type="button"
          aria-label="Images"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-(--nf-border) bg-(--nf-surface) text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M18 22H4a2 2 0 0 1-2-2V6" />
            <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" />
            <circle cx="12" cy="8" r="2" />
            <rect width="16" height="16" x="6" y="2" rx="2" />
          </svg>
        </button>
      </div>

      {hasSelectedNodes ? (
        <div
          className="pointer-events-none absolute z-40 flex flex-col gap-2"
          style={selectionToolbarStyle}
          onMouseDown={stopToolbarEventPropagation}
          onPointerDown={stopToolbarEventPropagation}
          onClick={stopToolbarEventPropagation}
          onDoubleClick={stopToolbarEventPropagation}
          onContextMenu={stopToolbarEventPropagation}
        >
          <button
            type="button"
            onClick={() => void runSelectedNodes()}
            disabled={isNodeRunInFlight}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-[#1f74ff] bg-[#1f74ff] px-4 text-[13px] font-semibold text-white shadow-[0_8px_24px_rgba(31,116,255,0.28)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play className="h-3.5 w-3.5" />
            Run nodes
          </button>

          <button
            type="button"
            onClick={() => undefined}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-[#2b2b2b] bg-[#24262b] px-4 text-[13px] font-medium text-[#f0f2f5] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition hover:bg-[#2b2d33]"
          >
            <Shapes className="h-3.5 w-3.5 text-[#b8bcc5]" />
            Group
          </button>

          <button
            type="button"
            onClick={() => undefined}
            className="pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border border-[#2b2b2b] bg-[#24262b] px-4 text-[13px] font-medium text-[#f0f2f5] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition hover:bg-[#2b2d33]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#b8bcc5]" />
            Tidy up
          </button>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="fixed z-120 min-w-44 rounded-xl border border-[#2a2a2a] bg-[#0e1014] p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.52)]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => void runSingleNode()}
            disabled={isNodeRunInFlight}
            className="flex w-full items-center rounded-md px-3 py-3 text-left text-[15px] text-[#e5e7eb] transition hover:bg-[#1a1d24] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Run This Node
          </button>
          <button
            type="button"
            onClick={duplicateNode}
            className="flex w-full items-center rounded-md px-3 py-3 text-left text-[15px] text-[#e5e7eb] transition hover:bg-[#1a1d24]"
          >
            Duplicate Node
          </button>
          <button
            type="button"
            onClick={deleteNodeFromMenu}
            className="flex w-full items-center rounded-md px-3 py-3 text-left text-[15px] text-[#ffb4be] transition hover:bg-[#2a1218]"
          >
            Delete Node
          </button>
        </div>
      ) : null}

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-center">
          <div>
            <h2 className="text-[34px] font-semibold tracking-[-0.02em] text-[#8f919a]">Add a node</h2>
            <p className="mt-2 text-[15px] text-[#626673]">Double click, right click, or press N</p>
            <p className="mt-2 text-[12px] text-[#565b67]">Tip: Use Load Sample Workflow from the left sidebar.</p>
          </div>
        </div>
      ) : null}

      {(activeSelectionRect || committedSelectionRect || cutPathPoints.length > 1) ? (
        <svg className="pointer-events-none absolute inset-0 z-36 h-full w-full">
          {activeSelectionRect ? (
            <rect
              x={activeSelectionRect.x}
              y={activeSelectionRect.y}
              width={activeSelectionRect.width}
              height={activeSelectionRect.height}
              className="nextflow-selection-rect"
            />
          ) : null}

          {!activeSelectionRect && committedSelectionRect ? (
            <rect
              x={committedSelectionRect.x}
              y={committedSelectionRect.y}
              width={committedSelectionRect.width}
              height={committedSelectionRect.height}
              className="nextflow-selection-rect"
            />
          ) : null}

          {cutPathPoints.length > 1 ? (
            <polyline
              points={cutPathPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              className="nextflow-cut-path"
            />
          ) : null}
        </svg>
      ) : null}

      {shouldShowCutCursor ? (
        <div
          className="pointer-events-none absolute z-37"
          style={{
            left: cutCursorPoint.x,
            top: cutCursorPoint.y,
            transform: `translate(-50%, -50%) rotate(${cutCursorAngle}deg) scaleX(0.86)`,
            transformOrigin: "50% 50%",
          }}
        >
          <Scissors className="h-5.5 w-5.5 text-[#f2f4f8] drop-shadow-[0_1px_6px_rgba(0,0,0,0.7)]" strokeWidth={2.15} />
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute bottom-4 left-4 z-40 flex items-center gap-2"
        onMouseDown={stopToolbarEventPropagation}
        onPointerDown={stopToolbarEventPropagation}
        onClick={stopToolbarEventPropagation}
        onDoubleClick={stopToolbarEventPropagation}
        onContextMenu={stopToolbarEventPropagation}
      >
        <button
          type="button"
          onClick={() => {
            if (isNodeInteractionActive) return;
            undo();
          }}
          disabled={past.length === 0}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-xl border border-(--nf-border) bg-(--nf-surface) text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover) disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Undo"
        >
          <Undo2 className="h-4.5 w-4.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (isNodeInteractionActive) return;
            redo();
          }}
          disabled={future.length === 0}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-xl border border-(--nf-border) bg-(--nf-surface) text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover) disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Redo"
        >
          <Redo2 className="h-4.5 w-4.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            if (isNodeInteractionActive) return;
            setIsShortcutsOpen(true);
          }}
          className="pointer-events-auto flex h-9 items-center gap-2 rounded-xl border border-(--nf-border) bg-(--nf-surface) px-3 text-sm font-medium text-(--nf-text) shadow-[0_1px_0_rgba(255,255,255,0.05)_inset] transition hover:bg-(--nf-hover)"
          aria-label="Open keyboard shortcuts"
        >
          <Command className="h-4 w-4 text-(--nf-text-secondary)" />
          Keyboard shortcuts
        </button>
      </div>

      {isShortcutsOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          onClick={() => setIsShortcutsOpen(false)}
        >
          <div
            className="w-[min(92vw,440px)] rounded-3xl border border-(--nf-border) bg-(--nf-panel) p-8 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[34px] font-semibold text-(--nf-text)">Keyboard Shortcuts</h3>
                <p className="mt-1 text-sm text-(--nf-text-secondary)">Quickly navigate and create with these shortcuts.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsShortcutsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-(--nf-border) text-(--nf-text-secondary) transition hover:bg-(--nf-hover)"
                aria-label="Close keyboard shortcuts"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-(--nf-text)">
              <div className="flex items-center justify-between"><span>Undo</span><span className="rounded-md bg-(--nf-surface) px-2 py-0.5 text-xs text-(--nf-text-secondary)">Ctrl Z</span></div>
              <div className="flex items-center justify-between"><span>Redo</span><span className="rounded-md bg-(--nf-surface) px-2 py-0.5 text-xs text-(--nf-text-secondary)">Ctrl Shift Z</span></div>
              <div className="flex items-center justify-between"><span>Delete selected</span><span className="rounded-md bg-(--nf-surface) px-2 py-0.5 text-xs text-(--nf-text-secondary)">Del</span></div>
              <div className="flex items-center justify-between"><span>Pan canvas</span><span className="rounded-md bg-(--nf-surface) px-2 py-0.5 text-xs text-(--nf-text-secondary)">Hand Tool</span></div>
              <div className="flex items-center justify-between"><span>Add node</span><span className="rounded-md bg-(--nf-surface) px-2 py-0.5 text-xs text-(--nf-text-secondary)">N</span></div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute bottom-4 left-1/2 z-40 -translate-x-1/2"
        onMouseDown={stopToolbarEventPropagation}
        onPointerDown={stopToolbarEventPropagation}
        onClick={stopToolbarEventPropagation}
        onDoubleClick={stopToolbarEventPropagation}
        onContextMenu={stopToolbarEventPropagation}
      >
        {isNodeMenuOpen ? (
          <div className="pointer-events-auto mb-3 w-90 rounded-2xl border border-(--nf-border) bg-(--nf-panel) p-3 shadow-[0_18px_60px_rgba(0,0,0,0.6)]">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-(--nf-border) bg-(--nf-surface) px-3">
              <span className="text-(--nf-text-secondary)">🔍</span>
              <input
                type="text"
                value={nodeSearchText}
                onChange={(event) => setNodeSearchText(event.target.value)}
                placeholder="Search nodes"
                className="h-full flex-1 bg-transparent text-[15px] text-(--nf-text) outline-none placeholder:text-(--nf-text-secondary)"
                autoFocus
              />
            </div>
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {visibleNodeOptions.map((nodeType) => (
                <button
                  key={nodeType}
                  type="button"
                  onClick={() => addNodeFromToolbar(nodeType)}
                  className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-left text-[15px] text-(--nf-text) transition hover:bg-(--nf-hover)"
                >
                  <span>{getNodeLabel(nodeType)}</span>
                  <ChevronRight className="h-4 w-4 text-(--nf-text-secondary)" />
                </button>
              ))}
              {visibleNodeOptions.length === 0 ? (
                <div className="px-3 py-4 text-[13px] text-(--nf-text-secondary)">No matching nodes.</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {isPresetsOpen ? (
          <div className="pointer-events-auto mb-3 w-72 rounded-2xl border border-(--nf-border) bg-(--nf-panel) p-2 shadow-[0_18px_60px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={applySamplePreset}
              className="flex h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-(--nf-text) transition hover:bg-(--nf-hover)"
            >
              <span>Load Sample Workflow</span>
              <Sparkles className="h-4 w-4 text-(--nf-text-secondary)" />
            </button>
          </div>
        ) : null}

        <div className="pointer-events-auto flex items-center rounded-2xl border border-(--nf-border) bg-(--nf-surface) p-1 shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setIsNodeMenuOpen((value) => !value);
              setIsPresetsOpen(false);
            }}
            className={`grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover) ${isNodeMenuOpen ? "bg-(--nf-hover)" : "bg-transparent"}`}
            aria-label="Open node picker"
          >
            <Plus className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setToolbarMode("draw-select");
              closePopovers();
              setCutPathPoints([]);
              setCutCursorPoint(null);
            }}
            className={`grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover) ${toolbarMode === "draw-select" ? "bg-(--nf-hover)" : "bg-transparent"}`}
            aria-label="Draw selection"
          >
            <MousePointer2 className="h-5.5 w-5.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setToolbarMode("pan");
              closePopovers();
              setActiveSelectionRect(null);
              setCutPathPoints([]);
              setCutCursorPoint(null);
            }}
            className={`grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover) ${toolbarMode === "pan" ? "bg-(--nf-hover)" : "bg-transparent"}`}
            aria-label="Pan canvas"
          >
            <Hand className="h-5.5 w-5.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setToolbarMode("cut");
              closePopovers();
              setActiveSelectionRect(null);
              setCutCursorPoint(null);
            }}
            className={`grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover) ${toolbarMode === "cut" ? "bg-(--nf-hover)" : "bg-transparent"}`}
            aria-label="Cut connections"
          >
            <Scissors className="h-5.5 w-5.5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setToolbarMode("pointer");
              closePopovers();
              setActiveSelectionRect(null);
              setCutPathPoints([]);
              setCutCursorPoint(null);
            }}
            className="grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover)"
            aria-label="K button"
          >
            <svg aria-label="Krea Logo" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.34 1.266c1.766-.124 3.324 1.105 3.551 2.802.216 1.612-.887 3.171-2.545 3.536-.415.092-.877.066-1.317.122a4.63 4.63 0 0 0-2.748 1.34l-.008.004-.01-.001-.006-.005-.003-.009q0-.009.005-.016a.04.04 0 0 0 .007-.022 438 438 0 0 1-.01-4.541c.003-1.68 1.33-3.086 3.085-3.21" />
              <path d="M8.526 15.305c-2.247-.018-3.858-2.23-3.076-4.3a3.31 3.31 0 0 1 2.757-2.11c.384-.04.845-.03 1.215-.098 1.9-.353 3.368-1.806 3.665-3.657.066-.41.031-.9.128-1.335.449-2.016 2.759-3.147 4.699-2.236 1.011.476 1.69 1.374 1.857 2.447q.051.33.034.818c-.22 5.842-5.21 10.519-11.279 10.47m2.831.93a.04.04 0 0 1-.021-.02l-.001-.006.002-.006q0-.003.003-.004l.006-.003q3.458-.792 5.992-3.185.045-.042.083.007c.27.357.554.74.78 1.106a10.6 10.6 0 0 1 1.585 4.89q.037.53.023.819c-.084 1.705-1.51 3.08-3.31 3.09-1.592.01-2.992-1.077-3.294-2.597-.072-.36-.05-.858-.11-1.238q-.282-1.755-1.715-2.84zm-3.369 6.64c-1.353-.235-2.441-1.286-2.684-2.593a5 5 0 0 1-.05-.817V15.14q0-.021.016-.007c.884.786 1.814 1.266 3.028 1.346l.326.01c1.581.051 2.92 1.087 3.229 2.592.457 2.225-1.557 4.195-3.865 3.793" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isNodeInteractionActive) return;
              setIsPresetsOpen((value) => !value);
              setIsNodeMenuOpen(false);
            }}
            className={`grid h-12 w-12 place-items-center rounded-xl text-(--nf-text) transition hover:bg-(--nf-hover) ${isPresetsOpen ? "bg-(--nf-hover)" : "bg-transparent"}`}
            aria-label="Open presets"
          >
            <Shapes className="h-5.5 w-5.5" />
          </button>
        </div>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnectSafe}
        onSelectionChange={onSelectionChange}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={() => {
          setIsNodeHovering(true);
          setCutCursorPoint(null);
        }}
        onNodeMouseLeave={() => setIsNodeHovering(false)}
        onNodeDragStart={() => setIsDraggingNode(true)}
        onNodeDragStop={() => setIsDraggingNode(false)}
        onConnectStart={() => setIsConnectingNodes(true)}
        onConnectEnd={() => setIsConnectingNodes(false)}
        onPaneClick={closeContextMenu}
        defaultViewport={defaultViewport}
        edgeTypes={edgeTypes}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: "custom", animated: false }}
        isValidConnection={isValidConnection}
        proOptions={{ hideAttribution: true }}
        style={{
          backgroundColor: theme === "light" ? "#f4f6fa" : "#101010",
          cursor: shouldShowCutCursor ? "none" : toolbarMode === "pan" ? "grab" : "default",
        }}
        panOnDrag={toolbarMode === "pan"}
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        nodesDraggable={toolbarMode !== "pan"}
        elementsSelectable={toolbarMode !== "pan"}
        zoomOnDoubleClick={false}
        zoomOnScroll={false}
        selectionOnDrag={false}
        fitView
        onMouseDown={onPanePointerDown}
        onMouseMove={onPanePointerMove}
        onMouseUp={onPanePointerUp}
        onMouseLeave={onCanvasMouseLeave}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={34}
          size={1.65}
          color={theme === "light" ? "rgba(120, 128, 142, 0.26)" : "rgba(168, 173, 184, 0.17)"}
        />
        <MiniMap
          pannable
          zoomable
          className="nextflow-minimap"
          nodeColor={theme === "light" ? "#98a2b3" : "#2d313a"}
          maskColor={theme === "light" ? "rgba(213, 220, 233, 0.8)" : "rgba(0, 0, 0, 0.8)"}
          style={{
            backgroundColor: theme === "light" ? "#ffffff" : "#0f1014",
            border: theme === "light" ? "1px solid #d9dee8" : "1px solid #262626",
            borderRadius: 12,
          }}
        />
      </ReactFlow>
    </div>
  );
};

export const WorkflowCanvas: FC = () => {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInternal />
    </ReactFlowProvider>
  );
};
