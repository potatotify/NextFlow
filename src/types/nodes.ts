export type NextFlowNodeType =
  | "textNode"
  | "uploadImageNode"
  | "uploadVideoNode"
  | "llmNode"
  | "cropImageNode"
  | "extractFrameNode";

export type NodeExecutionStatus = "idle" | "running" | "success" | "error";

export interface NodeData {
  label: string;
  nodeType: NextFlowNodeType;
  text?: string;
  imageUrl?: string;
  imagePreviewUrl?: string;
  imageName?: string;
  videoUrl?: string;
  videoPreviewUrl?: string;
  videoName?: string;
  llmModel?: string;
  systemPrompt?: string;
  userMessage?: string;
  llmResult?: string;
  llmError?: string;
  cropXPercent?: string;
  cropYPercent?: string;
  cropWidthPercent?: string;
  cropHeightPercent?: string;
  frameTimestamp?: string;
  croppedImageUrl?: string;
  extractedFrameUrl?: string;
  status?: NodeExecutionStatus;
}
