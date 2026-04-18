"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import type { Edge, Node } from "@xyflow/react";

import { useWorkflowStore } from "@/store/workflow-store";

interface WorkflowPersistenceProps {
  children?: never;
}

interface LoadResponse {
  workflow: {
    id: string;
    name: string;
    nodes: Node[];
    edges: Edge[];
    viewport?: { x: number; y: number; zoom: number } | null;
  } | null;
}

export const WorkflowPersistence = (_props: WorkflowPersistenceProps) => {
  const { isLoaded, userId } = useAuth();
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const setWorkflowId = useWorkflowStore((state) => state.setWorkflowId);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const setNodes = useWorkflowStore((state) => state.setNodes);
  const setEdges = useWorkflowStore((state) => state.setEdges);
  const setIsSaving = useWorkflowStore((state) => state.setIsSaving);

  useEffect(() => {
    if (!isLoaded || !userId) return;

    let isMounted = true;

    const loadWorkflow = async () => {
      try {
        const response = await fetch("/api/workflow/load", {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) return;

        const data = (await response.json()) as LoadResponse;
        if (!isMounted || !data.workflow) return;

        setWorkflowId(data.workflow.id);
        setWorkflowName(data.workflow.name);
        setNodes(data.workflow.nodes);
        setEdges(data.workflow.edges);
      } catch {
        // Intentionally silent: user can still build a new workflow locally.
      }
    };

    void loadWorkflow();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, setEdges, setNodes, setWorkflowId, setWorkflowName, userId]);

  useEffect(() => {
    if (!isLoaded || !userId) return;

    const handleBeforeUnload = () => {
      if (!workflowId || nodes.length === 0) return;

      const payload = JSON.stringify({
        workflowId,
        name: workflowName,
        nodes,
        edges,
      });

      navigator.sendBeacon("/api/workflow/save", new Blob([payload], { type: "application/json" }));
      setIsSaving(false);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [edges, isLoaded, nodes, setIsSaving, userId, workflowId, workflowName]);

  return null;
};
