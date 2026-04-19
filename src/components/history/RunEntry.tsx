import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { FC } from "react";

import { NodeExecutionDetail } from "@/components/history/NodeExecutionDetail";
import type { WorkflowRunSummary } from "@/types/history";

interface RunEntryProps {
  run: WorkflowRunSummary;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}

const statusClassByValue = {
  SUCCESS: "bg-(--nf-success-bg) text-(--nf-success-text)",
  FAILED: "bg-(--nf-error-bg) text-(--nf-error-text)",
  PARTIAL: "bg-(--nf-warning-bg) text-(--nf-warning-text)",
};

const formatRunTimestamp = (startedAt: string): string => {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return "Unknown run time";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const RunEntry: FC<RunEntryProps> = ({ run, expanded, onToggle, onDelete }) => {
  const runTimestamp = formatRunTimestamp(run.startedAt);

  return (
    <div className="rounded-2xl border border-(--nf-border) bg-(--nf-panel)">
      <div className="flex items-center justify-between gap-3 px-3 py-3 text-left">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClassByValue[run.status]}`}>
              {run.status}
            </span>
            <p className="truncate text-[13px] font-medium text-(--nf-text)">{run.workflowName}</p>
          </div>
          <p className="mt-1 text-[11px] text-(--nf-text-secondary)">
            {run.nodeCount} nodes · {run.durationMs ?? 0} ms
          </p>
          <p className="mt-1 text-[11px] text-(--nf-text-secondary)">
            {runTimestamp}
          </p>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="grid h-7 w-7 place-items-center rounded-lg border border-(--nf-danger-border) bg-(--nf-danger-bg) text-(--nf-danger-text) hover:brightness-95"
            aria-label={`Delete run ${run.workflowName}`}
            title="Delete run"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="grid h-7 w-7 place-items-center rounded-lg text-(--nf-text-secondary) hover:text-(--nf-text)"
            aria-label={expanded ? "Collapse run details" : "Expand run details"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-(--nf-border) px-3 py-3">
          <div className="space-y-2">
            {run.nodeRuns.length > 0 ? (
              run.nodeRuns.map((nodeRun) => <NodeExecutionDetail key={nodeRun.id} nodeRun={nodeRun} />)
            ) : (
              <p className="text-[12px] text-(--nf-text-secondary)">No node details recorded yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
