import { Position, type NodeProps } from "@xyflow/react";
import { Type } from "lucide-react";
import { useCallback, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

export const TextNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const nodeData = (data ?? {}) as unknown as NodeData;

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { text: event.target.value });
    },
    [id, updateNodeData],
  );

  return (
    <NodeWrapper
      nodeId={id}
      title="Text Node"
      subtitle="Static text source"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="source" position={Position.Right} id="output" dataType="text" />

      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-[#8f919a]">
        <Type className="h-3.5 w-3.5" />
        Text
      </div>

      <textarea
        value={nodeData.text ?? ""}
        onChange={onChange}
        placeholder="Enter text for downstream nodes"
        className="h-24 w-full resize-none rounded-xl border border-[#2b2b2b] bg-[#0f1014] px-3 py-2 text-[13px] leading-5 text-[#e5e7eb] outline-none placeholder:text-[#6b7280] focus:border-[#3b3b3b]"
      />
    </NodeWrapper>
  );
};
