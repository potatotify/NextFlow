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
  | {
      type: "layer_start";
      nodeIds: string[];
    }
  | {
      type: "node_done";
      nodeResult: {
        nodeId: string;
        status: "SUCCESS" | "FAILED";
        outputs?: Record<string, unknown>;
        error?: string;
      };
    }
  | {
      type: "complete";
      result: {
        nodeRuns: Array<{
          nodeId: string;
          status: "SUCCESS" | "FAILED";
        }>;
      };
    }
  | {
      type: "error";
      message: string;
    };

const toRunningNode = (node: Node): Node => {
  // Fix: Cast through unknown to bypass Record to NodeData overlap error
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
  runResult:
    | {
        status: "SUCCESS" | "FAILED";
        outputs?: Record<string, unknown>;
        error?: string;
      }
    | undefined,
): Node => {
  if (!runResult) {
    return {
      ...node,
      data: {
        // Fix: Cast through unknown to satisfy TS strictness during deployment
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

  if (
    previousData.nodeType === "llmNode" &&
    typeof runResult.outputs?.output === "string"
  ) {
    nextData.llmResult = runResult.outputs.output;
    nextData.llmError = undefined;
  }

  if (
    previousData.nodeType === "llmNode" &&
    runResult.status === "FAILED"
  ) {
    nextData.llmResult = "";
    nextData.llmError =
      runResult.error ?? "LLM node requires a prompt before execution.";
  }

  if (
    previousData.nodeType === "cropImageNode" &&
    typeof runResult.outputs?.output === "string"
  ) {
    nextData.croppedImageUrl = runResult.outputs.output;
  }

  if (
    previousData.nodeType === "extractFrameNode" &&
    typeof runResult.outputs?.output === "string"
  ) {
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

  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);

  const workflowId = useWorkflowStore((s) => s.workflowId);
  const setWorkflowId = useWorkflowStore((s) => s.setWorkflowId);

  const setIsSaving = useWorkflowStore((s) => s.setIsSaving);

  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);

  const setNodes = useWorkflowStore((s) => s.setNodes);
  const setEdges = useWorkflowStore((s) => s.setEdges);

  const addToast = useToastStore((s) => s.addToast);

  const lastSavedSignatureRef = useRef("");

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

    if (nodes.length === 0 && workflowName.trim() === "Untitled") return;

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
        const errorResponse = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(errorResponse?.error ?? "Failed to save workflow");
      }

      const result = (await response.json()) as SaveResponse;

      setWorkflowId(result.workflowId);

      lastSavedSignatureRef.current = JSON.stringify({
        name: workflowName,
        nodes,
        edges,
      });

      addToast({
        type: "success",
        title: "Workflow saved",
        message: "Your latest graph changes were persisted.",
      });
    } catch (error) {
      addToast({
        type: "error",
        title: "Save failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not persist workflow changes.",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    edges,
    nodes,
    userId,
    isLoaded,
    workflowId,
    workflowName,
    addToast,
    setWorkflowId,
    setIsSaving,
  ]);

  const exportWorkflow = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);

    const downloadJson = (payload: unknown, filename: string) => {
      const blob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();

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

        return;
      }

      const response = await fetch(
        `/api/workflow/export?workflowId=${encodeURIComponent(workflowId)}`
      );

      if (!response.ok) throw new Error("Export failed");

      const result = (await response.json()) as ExportResponse;

      downloadJson(
        result,
        `${result.workflow.name || workflowName || "nextflow"}.json`
      );
    } finally {
      setIsExporting(false);
    }
  }, [edges, nodes, workflowId, workflowName, isExporting]);

  const importWorkflow = useCallback(
    async (file: File) => {
      if (isImporting) return;

      setIsImporting(true);

      try {
        const parsed = JSON.parse(await file.text());

        const workflow = parsed.workflow ?? parsed;

        setWorkflowId(null);
        setWorkflowName(workflow.name ?? "Imported Workflow");
        setNodes(workflow.nodes ?? []);
        setEdges(workflow.edges ?? []);
      } finally {
        setIsImporting(false);
      }
    },
    [isImporting, setEdges, setNodes, setWorkflowId, setWorkflowName],
  );

  const runWorkflow = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);

    try {
      const currentNodes = useWorkflowStore.getState().nodes;
      const currentEdges = useWorkflowStore.getState().edges;
      const currentWorkflowId = useWorkflowStore.getState().workflowId;

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

      if (!response.ok) throw new Error("Failed to execute");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();

      let buffer = "";
      let failedCount = 0;

      while (true) {
        const {done,value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value,{stream:true});

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const event = JSON.parse(line.slice(6).trim()) as StreamEvent;

          if (event.type==="layer_start"){
            const ids=new Set(event.nodeIds);

            setNodes(
              useWorkflowStore.getState().nodes.map(n=>
                ids.has(n.id)?toRunningNode(n):n
              )
            );
          }

          if(event.type==="node_done"){
            setNodes(
              useWorkflowStore.getState().nodes.map(n=>
                n.id===event.nodeResult.nodeId
                ? toResultNode(n,event.nodeResult)
                : n
              )
            );

            if(event.nodeResult.status==="FAILED"){
              failedCount++;
            }
          }

          if(event.type==="complete"){
            addToast({
              type: failedCount ? "info":"success",
              title: failedCount
                ? "Workflow finished with issues"
                : "Workflow completed",
              message: failedCount
                ? `${failedCount} node(s) failed`
                : "All nodes executed successfully."
            });
          }

          if(event.type==="error"){
            throw new Error(event.message);
          }
        }
      }

    } catch {
      addToast({
        type:"error",
        title:"Run failed",
        message:"Execution failed."
      });
    } finally{
      setIsRunning(false);
    }
  },[addToast,isRunning,setNodes]);

  const openWorkflowList = useCallback(async ()=>{
    setIsWorkflowListOpen(true);
    setIsLoadingWorkflowList(true);

    try{
      const response=await fetch("/api/workflow/list");
      const data=(await response.json()) as WorkflowListResponse;
      setWorkflowList(data.workflows);
    } finally{
      setIsLoadingWorkflowList(false);
    }
  },[]);

  const loadWorkflowById = useCallback(async(id:string)=>{
    const response=await fetch(
      `/api/workflow/load?workflowId=${encodeURIComponent(id)}`
    );

    const data=(await response.json()) as WorkflowLoadResponse;

    if(!data.workflow) return;

    setWorkflowId(data.workflow.id);
    setWorkflowName(data.workflow.name);
    setNodes(data.workflow.nodes);
    setEdges(data.workflow.edges);

    setIsWorkflowListOpen(false);
  },[setEdges,setNodes,setWorkflowId,setWorkflowName]);

  useEffect(()=>{
    if(!isLoaded || !userId) return;

    const signature=JSON.stringify({
      name:workflowName,
      nodes,
      edges
    });

    if(signature===lastSavedSignatureRef.current) return;

    const t=window.setTimeout(()=>{
      void saveWorkflow();
    },2000);

    return ()=>window.clearTimeout(t);

  },[
    edges,
    nodes,
    isLoaded,
    userId,
    workflowName,
    saveWorkflow
  ]);

  return (
    <main className="h-screen overflow-hidden bg-(--nf-bg) text-(--nf-text)">
      <ToastViewport />

      <div className="flex h-full">
        <LeftSidebar
          collapsed={leftCollapsed}
          width={leftSidebarWidth}
          onWidthChange={setLeftSidebarWidth}
          onToggle={()=>setLeftCollapsed(v=>!v)}
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
              // Added missing run handler if needed by your TopBar
              onRunWorkflow={runWorkflow}
              isRunning={isRunning}
            />
          </div>
        </section>

        <RightSidebar
          collapsed={rightCollapsed}
          onToggle={()=>setRightCollapsed(v=>!v)}
        />
      </div>

      {isWorkflowListOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
          onClick={()=>setIsWorkflowListOpen(false)}
        >
          <div
            className="w-[min(92vw,480px)] rounded-3xl p-6 bg-[#121212] border border-white/10"
            onClick={(e)=>e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-semibold">
                  My Workflows
                </h3>
              </div>

              <button onClick={()=>setIsWorkflowListOpen(false)}>
                <X className="h-4 w-4"/>
              </button>
            </div>

            {isLoadingWorkflowList ? (
              <div className="py-10 text-center text-sm text-neutral-500">Loading...</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {workflowList.length === 0 ? (
                  <div className="py-10 text-center text-sm text-neutral-500">No workflows found.</div>
                ) : (
                  workflowList.map((wf)=>(
                    <button
                      key={wf.id}
                      onClick={()=>void loadWorkflowById(wf.id)}
                      className="flex w-full items-center justify-between py-3 px-2 hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <span>{wf.name}</span>

                      <span className="flex items-center gap-1 text-xs text-neutral-400">
                        <Clock className="h-3 w-3"/>
                        {formatRelativeTime(wf.updatedAt)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
