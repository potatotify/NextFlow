import { auth } from "@clerk/nextjs/server";
import { runs } from "@trigger.dev/sdk/v3";
import { type Edge, type Node } from "@xyflow/react";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { executeWorkflowGraph, type NodeExecutionResult } from "@/lib/workflow-executor";
import { prisma } from "@/lib/prisma";
import { cropImageTask, type CropImageTaskPayload } from "@/trigger/crop-image-task";
import { extractFrameTask, type ExtractFrameTaskPayload } from "@/trigger/extract-frame-task";
import { llmTask, type LlmTaskPayload } from "@/trigger/llm-task";

export const maxDuration = 300;

const executeStreamSchema = z.object({
  workflowId: z.string().optional(),
  scope: z.enum(["FULL", "PARTIAL", "SINGLE"]).default("FULL"),
  nodes: z.array(z.custom<Node>()),
  edges: z.array(z.custom<Edge>()),
});

const triggerPollIntervalMs = Number(process.env.NEXTFLOW_TRIGGER_POLL_INTERVAL_MS ?? 1000);
const triggerRunTimeoutMs = Number(process.env.NEXTFLOW_TRIGGER_RUN_TIMEOUT_MS ?? 120000);
const triggerQueuedWarningMs = Number(process.env.NEXTFLOW_TRIGGER_QUEUE_WARNING_MS ?? 20000);

interface TriggerTaskLike<TPayload> {
  trigger: (payload: TPayload) => Promise<{ id: string }>;
}

const isLikelyDevTriggerSecret = (secret: string | undefined): boolean => {
  return typeof secret === "string" && secret.trim().startsWith("tr_dev_");
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const runViaTriggerTask = async <TPayload, TResult extends object>(
  taskId: string,
  task: TriggerTaskLike<TPayload>,
  payload: TPayload,
): Promise<TResult & { triggerRunId?: string | null }> => {
  const triggerSecret = process.env.TRIGGER_SECRET_KEY;
  const triggerProjectId = process.env.TRIGGER_PROJECT_ID;

  if (!triggerSecret || !triggerProjectId) {
    throw new Error(
      `Trigger.dev is required for ${taskId}. Configure TRIGGER_SECRET_KEY and TRIGGER_PROJECT_ID, then run trigger.dev worker/deploy.`,
    );
  }

  if (process.env.NODE_ENV === "production" && isLikelyDevTriggerSecret(triggerSecret)) {
    throw new Error(
      `Trigger.dev key mismatch for ${taskId}: this deployment is running with a development Trigger secret (tr_dev_*). Use a production Trigger secret (tr_prod_*) for deployed workflows.`,
    );
  }

  const runHandle = await task.trigger(payload);

  const startedAt = Date.now();
  while (Date.now() - startedAt < triggerRunTimeoutMs) {
    const run = await runs.retrieve(runHandle.id);

    if (run.status === "EXPIRED") {
      throw new Error(
        `${taskId} run ${run.id} expired before execution. This usually means no active Trigger worker is consuming this environment's queue.`,
      );
    }

    if (run.isCompleted) {
      if (!run.isSuccess) {
        const errorMessage = run.error?.message ?? "Unknown Trigger.dev task failure";
        throw new Error(`${taskId} run ${run.id} failed: ${errorMessage}`);
      }

      return {
        ...(run.output as TResult),
        triggerRunId: run.id,
      };
    }

    if (run.isQueued && Date.now() - startedAt > triggerQueuedWarningMs) {
      throw new Error(
        `${taskId} run ${run.id} stayed queued for too long. Ensure Trigger workers are deployed to the same environment as TRIGGER_SECRET_KEY.`,
      );
    }

    await sleep(Math.max(250, triggerPollIntervalMs));
  }

  throw new Error(
    `${taskId} run ${runHandle.id} timed out after ${triggerRunTimeoutMs}ms while waiting for Trigger.dev completion.`,
  );
};

const toPrismaJson = (
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value == null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
};

const MAX_STRING_LENGTH = 2048;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 3;

const sanitizeString = (value: string): string => {
  if (value.startsWith("data:")) {
    const mimeType = value.slice(5, value.indexOf(";") > -1 ? value.indexOf(";") : undefined) || "unknown";
    return `[data-url:${mimeType};length=${value.length}]`;
  }

  if (value.length > MAX_STRING_LENGTH) {
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated:${value.length - MAX_STRING_LENGTH}]`;
  }

  return value;
};

const sanitizeJsonValue = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_DEPTH) {
    return "[depth-limited]";
  }

  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeJsonValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeJsonValue(item, depth + 1)]));
  }

  return String(value);
};

const sanitizeRunPayload = (value: Record<string, unknown> | null | undefined): Record<string, unknown> | null => {
  if (!value) return null;
  return sanitizeJsonValue(value) as Record<string, unknown>;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsedData: { nodes: Node[]; edges: Edge[]; workflowId?: string; scope: "FULL" | "PARTIAL" | "SINGLE" };

  try {
    const requestBody = await request.json();
    const parsed = executeStreamSchema.safeParse(requestBody);

    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request payload" }), { status: 400 });
    }

    parsedData = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { nodes, edges, workflowId, scope } = parsedData;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const cancelled = { value: false };

      request.signal.addEventListener("abort", () => {
        cancelled.value = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      const sendEvent = (data: object) => {
        if (cancelled.value) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      try {
        const executionResult = await executeWorkflowGraph({
          nodes,
          edges,
          runners: {
            runLlm: (payload) =>
              runViaTriggerTask<LlmTaskPayload, { text: string }>("llm-task", llmTask, payload),
            runCrop: (payload) =>
              runViaTriggerTask<CropImageTaskPayload, { imageUrl: string }>("crop-image-task", cropImageTask, payload),
            runExtract: (payload) =>
              runViaTriggerTask<ExtractFrameTaskPayload, { imageUrl: string }>(
                "extract-frame-task",
                extractFrameTask,
                payload,
              ),
          },
          onLayerStart: (nodeIds) => {
            sendEvent({ type: "layer_start", nodeIds });
          },
          onNodeComplete: (nodeResult: NodeExecutionResult) => {
            sendEvent({ type: "node_done", nodeResult });
          },
        });

        // Persist run history if a saved workflow
        if (workflowId) {
          try {
            const createdRun = await prisma.workflowRun.create({
              data: {
                workflowId,
                userId,
                scope,
                status: executionResult.status,
                startedAt: new Date(executionResult.startedAt),
                completedAt: new Date(executionResult.completedAt),
                durationMs: executionResult.durationMs,
              },
            });

            if (executionResult.nodeRuns.length > 0) {
              await prisma.nodeRun.createMany({
                data: executionResult.nodeRuns.map((nodeRun) => ({
                  workflowRunId: createdRun.id,
                  nodeId: nodeRun.nodeId,
                  nodeType: nodeRun.nodeType,
                  nodeLabel: nodeRun.nodeLabel,
                  status: nodeRun.status,
                  inputs: Prisma.JsonNull,
                  outputs: toPrismaJson(sanitizeRunPayload(nodeRun.outputs)),
                  error: nodeRun.error ?? null,
                  durationMs: nodeRun.durationMs,
                  completedAt: new Date(executionResult.completedAt),
                  triggerRunId: nodeRun.triggerRunId ?? null,
                })),
              });
            }
          } catch {
            // Non-fatal: execution succeeded, persistence failed
          }
        }

        sendEvent({ type: "complete", result: executionResult });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Execution failed";
        sendEvent({ type: "error", message });
      } finally {
        if (!cancelled.value) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
