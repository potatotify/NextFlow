import { defineConfig } from "@trigger.dev/sdk/v3";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID,
  runtime: "node",
  maxDuration: 300,
  logLevel: "log",
  dirs: ["./src/trigger"],
});
