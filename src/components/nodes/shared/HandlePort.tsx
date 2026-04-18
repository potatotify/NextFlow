import { Handle, Position, type HandleProps } from "@xyflow/react";
import type { CSSProperties, FC } from "react";

interface HandlePortProps {
  type: HandleProps["type"];
  position: Position;
  id: string;
  dataType: "text" | "image" | "video";
  style?: CSSProperties;
}

const dotClassByType: Record<HandlePortProps["dataType"], string> = {
  text: "bg-[#9ca3af]",
  image: "bg-[#5eb4ff]",
  video: "bg-[#d19aff]",
};

export const HandlePort: FC<HandlePortProps> = ({ type, position, id, dataType, style }) => {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      className={`h-3.5 w-3.5 border border-[#0c0c0c] ring-1 ring-[#2a2e38] ${dotClassByType[dataType]}`}
      style={{ zIndex: 25, ...style }}
    />
  );
};
