const allowedTargetsBySourceType: Record<string, string[]> = {
  text: [
    "system_prompt",
    "user_message",
    "timestamp",
    "x_percent",
    "y_percent",
    "width_percent",
    "height_percent",
  ],
  image: ["images", "image_url"],
  video: ["video_url"],
};

export const isValidConnection = (sourceType: string, targetType: string): boolean => {
  const allowedTargets = allowedTargetsBySourceType[sourceType] ?? [];
  return allowedTargets.includes(targetType);
};

export const getSourceDataType = (nodeType: string, sourceHandle?: string | null): string | null => {
  if (sourceHandle && sourceHandle !== "output") {
    return null;
  }

  if (nodeType === "uploadImageNode" || nodeType === "cropImageNode" || nodeType === "extractFrameNode") {
    return "image";
  }

  if (nodeType === "uploadVideoNode") {
    return "video";
  }

  if (nodeType === "textNode" || nodeType === "llmNode") {
    return "text";
  }

  return null;
};
