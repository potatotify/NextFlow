import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { Pool } from "pg";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { sampleWorkflow } from "../src/data/sample-workflow";

const getDatabaseUrl = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envLocalPath = resolve(process.cwd(), ".env.local");
  if (existsSync(envLocalPath)) {
    const envLines = readFileSync(envLocalPath, "utf8").split(/\r?\n/);
    const databaseUrlLine = envLines.find((line) => line.trim().startsWith("DATABASE_URL="));

    if (databaseUrlLine) {
      const [, rawValue = ""] = databaseUrlLine.split("=", 2);
      return rawValue.trim().replace(/^"|"$/g, "");
    }
  }

  throw new Error("DATABASE_URL is required for seeding.");
};

const connectionString = getDatabaseUrl();

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  await prisma.workflow.create({
    data: {
      userId: "sample-seed-user",
      name: sampleWorkflow.name,
      nodes: sampleWorkflow.nodes as unknown as Prisma.InputJsonValue,
      edges: sampleWorkflow.edges as unknown as Prisma.InputJsonValue,
      viewport: sampleWorkflow.viewport as unknown as Prisma.InputJsonValue,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
