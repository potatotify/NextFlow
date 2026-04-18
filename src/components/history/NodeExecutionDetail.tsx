import type { FC } from "react";

import type { NodeExecutionDetail as NodeExecutionDetailType } from "@/types/history";

interface NodeExecutionDetailProps {
  nodeRun: NodeExecutionDetailType;
}

const statusClassByValue = {
  SUCCESS: "bg-[#1f6f3e] text-[#d8ffe8]",
  FAILED: "bg-[#6f1f2b] text-[#ffd8de]",
  PARTIAL: "bg-[#8a5d13] text-[#fff0c9]",
};

const isReadableUrl = (value: string): boolean => {
  return /^https?:\/\//i.test(value) || value.startsWith("cdn://") || value.startsWith("transloadit://");
};

const formatReadableUrl = (value: string): string => {
  if (value.startsWith("https://")) return value.slice("https://".length);
  if (value.startsWith("http://")) return value.slice("http://".length);
  return value;
};

export const NodeExecutionDetail: FC<NodeExecutionDetailProps> = ({ nodeRun }) => {
  const outputValue = nodeRun.outputs && typeof nodeRun.outputs.output === "string" ? nodeRun.outputs.output : null;

  return (
    <div className="rounded-xl border border-[#222] bg-[#111214] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[#e5e7eb]">{nodeRun.nodeLabel ?? nodeRun.nodeType}</p>
          <p className="text-[11px] text-[#8f919a]">{nodeRun.nodeType}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClassByValue[nodeRun.status]}`}>
          {nodeRun.status}
        </span>
      </div>

      {nodeRun.error ? <p className="mt-2 text-[11px] text-[#fca5a5]">{nodeRun.error}</p> : null}

      {outputValue ? (
        <div className="mt-2 rounded-lg bg-[#0c0d10] px-2 py-2 text-[11px] text-[#cbd5e1]">
          {isReadableUrl(outputValue) ? (
            <a
              href={outputValue}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[#8bd5ff] underline decoration-[#3b82f6]/40 underline-offset-2 hover:text-[#b7e3ff]"
              title={outputValue}
            >
              {formatReadableUrl(outputValue)}
            </a>
          ) : outputValue.startsWith("data:") ? (
            <div className="space-y-1">
              <p className="font-medium text-[#e5e7eb]">Embedded media output</p>
              <p className="text-[#8f919a]">Stored as local data for execution. Use the node preview or download button.</p>
            </div>
          ) : (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(nodeRun.outputs, null, 2)}
            </pre>
          )}
        </div>
      ) : nodeRun.outputs ? (
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-[#0c0d10] p-2 text-[11px] text-[#cbd5e1]">
          {JSON.stringify(nodeRun.outputs, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};
