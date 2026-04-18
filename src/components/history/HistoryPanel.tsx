"use client";

import { History, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { RunEntry } from "@/components/history/RunEntry";
import { useHistoryStore } from "@/store/history-store";
import { useToastStore } from "@/store/toast-store";
import { useWorkflowStore } from "@/store/workflow-store";

export const HistoryPanel = () => {
  const runs = useHistoryStore((state) => state.runs);
  const isLoading = useHistoryStore((state) => state.isLoading);
  const error = useHistoryStore((state) => state.error);
  const selectedRunId = useHistoryStore((state) => state.selectedRunId);
  const setSelectedRunId = useHistoryStore((state) => state.setSelectedRunId);
  const fetchRuns = useHistoryStore((state) => state.fetchRuns);
  const deleteWorkflowRun = useHistoryStore((state) => state.deleteWorkflowRun);
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    void fetchRuns(workflowId);
  }, [fetchRuns, workflowId]);

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium text-(--nf-text)">Workflow History</h2>
          <p className="mt-1 text-[11px] text-(--nf-text-secondary)">Recent execution runs</p>
        </div>

        <button
          type="button"
          onClick={() => void fetchRuns(workflowId)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-(--nf-border) bg-(--nf-surface) text-(--nf-text-secondary) hover:text-(--nf-text)"
          aria-label="Refresh history"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {error ? (
          <div className="rounded-xl border border-(--nf-danger-border) bg-(--nf-danger-bg) px-3 py-2 text-[12px] text-(--nf-danger-text)">
            {error}
          </div>
        ) : null}

        {!error && runs.length === 0 && !isLoading ? (
          <div className="flex h-full min-h-45 items-center justify-center rounded-2xl border border-dashed border-(--nf-border) bg-(--nf-surface) px-4 text-center">
            <div>
              <History className="mx-auto h-5 w-5 text-(--nf-text-secondary)" />
              <p className="mt-3 text-[13px] text-(--nf-text-secondary)">No runs yet</p>
            </div>
          </div>
        ) : null}

        <div className="space-y-3">
          {runs.map((run) => (
            <RunEntry
              key={run.id}
              run={run}
              expanded={selectedRunId === run.id}
              onToggle={() => setSelectedRunId(selectedRunId === run.id ? null : run.id)}
              onDelete={() => {
                addToast({
                  type: "error",
                  title: "Delete this run?",
                  message: `${run.workflowName} will be removed from history.`,
                  sticky: true,
                  actionLabel: "Delete run",
                  onAction: () => deleteWorkflowRun(run.id, workflowId),
                });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
