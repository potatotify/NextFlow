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
  SUCCESS: "bg-[#1f6f3e] text-[#d8ffe8]",
  FAILED: "bg-[#6f1f2b] text-[#ffd8de]",
  PARTIAL: "bg-[#8a5d13] text-[#fff0c9]",
};

export const RunEntry: FC<RunEntryProps> = ({ run, expanded, onToggle, onDelete }) => {
  return (
    <div className="rounded-2xl border border-[#222] bg-[#111214]">
      <div className="flex items-center justify-between gap-3 px-3 py-3 text-left">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClassByValue[run.status]}`}>
              {run.status}
            </span>
            <p className="truncate text-[13px] font-medium text-[#e5e7eb]">{run.workflowName}</p>
          </div>
          <p className="mt-1 text-[11px] text-[#8f919a]">
            {run.nodeCount} nodes · {run.durationMs ?? 0} ms
          </p>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            className="grid h-7 w-7 place-items-center rounded-lg border border-[#3a2323] bg-[#1a1111] text-[#ef9a9a] hover:text-[#ffd0d0]"
            aria-label={`Delete run ${run.workflowName}`}
            title="Delete run"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggle}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#8f919a] hover:text-[#e5e7eb]"
            aria-label={expanded ? "Collapse run details" : "Expand run details"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-[#222] px-3 py-3">
          <div className="space-y-2">
            {run.nodeRuns.length > 0 ? (
              run.nodeRuns.map((nodeRun) => <NodeExecutionDetail key={nodeRun.id} nodeRun={nodeRun} />)
            ) : (
              <p className="text-[12px] text-[#8f919a]">No node details recorded yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
