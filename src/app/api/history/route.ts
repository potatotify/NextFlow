import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");

    const runs = await prisma.workflowRun.findMany({
      where: {
        userId,
        ...(workflowId ? { workflowId } : {}),
      },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        workflowId: true,
        status: true,
        scope: true,
        startedAt: true,
        completedAt: true,
        durationMs: true,
        workflow: {
          select: { name: true },
        },
        nodeRuns: {
          orderBy: { startedAt: "asc" },
          select: {
            id: true,
            nodeId: true,
            nodeType: true,
            nodeLabel: true,
            status: true,
            error: true,
            durationMs: true,
            outputs: true,
          },
        },
      },
    });

    return NextResponse.json({
      runs: runs.map((run) => ({
        id: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflow.name,
        status: run.status,
        scope: run.scope,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        durationMs: run.durationMs,
        nodeCount: run.nodeRuns.length,
        nodeRuns: run.nodeRuns.map((nodeRun) => ({
          id: nodeRun.id,
          nodeId: nodeRun.nodeId,
          nodeType: nodeRun.nodeType,
          nodeLabel: nodeRun.nodeLabel,
          status: nodeRun.status,
          error: nodeRun.error,
          durationMs: nodeRun.durationMs,
          outputs: (nodeRun.outputs as Record<string, unknown> | null) ?? null,
        })),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const workflowId = searchParams.get("workflowId");
    const runId = searchParams.get("runId");

    if (runId) {
      const deleteResult = await prisma.workflowRun.deleteMany({
        where: {
          userId,
          id: runId,
        },
      });

      return NextResponse.json({ deletedCount: deleteResult.count });
    }

    if (!workflowId) {
      return NextResponse.json({ error: "workflowId or runId is required" }, { status: 400 });
    }

    const deleteResult = await prisma.workflowRun.deleteMany({
      where: {
        userId,
        workflowId,
      },
    });

    return NextResponse.json({ deletedCount: deleteResult.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
