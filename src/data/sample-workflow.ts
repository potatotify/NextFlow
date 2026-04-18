import type { Edge, Node } from "@xyflow/react";

import type { NodeData } from "@/types/nodes";

export interface SampleWorkflowTemplate {
  name: string;
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
}

const createNode = (id: string, position: { x: number; y: number }, data: NodeData): Node => ({
  id,
  type: data.nodeType,
  position,
  data: data as unknown as Record<string, unknown>,
});

export const sampleWorkflow: SampleWorkflowTemplate = {
  name: "All-Nodes Media Campaign Flow",
  viewport: { x: 0, y: 0, zoom: 0.85 },
  nodes: [
    createNode("sample-upload-image", { x: 120, y: 120 }, {
      label: "Upload Image",
      nodeType: "uploadImageNode",
      status: "idle",
      imageUrl: "",
      imageName: "",
    }),
    createNode("sample-text-brand", { x: 120, y: 330 }, {
      label: "Text Node",
      nodeType: "textNode",
      status: "idle",
      text: "Create a concise campaign summary using both provided images (cropped hero + extracted video frame). Include one headline and one alt text.",
    }),
    createNode("sample-crop", { x: 430, y: 120 }, {
      label: "Crop Image",
      nodeType: "cropImageNode",
      status: "idle",
      cropXPercent: "12",
      cropYPercent: "8",
      cropWidthPercent: "76",
      cropHeightPercent: "76",
    }),
    createNode("sample-upload-video", { x: 120, y: 540 }, {
      label: "Upload Video",
      nodeType: "uploadVideoNode",
      status: "idle",
      videoUrl: "",
      videoName: "",
    }),
    createNode("sample-text-timestamp", { x: 120, y: 740 }, {
      label: "Text Node",
      nodeType: "textNode",
      status: "idle",
      text: "2.5",
    }),
    createNode("sample-extract-frame", { x: 430, y: 560 }, {
      label: "Extract Frame",
      nodeType: "extractFrameNode",
      status: "idle",
      frameTimestamp: "2.5",
    }),
    createNode("sample-llm", { x: 780, y: 320 }, {
      label: "Run Any LLM",
      nodeType: "llmNode",
      status: "idle",
      llmModel: "gemini-2.5-flash",
      systemPrompt: "You are a concise marketing strategist. Use both images for one final launch-ready output.",
      userMessage: "Use the connected text and image inputs to produce one headline and one alt text.",
      llmResult: "",
    }),
  ],
  edges: [
    {
      id: "sample-edge-text-to-llm",
      source: "sample-text-brand",
      sourceHandle: "output",
      target: "sample-llm",
      targetHandle: "user_message",
      type: "custom",
      animated: true,
    },
    {
      id: "sample-edge-image-to-crop",
      source: "sample-upload-image",
      sourceHandle: "output",
      target: "sample-crop",
      targetHandle: "image_url",
      type: "custom",
      animated: true,
    },
    {
      id: "sample-edge-video-to-extract",
      source: "sample-upload-video",
      sourceHandle: "output",
      target: "sample-extract-frame",
      targetHandle: "video_url",
      type: "custom",
      animated: true,
    },
    {
      id: "sample-edge-timestamp-to-extract",
      source: "sample-text-timestamp",
      sourceHandle: "output",
      target: "sample-extract-frame",
      targetHandle: "timestamp",
      type: "custom",
      animated: true,
    },
    {
      id: "sample-edge-crop-to-llm-images",
      source: "sample-crop",
      sourceHandle: "output",
      target: "sample-llm",
      targetHandle: "images",
      type: "custom",
      animated: true,
    },
    {
      id: "sample-edge-frame-to-llm-images",
      source: "sample-extract-frame",
      sourceHandle: "output",
      target: "sample-llm",
      targetHandle: "images",
      type: "custom",
      animated: true,
    },
  ],
};
