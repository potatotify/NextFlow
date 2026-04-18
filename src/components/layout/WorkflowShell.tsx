"use client";

import { useAuth } from "@clerk/nextjs";
import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from "react";

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

interface ExecuteResponse {
  nodeRuns?: Array<{
    nodeId: string;
    status: "SUCCESS" | "FAILED";
    outputs?: Record<string, unknown>;
  }>;
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

export const WorkflowShell: FC<WorkflowShellProps> = ({ children }) => {
  const { isLoaded, userId } = useAuth();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(288);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
    setNodes(nodes.map(toRunningNode));

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "FULL",
          workflowId,
          nodes,
          edges,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute workflow");
      }

      const result = (await response.json()) as ExecuteResponse;
      const runResultsByNodeId = new Map(result.nodeRuns?.map((run) => [run.nodeId, run]));

      const latestNodes = useWorkflowStore.getState().nodes;
      setNodes(latestNodes.map((node) => toResultNode(node, runResultsByNodeId.get(node.id))));
      const failedCount = result.nodeRuns?.filter((run) => run.status === "FAILED").length ?? 0;
      addToast({
        type: failedCount > 0 ? "info" : "success",
        title: failedCount > 0 ? "Workflow finished with issues" : "Workflow completed",
        message:
          failedCount > 0
            ? `${failedCount} node${failedCount === 1 ? "" : "s"} failed. Check run history for details.`
            : "All nodes executed successfully.",
      });
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
  }, [addToast, edges, isRunning, nodes, setNodes, workflowId]);

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
          <div className="relative min-h-0 flex-1 overflow-hidden bg-[#101010]">
            {children}
            <TopBar
              workflowName={workflowName}
              onWorkflowNameChange={setWorkflowName}
              onExportWorkflow={exportWorkflow}
              onImportWorkflow={importWorkflow}
              isExporting={isExporting}
              isImporting={isImporting}
            />
          </div>
        </section>

        <RightSidebar collapsed={rightCollapsed} onToggle={() => setRightCollapsed((value) => !value)} />
      </div>
    </main>
  );
};
