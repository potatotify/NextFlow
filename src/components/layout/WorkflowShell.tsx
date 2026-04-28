"use client";

import { useAuth } from "@clerk/nextjs";
import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { X, Clock } from "lucide-react";

import { LeftSidebar } from "@/components/layout/LeftSidebar";
import { WorkflowPersistence } from "@/components/layout/WorkflowPersistence";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ToastViewport } from "@/components/ui/ToastViewport";
import { useWorkflowStore } from "@/store/workflow-store";
import { sampleWorkflow } from "@/data/sample-workflow";
import { useToastStore } from "@/store/toast-store";
import type { NodeData } from "@/types/nodes";

interface WorkflowShellProps {
  children: ReactNode;
}

interface SaveResponse {
  workflowId: string;
}

interface ExportResponse {
  workflow: {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number } | null;
  };
}

interface WorkflowListItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowListResponse {
  workflows: WorkflowListItem[];
}

interface WorkflowLoadResponse {
  workflow: {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number } | null;
  } | null;
}

type StreamEvent =
  | { type: "layer_start"; nodeIds: string[] }
  | { type: "node_done"; nodeResult: { nodeId: string; status: "SUCCESS" | "FAILED"; outputs?: Record<string, unknown>; error?: string } }
  | { type: "complete"; result: { nodeRuns: Array<{ nodeId: string; status: "SUCCESS" | "FAILED" }> } }
  | { type: "error"; message: string };

const toRunningNode = (node: Node): Node => {
  const data = (node.data ?? {}) as unknown as NodeData;
  return {
    ...node,
    data: {
      ...data,
      status: "running",
    },
  };
};

const toResultNode = (
  node: Node,
  runResult: { status: "SUCCESS" | "FAILED"; outputs?: Record<string, unknown>; error?: string } | undefined,
): Node => {
  if (!runResult) {
    return {
      ...node,
      data: {
        ...((node.data ?? {}) as unknown as NodeData),
        status: "idle",
      },
    };
  }

  const previousData = (node.data ?? {}) as unknown as NodeData;
  const nextData: NodeData = {
    ...previousData,
    status: runResult.status === "SUCCESS" ? "success" : "error",
  };

  if (previousData.nodeType === "llmNode" && typeof runResult.outputs?.output === "string") {
    nextData.llmResult = runResult.outputs.output;
    nextData.llmError = undefined;
  }

  if (previousData.nodeType === "llmNode" && runResult.status === "FAILED") {
    nextData.llmResult = "";
    nextData.llmError = runResult.error ?? "LLM node requires a prompt before execution.";
  }

  if (previousData.nodeType === "cropImageNode" && typeof runResult.outputs?.output === "string") {
    nextData.croppedImageUrl = runResult.outputs.output;
  }

  if (previousData.nodeType === "extractFrameNode" && typeof runResult.outputs?.output === "string") {
    nextData.extractedFrameUrl = runResult.outputs.output;
  }

  return {
    ...node,
    data: nextData as unknown as Record<string, unknown>,
  };
};

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

const toResultNode = (
  node: Node,
  runResult: { status: "SUCCESS" | "FAILED"; outputs?: Record<string, unknown>; error?: string } | undefined,
): Node => {
  if (!runResult) {
    return {
      ...node,
      data: {
        ...((node.data ?? {}) as unknown as NodeData),
        status: "idle",
      },
    };
  }

  const previousData = (node.data ?? {}) as unknown as NodeData;
  const nextData: NodeData = {
    ...previousData,
    status: runResult.status === "SUCCESS" ? "success" : "error",
  };

  if (previousData.nodeType === "llmNode" && typeof runResult.outputs?.output === "string") {
    nextData.llmResult = runResult.outputs.output;
    nextData.llmError = undefined;
  }

  if (previousData.nodeType === "llmNode" && runResult.status === "FAILED") {
    nextData.llmResult = "";
    nextData.llmError = runResult.error ?? "LLM node requires a prompt before execution.";
  }

  if (previousData.nodeType === "cropImageNode" && typeof runResult.outputs?.output === "string") {
    nextData.croppedImageUrl = runResult.outputs.output;
  }

  if (previousData.nodeType === "extractFrameNode" && typeof runResult.outputs?.output === "string") {
    nextData.extractedFrameUrl = runResult.outputs.output;
  }

  return {
    ...node,
    data: nextData as unknown as Record<string, unknown>,
  };
};

