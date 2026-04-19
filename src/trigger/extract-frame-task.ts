import { task } from "@trigger.dev/sdk/v3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";

import { fetchMediaBuffer } from "@/lib/media-utils";
import { uploadBufferToTransloadit } from "@/lib/transloadit-upload";

export interface ExtractFrameTaskPayload {
  videoUrl: string;
  timestamp: number;
}

interface ExtractFrameTaskResult {
  imageUrl: string;
  triggerRunId?: string | null;
}

const execFileAsync = promisify(execFile);

const createTempDirectory = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nextflow-frame-"));
};

const isWindows = (): boolean => process.platform === "win32";

const fileExists = (filePath: string): boolean => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const findFfmpegInPath = (): string | null => {
  const isWin = isWindows();

  try {
    const result = execFileSync(isWin ? "where" : "which", ["ffmpeg"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const ffmpegPath = result.trim().split(/\r?\n/)[0];
    if (ffmpegPath && fileExists(ffmpegPath)) {
      return ffmpegPath;
    }
  } catch {
    // Command not found or other error
  }

  return null;
};

const findFfmpegFromNodeModules = (): string | null => {
  const binaryName = isWindows() ? "ffmpeg.exe" : "ffmpeg";

  const directCandidate = path.join(process.cwd(), "node_modules", "ffmpeg-static", binaryName);
  if (fileExists(directCandidate)) {
    return directCandidate;
  }

  const pnpmStorePath = path.join(process.cwd(), "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmStorePath)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(pnpmStorePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("ffmpeg-static@")) continue;

      const candidate = path.join(
        pnpmStorePath,
        entry.name,
        "node_modules",
        "ffmpeg-static",
        binaryName,
      );

      if (fileExists(candidate)) {
        return candidate;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getFfmpegStaticBinary = (): string => {
  const candidate = ffmpegStaticPath as unknown;

  if (typeof candidate === "string") {
    return candidate.trim();
  }

  if (
    candidate &&
    typeof candidate === "object" &&
    "default" in candidate &&
    typeof (candidate as { default?: unknown }).default === "string"
  ) {
    return ((candidate as { default: string }).default ?? "").trim();
  }

  return "";
};

const getFfmpegInstallerBinary = (): string => {
  try {
    const runtimeRequire = (0, eval)("require") as NodeRequire;
    const candidate = runtimeRequire("@ffmpeg-installer/ffmpeg") as { path?: unknown } | undefined;
    if (candidate && typeof candidate.path === "string") {
      return candidate.path.trim();
    }
  } catch {
    // Optional runtime fallback not available.
  }

  return "";
};

const resolveFfmpegBinary = (): string | null => {
  const envBinary = process.env.FFMPEG_BIN?.trim() || process.env.FFMPEG_PATH?.trim();
  if (envBinary && fileExists(envBinary)) {
    return envBinary;
  }

  const staticBinary = getFfmpegStaticBinary();
  if (staticBinary && fileExists(staticBinary)) {
    return staticBinary;
  }

  const installerBinary = getFfmpegInstallerBinary();
  if (installerBinary && fileExists(installerBinary)) {
    return installerBinary;
  }

  const nodeModulesBinary = findFfmpegFromNodeModules();
  if (nodeModulesBinary) {
    return nodeModulesBinary;
  }

  const pathBinary = findFfmpegInPath();
  if (pathBinary) {
    return pathBinary;
  }

  return null;
};

const extensionByMimeType: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/mpeg": "mpeg",
  "video/ogg": "ogv",
};

export const runExtractFrameNode = async (payload: ExtractFrameTaskPayload): Promise<ExtractFrameTaskResult> => {
  if (!payload.videoUrl) {
    throw new Error("ExtractFrameNode requires an input video URL.");
  }

  const { buffer, mimeType } = await fetchMediaBuffer(payload.videoUrl);
  const timestamp = Number.isFinite(payload.timestamp) && payload.timestamp >= 0 ? payload.timestamp : 0;
  const ffmpegBinary = resolveFfmpegBinary();

  if (!ffmpegBinary) {
    throw new Error(
      "FFmpeg binary not found for extract-frame task. Configure FFMPEG_BIN/FFMPEG_PATH or install ffmpeg.",
    );
  }

  const tempDirectory = createTempDirectory();
  const fileExtension = extensionByMimeType[mimeType] ?? "mp4";
  const inputPath = path.join(tempDirectory, `input-video.${fileExtension}`);
  const outputPath = path.join(tempDirectory, "frame.jpg");

  fs.writeFileSync(inputPath, buffer);

  try {
    const args = [
      "-y",
      "-ss",
      String(timestamp),
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ];

    await execFileAsync(ffmpegBinary, args);

    const frameBuffer = fs.readFileSync(outputPath);
    const uploadedUrl = await uploadBufferToTransloadit(frameBuffer, "extracted-frame.jpg", "image/jpeg");

    return {
      imageUrl: uploadedUrl,
      triggerRunId: null,
    };
  } catch (error) {
    throw error;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(tempDirectory)) fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const extractFrameTask = task({
  id: "extract-frame-task",
  run: async (payload: ExtractFrameTaskPayload) => {
    return runExtractFrameNode(payload);
  },
});
