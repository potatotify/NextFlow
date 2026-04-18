import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

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

  throw new Error("DATABASE_URL is not configured. Set it in environment variables or .env.local.");
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: getDatabaseUrl(),
  },
});
