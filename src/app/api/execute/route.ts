import { auth } from "@clerk/nextjs/server";
import { type Edge, type Node } from "@xyflow/react";
import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { executeWorkflowGraph } from "@/lib/workflow-executor";
import { prisma } from "@/lib/prisma";
import { runCropImageNode } from "@/trigger/crop-image-task";
import { runExtractFrameNode } from "@/trigger/extract-frame-task";
import { runLlmNode } from "@/trigger/llm-task";

const executeWorkflowSchema = z.object({
  workflowId: z.string().optional(),
  scope: z.enum(["FULL", "PARTIAL", "SINGLE"]).default("FULL"),
  nodes: z.array(z.custom<Node>()),
  edges: z.array(z.custom<Edge>()),
});

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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestBody = await request.json();
    const parsed = executeWorkflowSchema.safeParse(requestBody);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const { nodes, edges, workflowId, scope } = parsed.data;

    const executionResult = await executeWorkflowGraph({
      nodes,
      edges,
      runners: {
        runLlm: runLlmNode,
        runCrop: runCropImageNode,
        runExtract: runExtractFrameNode,
      },
    });

    let workflowRunId: string | null = null;

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

        workflowRunId = createdRun.id;

        if (executionResult.nodeRuns.length > 0) {
          await prisma.nodeRun.createMany({
            data: executionResult.nodeRuns.map((nodeRun) => ({
              workflowRunId: createdRun.id,
              nodeId: nodeRun.nodeId,
              nodeType: nodeRun.nodeType,
              nodeLabel: nodeRun.nodeLabel,
              status: nodeRun.status,
              // Inputs are intentionally omitted from persistence to keep history retrieval fast.
              inputs: Prisma.JsonNull,
              outputs: toPrismaJson(sanitizeRunPayload(nodeRun.outputs)),
              error: nodeRun.error ?? null,
              durationMs: nodeRun.durationMs,
              completedAt: new Date(executionResult.completedAt),
              triggerRunId: nodeRun.triggerRunId ?? null,
            })),
          });
        }
      } catch (dbError) {
        const dbErrorMessage = dbError instanceof Error ? dbError.message : "Failed to persist run history";

        return NextResponse.json(
          {
            workflowRunId: null,
            ...executionResult,
            warning: `Execution succeeded but persistence failed: ${dbErrorMessage}`,
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({
      workflowRunId,
      ...executionResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
