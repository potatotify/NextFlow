import { Trash2 } from "lucide-react";
import type { CSSProperties, FC, ReactNode } from "react";

import { NodeStatus } from "@/components/nodes/shared/NodeStatus";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NextFlowNodeType, NodeExecutionStatus } from "@/types/nodes";

interface NodeWrapperProps {
  nodeId: string;
  title: string;
  subtitle?: string;
  status?: NodeExecutionStatus;
  nodeType?: NextFlowNodeType;
  selected?: boolean;
  onDelete: () => void;
  children: ReactNode;
}

const accentByNodeType: Record<NextFlowNodeType, { border: string; rgb: string }> = {
  textNode: { border: "#2f8cff", rgb: "47 140 255" },
  uploadImageNode: { border: "#2f8cff", rgb: "47 140 255" },
  uploadVideoNode: { border: "#22c55e", rgb: "34 197 94" },
  llmNode: { border: "#2f8cff", rgb: "47 140 255" },
  cropImageNode: { border: "#2f8cff", rgb: "47 140 255" },
  extractFrameNode: { border: "#2f8cff", rgb: "47 140 255" },
};

export const NodeWrapper: FC<NodeWrapperProps> = ({
  nodeId,
  title,
  subtitle,
  status = "idle",
  nodeType = "textNode",
  selected = false,
  onDelete,
  children,
}) => {
  const selectedNodeIds = useWorkflowStore((state) => state.selectedNodes);
  const isSelected = selected || selectedNodeIds.includes(nodeId);
  const accent = accentByNodeType[nodeType] ?? accentByNodeType.textNode;
  const isRunning = status === "running";
  const borderColor = isSelected || isRunning ? accent.border : "var(--nf-border)";
  const boxShadow = isRunning
    ? undefined
    : isSelected
      ? `0 0 0 1px ${accent.border}, 0 0 0 5px rgb(${accent.rgb} / 0.12), 0 0 24px rgb(${accent.rgb} / 0.10), 0 10px 30px rgba(0, 0, 0, 0.35)`
      : "0 10px 30px rgba(0,0,0,0.35)";

  const nodeStyle = {
    borderColor,
    boxShadow,
    ["--nf-node-accent-rgb" as never]: accent.rgb,
  } as CSSProperties;

  return (
    <article
      className={`w-65 rounded-2xl border bg-(--nf-panel) shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow,transform] duration-200 ${isSelected ? "translate-y-0.5" : ""} ${isRunning ? "nextflow-node-running" : ""}`}
      style={nodeStyle}
    >
      <header className="flex items-start justify-between gap-3 border-b border-(--nf-border) px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NodeStatus status={status} />
            <h3 className="truncate text-[13px] font-medium text-(--nf-text)">{title}</h3>
          </div>
          {subtitle ? <p className="mt-1 text-[11px] text-(--nf-text-secondary)">{subtitle}</p> : null}
        </div>

        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1 text-(--nf-text-secondary) transition hover:bg-(--nf-hover) hover:text-(--nf-text)"
          aria-label={`Delete ${title}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="px-4 py-3">{children}</div>
    </article>
  );
};
