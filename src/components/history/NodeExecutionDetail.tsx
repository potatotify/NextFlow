import type { FC } from "react";

import type { NodeExecutionDetail as NodeExecutionDetailType } from "@/types/history";

interface NodeExecutionDetailProps {
  nodeRun: NodeExecutionDetailType;
}

const statusClassByValue = {
  SUCCESS: "bg-(--nf-success-bg) text-(--nf-success-text)",
  FAILED: "bg-(--nf-error-bg) text-(--nf-error-text)",
  PARTIAL: "bg-(--nf-warning-bg) text-(--nf-warning-text)",
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
    <div className="rounded-xl border border-(--nf-border) bg-(--nf-panel) px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-(--nf-text)">{nodeRun.nodeLabel ?? nodeRun.nodeType}</p>
          <p className="text-[11px] text-(--nf-text-secondary)">{nodeRun.nodeType}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClassByValue[nodeRun.status]}`}>
          {nodeRun.status}
        </span>
      </div>

      {nodeRun.error ? <p className="mt-2 text-[11px] text-(--nf-danger-text)">{nodeRun.error}</p> : null}

      {outputValue ? (
        <div className="mt-2 rounded-lg bg-(--nf-code-bg) px-2 py-2 text-[11px] text-(--nf-code-text)">
          {isReadableUrl(outputValue) ? (
            <a
              href={outputValue}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-(--nf-link) underline decoration-sky-500/40 underline-offset-2 hover:brightness-110"
              title={outputValue}
            >
              {formatReadableUrl(outputValue)}
            </a>
          ) : outputValue.startsWith("data:") ? (
            <div className="space-y-1">
              <p className="font-medium text-(--nf-text)">Embedded media output</p>
              <p className="text-(--nf-text-secondary)">Stored as local data for execution. Use the node preview or download button.</p>
            </div>
          ) : (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap wrap-break-word">
              {JSON.stringify(nodeRun.outputs, null, 2)}
            </pre>
          )}
        </div>
      ) : nodeRun.outputs ? (
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-(--nf-code-bg) p-2 text-[11px] text-(--nf-code-text)">
          {JSON.stringify(nodeRun.outputs, null, 2)}
        </pre>
      ) : null}
    </div>
  );
};
