import type { FC } from "react";

import type { NodeExecutionStatus } from "@/types/nodes";

interface NodeStatusProps {
  status: NodeExecutionStatus;
}

const statusClassByValue: Record<NodeExecutionStatus, string> = {
  idle: "bg-[#6b7280]",
  running: "bg-[#f59e0b] animate-pulse",
  success: "bg-[#22c55e]",
  error: "bg-[#ef4444]",
};

export const NodeStatus: FC<NodeStatusProps> = ({ status }) => {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${statusClassByValue[status]}`} aria-hidden="true" />;
};
