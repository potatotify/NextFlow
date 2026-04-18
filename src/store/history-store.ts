import { create } from "zustand";

import type { WorkflowRunSummary } from "@/types/history";

interface HistoryStore {
  runs: WorkflowRunSummary[];
  isLoading: boolean;
  error: string | null;
  selectedRunId: string | null;
  setSelectedRunId: (runId: string | null) => void;
  fetchRuns: (workflowId?: string | null) => Promise<void>;
  deleteWorkflowRun: (runId: string, workflowId?: string | null) => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  runs: [],
  isLoading: false,
  error: null,
  selectedRunId: null,
  setSelectedRunId: (runId) => set(() => ({ selectedRunId: runId })),
  fetchRuns: async (workflowId) => {
    set(() => ({ isLoading: true, error: null }));

    try {
      const url = workflowId ? `/api/history?workflowId=${encodeURIComponent(workflowId)}` : "/api/history";
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load history");
      }

      const data = (await response.json()) as { runs: WorkflowRunSummary[] };
      set(() => ({ runs: data.runs, isLoading: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load history";
      set(() => ({ error: message, isLoading: false }));
    }
  },
  deleteWorkflowRun: async (runId, workflowId) => {
    set(() => ({ isLoading: true, error: null }));

    try {
      const response = await fetch(`/api/history?runId=${encodeURIComponent(runId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete history");
      }

      set((state) => ({
        runs: state.runs.filter((run) => run.id !== runId),
        selectedRunId: state.selectedRunId === runId ? null : state.selectedRunId,
        isLoading: false,
      }));

      if (workflowId) {
        const url = `/api/history?workflowId=${encodeURIComponent(workflowId)}`;
        const refreshResponse = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (refreshResponse.ok) {
          const data = (await refreshResponse.json()) as { runs: WorkflowRunSummary[] };
          set(() => ({ runs: data.runs }));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete history";
      set(() => ({ error: message, isLoading: false }));
    }
  },
}));
