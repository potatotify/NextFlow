import { defineConfig } from "@trigger.dev/sdk/v3";
import { ffmpeg, syncEnvVars } from "@trigger.dev/build/extensions/core";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const syncedEnvVars = [
  "GEMINI_API_KEY",
  "NEXT_PUBLIC_TRANSLOADIT_KEY",
  "TRANSLOADIT_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "TRIGGER_SECRET_KEY",
]
  .map((name) => {
    const value = process.env[name]?.trim();
    return value ? { name, value } : null;
  })
  .filter((entry): entry is { name: string; value: string } => entry !== null);

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID!,
  runtime: "node",
  maxDuration: 300,
  logLevel: "log",
  build: {
    extensions: [
      ffmpeg(),
      syncEnvVars(() => syncedEnvVars, { override: true }),
    ],
  },
  dirs: ["./src/trigger"],
});
