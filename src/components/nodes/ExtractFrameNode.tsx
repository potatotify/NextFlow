import { Position, type NodeProps } from "@xyflow/react";
import { Clapperboard, Download } from "lucide-react";
import { useCallback, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

export const ExtractFrameNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const nodeData = (data ?? {}) as unknown as NodeData;

  const onTimestampChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { frameTimestamp: event.target.value });
    },
    [id, updateNodeData],
  );

  const onDownloadFrame = useCallback(() => {
    if (!nodeData.extractedFrameUrl) return;

    const link = document.createElement("a");
    link.href = nodeData.extractedFrameUrl;
    link.download = `extracted-frame-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [nodeData.extractedFrameUrl]);

  return (
    <NodeWrapper
      nodeId={id}
      title="Extract Frame"
      subtitle="Capture still image from video"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="target" position={Position.Left} id="video_url" dataType="video" style={{ top: "34%" }} />
      <HandlePort type="target" position={Position.Left} id="timestamp" dataType="text" style={{ top: "66%" }} />
      <HandlePort type="source" position={Position.Right} id="output" dataType="image" style={{ top: "50%" }} />

      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-(--nf-text-secondary)">
        <Clapperboard className="h-3.5 w-3.5" />
        Frame Settings
      </div>

      <label className="block text-[11px] text-(--nf-text-secondary)">
        Timestamp (s)
        <input
          type="number"
          min="0"
          step="0.1"
          value={nodeData.frameTimestamp ?? "0"}
          onChange={onTimestampChange}
          className="mt-1 h-9 w-full rounded-lg border border-(--nf-input-border) bg-(--nf-input-bg) px-2 text-[12px] text-(--nf-text) outline-none focus:border-(--nf-input-focus)"
        />
      </label>

      <p className="mt-2 text-[11px] text-(--nf-text-secondary)">Uses incoming video stream and extracts a single output image.</p>

      {nodeData.extractedFrameUrl ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-(--nf-border) bg-(--nf-surface)">
          <img
            src={nodeData.extractedFrameUrl}
            alt="Extracted frame output"
            className="h-28 w-full object-cover"
          />
          <div className="flex items-center justify-between border-t border-(--nf-border) px-3 py-2">
            <span className="text-[11px] text-(--nf-text-secondary)">Frame at {nodeData.frameTimestamp || "0"}s</span>
            <button
              type="button"
              onClick={onDownloadFrame}
              className="inline-flex items-center gap-1.5 rounded-md bg-(--nf-hover) px-2.5 py-1.5 text-[11px] font-medium text-(--nf-text) transition hover:brightness-95"
              aria-label="Download extracted frame"
            >
              <Download className="h-3 w-3" />
              Download
            </button>
          </div>
        </div>
      ) : null}
    </NodeWrapper>
  );
};
