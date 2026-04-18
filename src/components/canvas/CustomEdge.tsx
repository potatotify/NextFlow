"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { FC } from "react";

export const CustomEdge: FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: "#1A9BFF",
        strokeWidth: 2,
        strokeDasharray: "none",
        animation: "none",
        filter: "drop-shadow(0 0 4px rgba(26, 155, 255, 0.62))",
      }}
    />
  );
};
