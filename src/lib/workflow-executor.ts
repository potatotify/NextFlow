import type { Edge, Node } from "@xyflow/react";

import type { NodeData } from "@/types/nodes";

export type NodeExecutionStatus = "SUCCESS" | "FAILED";

export interface NodeExecutionResult {
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  status: NodeExecutionStatus;
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  triggerRunId?: string | null;
}

export interface WorkflowExecutionResult {
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodeRuns: NodeExecutionResult[];
}

interface LlmRunnerPayload {
  model: string;
  systemPrompt: string;
  userMessage: string;
  images?: string[];
}

interface CropRunnerPayload {
  imageUrl: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

interface ExtractRunnerPayload {
  videoUrl: string;
  timestamp: number;
}

interface ExecutionRunners {
  runLlm: (payload: LlmRunnerPayload) => Promise<{ text: string; triggerRunId?: string | null }>;
  runCrop: (payload: CropRunnerPayload) => Promise<{ imageUrl: string; triggerRunId?: string | null }>;
  runExtract: (payload: ExtractRunnerPayload) => Promise<{ imageUrl: string; triggerRunId?: string | null }>;
}

interface ExecuteWorkflowInput {
  nodes: Node[];
  edges: Edge[];
  runners: ExecutionRunners;
}

type NodeOutputsById = Map<string, Record<string, unknown>>;

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }

  const single = asString(value);
  return single ? [single] : [];
};

const isBlank = (value: unknown): boolean => {
  return typeof value !== "string" || value.trim().length === 0;
};

const isLikelyMediaSource = (value: string): boolean => {
  return value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:");
};

const buildExecutionLayers = (nodes: Node[], edges: Edge[]): Node[][] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue;
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;

    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes.filter((node) => (inDegree.get(node.id) ?? 0) === 0);
  const layers: Node[][] = [];
  let visited = 0;

  while (queue.length > 0) {
    const currentLayer = [...queue];
    layers.push(currentLayer);
    queue.length = 0;

    for (const node of currentLayer) {
      visited += 1;
      const neighbors = adjacency.get(node.id) ?? [];
      for (const neighborId of neighbors) {
        const nextInDegree = (inDegree.get(neighborId) ?? 0) - 1;
        inDegree.set(neighborId, nextInDegree);
        if (nextInDegree === 0) {
          const neighbor = nodeById.get(neighborId);
          if (neighbor) queue.push(neighbor);
        }
      }
    }
  }

  if (visited !== nodes.length) {
    throw new Error("Workflow graph contains a cycle and cannot be executed.");
  }

  return layers;
};

const resolveNodeInputs = (nodeId: string, edges: Edge[], outputsByNode: NodeOutputsById): Record<string, unknown> => {
  const inputs: Record<string, unknown> = {};

  const incomingEdges = edges.filter((edge) => edge.target === nodeId && edge.source);
  for (const edge of incomingEdges) {
    const sourceOutputs = outputsByNode.get(edge.source);
    if (!sourceOutputs) continue;

    const sourceHandleId = edge.sourceHandle ?? "output";
    const sourceValue = sourceOutputs[sourceHandleId] ?? sourceOutputs.output;
    if (sourceValue === undefined) continue;

    const targetHandleId = edge.targetHandle ?? "input";
    const existing = inputs[targetHandleId];

    if (existing === undefined) {
      inputs[targetHandleId] = sourceValue;
      continue;
    }

    if (Array.isArray(existing)) {
      inputs[targetHandleId] = [...existing, sourceValue];
      continue;
    }

    inputs[targetHandleId] = [existing, sourceValue];
  }

  return inputs;
};

