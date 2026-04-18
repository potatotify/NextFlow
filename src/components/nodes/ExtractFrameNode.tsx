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

      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#8f919a]">
        <Clapperboard className="h-3.5 w-3.5" />
        Frame Settings
      </div>

      <label className="block text-[11px] text-[#8f919a]">
        Timestamp (s)
        <input
          type="number"
          min="0"
          step="0.1"
          value={nodeData.frameTimestamp ?? "0"}
          onChange={onTimestampChange}
          className="mt-1 h-9 w-full rounded-lg border border-[#2b2b2b] bg-[#0f1014] px-2 text-[12px] text-[#e5e7eb] outline-none focus:border-[#3b3b3b]"
        />
      </label>

      <p className="mt-2 text-[11px] text-[#6b7280]">Uses incoming video stream and extracts a single output image.</p>

      {nodeData.extractedFrameUrl ? (
        <div className="mt-4 rounded-xl border border-[#2b2b2b] bg-[#0e0f12] overflow-hidden">
          <img
            src={nodeData.extractedFrameUrl}
            alt="Extracted frame output"
            className="h-28 w-full object-cover"
          />
          <div className="border-t border-[#23252a] px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] text-[#9ca3af]">Frame at {nodeData.frameTimestamp || "0"}s</span>
            <button
              type="button"
              onClick={onDownloadFrame}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-[#e5e7eb] transition bg-[#2a2d35] hover:bg-[#3a3f4a]"
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
