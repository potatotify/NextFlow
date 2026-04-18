import { Position, type NodeProps } from "@xyflow/react";
import { Crop, Download } from "lucide-react";
import { useCallback, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

export const CropImageNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const nodeData = (data ?? {}) as unknown as NodeData;

  const onFieldChange = useCallback(
    (field: "cropXPercent" | "cropYPercent" | "cropWidthPercent" | "cropHeightPercent") =>
      (event: ChangeEvent<HTMLInputElement>) => {
        updateNodeData(id, { [field]: event.target.value });
      },
    [id, updateNodeData],
  );

  const onDownloadImage = useCallback(() => {
    if (!nodeData.croppedImageUrl) return;

    const link = document.createElement("a");
    link.href = nodeData.croppedImageUrl;
    link.download = `cropped-image-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [nodeData.croppedImageUrl]);

  return (
    <NodeWrapper
      nodeId={id}
      title="Crop Image"
      subtitle="Region-based image crop"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="target" position={Position.Left} id="image_url" dataType="image" style={{ top: "16%" }} />
      <HandlePort type="target" position={Position.Left} id="x_percent" dataType="text" style={{ top: "32%" }} />
      <HandlePort type="target" position={Position.Left} id="y_percent" dataType="text" style={{ top: "48%" }} />
      <HandlePort type="target" position={Position.Left} id="width_percent" dataType="text" style={{ top: "64%" }} />
      <HandlePort type="target" position={Position.Left} id="height_percent" dataType="text" style={{ top: "80%" }} />
      <HandlePort type="source" position={Position.Right} id="output" dataType="image" style={{ top: "50%" }} />

      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#8f919a]">
        <Crop className="h-3.5 w-3.5" />
        Crop Params (%)
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-[#8f919a]">
          X
          <input
            type="number"
            min="0"
            max="100"
            value={nodeData.cropXPercent ?? "0"}
            onChange={onFieldChange("cropXPercent")}
            className="mt-1 h-8 w-full rounded-lg border border-[#2b2b2b] bg-[#0f1014] px-2 text-[12px] text-[#e5e7eb] outline-none focus:border-[#3b3b3b]"
          />
        </label>

        <label className="text-[11px] text-[#8f919a]">
          Y
          <input
            type="number"
            min="0"
            max="100"
            value={nodeData.cropYPercent ?? "0"}
            onChange={onFieldChange("cropYPercent")}
            className="mt-1 h-8 w-full rounded-lg border border-[#2b2b2b] bg-[#0f1014] px-2 text-[12px] text-[#e5e7eb] outline-none focus:border-[#3b3b3b]"
          />
        </label>

        <label className="text-[11px] text-[#8f919a]">
          Width
          <input
            type="number"
            min="1"
            max="100"
            value={nodeData.cropWidthPercent ?? "100"}
            onChange={onFieldChange("cropWidthPercent")}
            className="mt-1 h-8 w-full rounded-lg border border-[#2b2b2b] bg-[#0f1014] px-2 text-[12px] text-[#e5e7eb] outline-none focus:border-[#3b3b3b]"
          />
        </label>

        <label className="text-[11px] text-[#8f919a]">
          Height
          <input
            type="number"
            min="1"
            max="100"
            value={nodeData.cropHeightPercent ?? "100"}
            onChange={onFieldChange("cropHeightPercent")}
            className="mt-1 h-8 w-full rounded-lg border border-[#2b2b2b] bg-[#0f1014] px-2 text-[12px] text-[#e5e7eb] outline-none focus:border-[#3b3b3b]"
          />
        </label>
      </div>

      {nodeData.croppedImageUrl ? (
        <div className="mt-4 rounded-xl border border-[#2b2b2b] bg-[#0e0f12] overflow-hidden">
          <img
            src={nodeData.croppedImageUrl}
            alt="Cropped image output"
            className="h-28 w-full object-cover"
          />
          <div className="border-t border-[#23252a] px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] text-[#9ca3af]">Cropped Output</span>
            <button
              type="button"
              onClick={onDownloadImage}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-[#e5e7eb] transition bg-[#2a2d35] hover:bg-[#3a3f4a]"
              aria-label="Download cropped image"
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
