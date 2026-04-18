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

    if (workflowId) {
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          userId,
        },
      });

      if (!workflow) {
        return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
      }

      return NextResponse.json({ workflow });
    }

    const latestWorkflow = await prisma.workflow.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ workflow: latestWorkflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load workflow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
