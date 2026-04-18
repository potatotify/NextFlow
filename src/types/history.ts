export type WorkflowRunStatus = "SUCCESS" | "FAILED" | "PARTIAL";
export type HistoryNodeRunStatus = "SUCCESS" | "FAILED";

export interface NodeExecutionDetail {
  id: string;
  nodeId: string;
  nodeType: string;
  nodeLabel: string | null;
  status: HistoryNodeRunStatus;
  error: string | null;
  durationMs: number | null;
  outputs: Record<string, unknown> | null;
}

export interface WorkflowRunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  scope: "FULL" | "PARTIAL" | "SINGLE";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  nodeCount: number;
  nodeRuns: NodeExecutionDetail[];
}
