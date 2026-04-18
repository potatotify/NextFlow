import { auth } from "@clerk/nextjs/server";
import { type Edge, type Node } from "@xyflow/react";
import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const workflowSaveSchema = z.object({
  workflowId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  nodes: z.array(z.custom<Node>()),
  edges: z.array(z.custom<Edge>()),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional().nullable(),
});

const toPrismaJson = (value: unknown): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue;
};

const toNullablePrismaJson = (value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput => {
  if (value == null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestBody = await request.json();
    const parsed = workflowSaveSchema.safeParse(requestBody);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const { workflowId, name, nodes, edges, viewport } = parsed.data;

    const existingWorkflow = workflowId
      ? await prisma.workflow.findFirst({
          where: {
            id: workflowId,
            userId,
          },
        })
      : null;

    const persistedWorkflow = existingWorkflow
      ? await prisma.workflow.update({
          where: {
            id: existingWorkflow.id,
          },
          data: {
            name,
            nodes: toPrismaJson(nodes),
            edges: toPrismaJson(edges),
            viewport: toNullablePrismaJson(viewport),
          },
        })
      : await prisma.workflow.create({
          data: {
            userId,
            name,
            nodes: toPrismaJson(nodes),
            edges: toPrismaJson(edges),
            viewport: toNullablePrismaJson(viewport),
          },
        });

    return NextResponse.json({
      workflowId: persistedWorkflow.id,
      name: persistedWorkflow.name,
      nodes: persistedWorkflow.nodes,
      edges: persistedWorkflow.edges,
      viewport: persistedWorkflow.viewport,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save workflow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