export const WorkflowShell: FC<WorkflowShellProps> = ({ children }) => {
  const { isLoaded, userId } = useAuth();
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(288);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isWorkflowListOpen, setIsWorkflowListOpen] = useState(false);
  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([]);
  const [isLoadingWorkflowList, setIsLoadingWorkflowList] = useState(false);

  const workflowName = useWorkflowStore((state) => state.workflowName);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId);
  const isSaving = useWorkflowStore((state) => state.isSaving);
  const setIsSaving = useWorkflowStore((state) => state.setIsSaving);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const lastSavedSignatureRef = useRef<string>("");
  const addToast = useToastStore((state) => state.addToast);

  const loadSampleWorkflow = useCallback(() => {
    setWorkflowId(null);
    setWorkflowName(sampleWorkflow.name);
    setNodes(sampleWorkflow.nodes);
    setEdges(sampleWorkflow.edges);
    lastSavedSignatureRef.current = "";
    addToast({
      type: "success",
      title: "Sample workflow loaded",
      message: `${sampleWorkflow.name} is ready on the canvas.`,
    });
  }, [addToast, setEdges, setNodes, setWorkflowId, setWorkflowName]);

  const saveWorkflow = useCallback(async () => {
    if (!isLoaded || !userId) return;

    if (nodes.length === 0 && workflowName.trim() === "Untitled") {
      return;
    }

    setIsSaving(true);

    try {
      const response = await fetch("/api/workflow/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId,
          name: workflowName,
          nodes,
          edges,
        }),
      });

      if (!response.ok) {
        const errorResponse = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorResponse?.error ?? "Failed to save workflow");
      }

      const result = (await response.json()) as SaveResponse;
      setWorkflowId(result.workflowId);
      lastSavedSignatureRef.current = JSON.stringify({ name: workflowName, nodes, edges });
      addToast({
        type: "success",
        title: "Workflow saved",
        message: "Your latest graph changes were persisted.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not persist workflow changes to the database.";
      addToast({
        type: "error",
        title: "Save failed",
        message,
      });
    } finally {
      setIsSaving(false);
    }
  }, [addToast, edges, isLoaded, nodes, setIsSaving, setWorkflowId, userId, workflowId, workflowName]);

  const exportWorkflow = useCallback(async () => {
    if (isExporting) return;

    setIsExporting(true);

    const downloadJson = (payload: unknown, filename: string) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    };

    try {
      if (!workflowId) {
        downloadJson(
          {
            workflow: {
              id: null,
              name: workflowName,
              nodes,
              edges,
            },
          },
          `${workflowName || "nextflow"}.json`,
        );
        addToast({
          type: "info",
          title: "Exported local draft",
          message: "Downloaded current canvas state as JSON.",
        });
        return;
      }

      const response = await fetch(`/api/workflow/export?workflowId=${encodeURIComponent(workflowId)}`);
      if (!response.ok) {
        throw new Error("Failed to export workflow");
      }

      const result = (await response.json()) as ExportResponse;
      downloadJson(result, `${result.workflow.name || workflowName || "nextflow"}.json`);
      addToast({
        type: "success",
        title: "Workflow exported",
        message: "JSON export downloaded successfully.",
      });
    } catch {
      addToast({
        type: "error",
        title: "Export failed",
        message: "Could not create export JSON for this workflow.",
      });
    } finally {
      setIsExporting(false);
    }
  }, [addToast, edges, isExporting, nodes, workflowId, workflowName]);

  const importWorkflow = useCallback(
    async (file: File) => {
      if (isImporting) return;

      setIsImporting(true);

      try {
        const fileText = await file.text();
        const parsed = JSON.parse(fileText) as {
          workflow?: {
            id?: string | null;
            name?: string;
            nodes?: Node[];
            edges?: Edge[];
          };
          id?: string | null;
          name?: string;
          nodes?: Node[];
          edges?: Edge[];
        };

        const workflow = parsed.workflow ?? parsed;
        setWorkflowId(null);
        setWorkflowName(workflow.name ?? "Imported Workflow");
        setNodes(workflow.nodes ?? []);
        setEdges(workflow.edges ?? []);
        lastSavedSignatureRef.current = JSON.stringify({
          name: workflow.name ?? "Imported Workflow",
          nodes: workflow.nodes ?? [],
          edges: workflow.edges ?? [],
        });
        addToast({
          type: "success",
          title: "Workflow imported",
          message: "Imported JSON replaced the current canvas.",
        });
      } catch {
        addToast({
          type: "error",
          title: "Import failed",
          message: "The selected file is not a valid workflow JSON.",
        });
      } finally {
        setIsImporting(false);
      }
    },
    [addToast, isImporting, setEdges, setNodes, setWorkflowId, setWorkflowName],
  );

  const runWorkflow = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);

    const currentNodes = useWorkflowStore.getState().nodes;
    const currentEdges = useWorkflowStore.getState().edges;
    const currentWorkflowId = useWorkflowStore.getState().workflowId;

    try {
      const response = await fetch("/api/execute/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "FULL",
          workflowId: currentWorkflowId,
          nodes: currentNodes,
          edges: currentEdges,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute workflow");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming not supported");

      const decoder = new TextDecoder();
      let buffer = "";
      let failedCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          const event = JSON.parse(jsonStr) as StreamEvent;

          if (event.type === "layer_start") {
            const layerIds = new Set(event.nodeIds);
            const latestNodes = useWorkflowStore.getState().nodes;
            setNodes(
              latestNodes.map((node) => (layerIds.has(node.id) ? toRunningNode(node) : node)),
            );
          } else if (event.type === "node_done") {
            const { nodeResult } = event;
            const latestNodes = useWorkflowStore.getState().nodes;
            setNodes(
              latestNodes.map((node) =>
                node.id === nodeResult.nodeId ? toResultNode(node, nodeResult) : node,
              ),
            );
            if (nodeResult.status === "FAILED") failedCount += 1;
          } else if (event.type === "complete") {
            addToast({
              type: failedCount > 0 ? "info" : "success",
              title: failedCount > 0 ? "Workflow finished with issues" : "Workflow completed",
              message:
                failedCount > 0
                  ? `${failedCount} node${failedCount === 1 ? "" : "s"} failed. Check run history for details.`
                  : "All nodes executed successfully.",
            });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch {
      const latestNodes = useWorkflowStore.getState().nodes;
      setNodes(
        latestNodes.map((node) => ({
          ...node,
          data: {
            ...((node.data ?? {}) as unknown as NodeData),
            status: "error",
          },
        })),
      );
      addToast({
        type: "error",
        title: "Run failed",
        message: "Execution request failed before node results were returned.",
      });
    } finally {
      setIsRunning(false);
    }
  }, [addToast, isRunning, setNodes]);

  const openWorkflowList = useCallback(async () => {
    setIsWorkflowListOpen(true);
    setIsLoadingWorkflowList(true);

    try {
      const response = await fetch("/api/workflow/list");
      if (!response.ok) throw new Error("Failed to load workflow list");
      const data = (await response.json()) as WorkflowListResponse;
      setWorkflowList(data.workflows);
    } catch {
      addToast({
        type: "error",
        title: "Could not load workflows",
        message: "Failed to fetch your saved workflows.",
      });
      setIsWorkflowListOpen(false);
    } finally {
      setIsLoadingWorkflowList(false);
    }
  }, [addToast]);

  const loadWorkflowById = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/workflow/load?workflowId=${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("Failed to load workflow");
        const data = (await response.json()) as WorkflowLoadResponse;
        if (!data.workflow) throw new Error("Workflow not found");

        setWorkflowId(data.workflow.id);
        setWorkflowName(data.workflow.name);
        setNodes(data.workflow.nodes);
        setEdges(data.workflow.edges);
        lastSavedSignatureRef.current = JSON.stringify({
          name: data.workflow.name,
          nodes: data.workflow.nodes,
          edges: data.workflow.edges,
        });
        setIsWorkflowListOpen(false);
        addToast({
          type: "success",
          title: "Workflow loaded",
          message: `"${data.workflow.name}" is ready on the canvas.`,
        });
      } catch {
        addToast({
          type: "error",
          title: "Load failed",
          message: "Could not load the selected workflow.",
        });
      }
    },
    [addToast, setEdges, setNodes, setWorkflowId, setWorkflowName],
  );

  useEffect(() => {
    if (!isLoaded || !userId) return;

    const signature = JSON.stringify({ name: workflowName, nodes, edges });

    if (signature === lastSavedSignatureRef.current) {
      return;
    }

    if (nodes.length === 0 && workflowName.trim() === "Untitled" && !workflowId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveWorkflow();
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [edges, isLoaded, nodes, saveWorkflow, userId, workflowId, workflowName]);

  return (
    <main className="h-screen overflow-hidden bg-(--nf-bg) text-(--nf-text)">
      <ToastViewport />
      <div className="flex h-full">
        <LeftSidebar
          collapsed={leftCollapsed}
          width={leftSidebarWidth}
          onWidthChange={setLeftSidebarWidth}
          onToggle={() => setLeftCollapsed((value) => !value)}
          onLoadSampleWorkflow={loadSampleWorkflow}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <WorkflowPersistence />
          <div className="relative min-h-0 flex-1 overflow-hidden bg-(--nf-bg)">
            {children}
            <TopBar
              workflowName={workflowName}
              onWorkflowNameChange={setWorkflowName}
              onExportWorkflow={exportWorkflow}
              onImportWorkflow={importWorkflow}
              onViewWorkflows={openWorkflowList}
              isExporting={isExporting}
              isImporting={isImporting}
            />
          </div>
        </section>

        <RightSidebar collapsed={rightCollapsed} onToggle={() => setRightCollapsed((value) => !value)} />
      </div>

      {isWorkflowListOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
          onClick={() => setIsWorkflowListOpen(false)}
        >
          <div
            className="w-[min(92vw,480px)] rounded-3xl border border-(--nf-border) bg-(--nf-panel) p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold text-(--nf-text)">My Workflows</h3>
                <p className="mt-1 text-sm text-(--nf-text-secondary)">Select a workflow to load it onto the canvas.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkflowListOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-full border border-(--nf-border) text-(--nf-text-secondary) transition hover:bg-(--nf-hover)"
                aria-label="Close workflow list"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isLoadingWorkflowList ? (
              <div className="flex items-center justify-center py-10 text-sm text-(--nf-text-secondary)">
                Loading…
              </div>
            ) : workflowList.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-(--nf-text-secondary)">
                No saved workflows yet.
              </div>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {workflowList.map((wf) => (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => void loadWorkflowById(wf.id)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-(--nf-hover)"
                  >
                    <span className="truncate text-sm font-medium text-(--nf-text)">{wf.name}</span>
                    <span className="ml-3 flex shrink-0 items-center gap-1 text-[11px] text-(--nf-text-secondary)">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(wf.updatedAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
};