const executeNode = async (
  node: Node,
  nodeInputs: Record<string, unknown>,
  runners: ExecutionRunners,
): Promise<NodeExecutionResult> => {
  const startedAt = Date.now();
  const nodeData = (node.data ?? {}) as unknown as NodeData;
  const nodeInputsSnapshot = structuredClone(nodeInputs);

  try {
    if (nodeData.nodeType === "textNode") {
      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: asString(nodeData.text, "") },
        durationMs: Date.now() - startedAt,
      };
    }

    if (nodeData.nodeType === "uploadImageNode") {
      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: asString(nodeData.imageUrl, "") },
        durationMs: Date.now() - startedAt,
      };
    }

    if (nodeData.nodeType === "uploadVideoNode") {
      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: asString(nodeData.videoUrl, "") },
        durationMs: Date.now() - startedAt,
      };
    }

    if (nodeData.nodeType === "llmNode") {
      const systemPrompt = asString(nodeInputs.system_prompt, asString(nodeData.systemPrompt, ""));
      const userMessage = asString(nodeInputs.user_message, asString(nodeData.userMessage, ""));

      if (isBlank(systemPrompt) && isBlank(userMessage)) {
        throw new Error("LLM node requires a system prompt or user message before execution.");
      }

      const llmResponse = await runners.runLlm({
        model: asString(nodeData.llmModel, "gemini-2.5-flash"),
        systemPrompt,
        userMessage,
        images: asStringArray(nodeInputs.images),
      });

      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: llmResponse.text },
        durationMs: Date.now() - startedAt,
        triggerRunId: llmResponse.triggerRunId ?? null,
      };
    }

    if (nodeData.nodeType === "cropImageNode") {
      const imageSource = asString(nodeInputs.image_url, asString(nodeData.imageUrl, ""));
      if (!isLikelyMediaSource(imageSource)) {
        throw new Error(
          "Crop Image expects an image URL/data URL on image_url. Connect Upload Image or Extract Frame output to Crop Image image_url.",
        );
      }

      const cropResponse = await runners.runCrop({
        imageUrl: imageSource,
        xPercent: toNumber(nodeInputs.x_percent ?? nodeData.cropXPercent, 0),
        yPercent: toNumber(nodeInputs.y_percent ?? nodeData.cropYPercent, 0),
        widthPercent: toNumber(nodeInputs.width_percent ?? nodeData.cropWidthPercent, 100),
        heightPercent: toNumber(nodeInputs.height_percent ?? nodeData.cropHeightPercent, 100),
      });

      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: cropResponse.imageUrl },
        durationMs: Date.now() - startedAt,
        triggerRunId: cropResponse.triggerRunId ?? null,
      };
    }

    if (nodeData.nodeType === "extractFrameNode") {
      const videoSource = asString(nodeInputs.video_url, asString(nodeData.videoUrl, ""));
      if (!isLikelyMediaSource(videoSource)) {
        throw new Error(
          "Extract Frame expects a video URL/data URL on video_url. Connect Upload Video output to Extract Frame video_url.",
        );
      }

      const extractResponse = await runners.runExtract({
        videoUrl: videoSource,
        timestamp: toNumber(nodeInputs.timestamp ?? nodeData.frameTimestamp, 0),
      });

      return {
        nodeId: node.id,
        nodeType: nodeData.nodeType,
        nodeLabel: nodeData.label,
        status: "SUCCESS",
        inputs: nodeInputsSnapshot,
        outputs: { output: extractResponse.imageUrl },
        durationMs: Date.now() - startedAt,
        triggerRunId: extractResponse.triggerRunId ?? null,
      };
    }

    return {
      nodeId: node.id,
      nodeType: nodeData.nodeType,
      nodeLabel: nodeData.label,
      status: "FAILED",
      error: `Unsupported node type: ${nodeData.nodeType}`,
      inputs: nodeInputsSnapshot,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";

    return {
      nodeId: node.id,
      nodeType: nodeData.nodeType,
      nodeLabel: nodeData.label,
      status: "FAILED",
      error: message,
      inputs: nodeInputsSnapshot,
      durationMs: Date.now() - startedAt,
    };
  }
};

export const executeWorkflowGraph = async ({ nodes, edges, runners }: ExecuteWorkflowInput): Promise<WorkflowExecutionResult> => {
  const startedAtTime = Date.now();
  const outputsByNode: NodeOutputsById = new Map();
  const nodeRuns: NodeExecutionResult[] = [];

  const layers = buildExecutionLayers(nodes, edges);

  for (const layer of layers) {
    const layerResults = await Promise.all(
      layer.map(async (node) => {
        const inputs = resolveNodeInputs(node.id, edges, outputsByNode);
        const result = await executeNode(node, inputs, runners);
        return result;
      }),
    );

    for (const result of layerResults) {
      nodeRuns.push(result);
      if (result.outputs) {
        outputsByNode.set(result.nodeId, result.outputs);
      }
    }
  }

  const totalFailed = nodeRuns.filter((run) => run.status === "FAILED").length;
  const totalSucceeded = nodeRuns.filter((run) => run.status === "SUCCESS").length;

  const status =
    totalFailed === 0 ? "SUCCESS" : totalSucceeded === 0 ? "FAILED" : "PARTIAL";

  const completedAtTime = Date.now();

  return {
    status,
    startedAt: new Date(startedAtTime).toISOString(),
    completedAt: new Date(completedAtTime).toISOString(),
    durationMs: completedAtTime - startedAtTime,
    nodeRuns,
  };
};
