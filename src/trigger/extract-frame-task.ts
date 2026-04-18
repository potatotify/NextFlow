import { task } from "@trigger.dev/sdk/v3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";

import { fetchMediaBuffer } from "@/lib/media-utils";
import { extractFrameFromVideoWithTransloadit, uploadBufferToTransloadit } from "@/lib/transloadit-upload";

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
    const ffmpegPath = result.trim().split("\n")[0];
    if (ffmpegPath && fileExists(ffmpegPath)) {
      return ffmpegPath;
    }
  } catch {
    // Command not found or other error
  }

  return null;
};

const resolveFfmpegBinary = (): string | null => {
  const envBinary = process.env.FFMPEG_BIN?.trim() || process.env.FFMPEG_PATH?.trim();
  if (envBinary && fileExists(envBinary)) {
    console.log(`[ffmpeg] Using env binary: ${envBinary}`);
    return envBinary;
  }

  const staticBinary = typeof ffmpegStaticPath === "string" ? ffmpegStaticPath.trim() : "";
  if (staticBinary && fileExists(staticBinary)) {
    console.log(`[ffmpeg] Using ffmpeg-static: ${staticBinary}`);
    return staticBinary;
  }

  const pathBinary = findFfmpegInPath();
  if (pathBinary) {
    console.log(`[ffmpeg] Found in PATH: ${pathBinary}`);
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
    const fallbackUrl = await extractFrameFromVideoWithTransloadit(
      buffer,
      "extract-frame-fallback-input.mp4",
      timestamp,
    );

    return {
      imageUrl: fallbackUrl,
      triggerRunId: null,
    };
  }

  console.log(`[extract-frame] Using ffmpeg binary: ${ffmpegBinary}`);

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

    console.log(`[extract-frame] Running: ${ffmpegBinary} ${args.join(" ")}`);

    await execFileAsync(ffmpegBinary, args);

    const frameBuffer = fs.readFileSync(outputPath);
    const uploadedUrl = await uploadBufferToTransloadit(frameBuffer, "extracted-frame.jpg", "image/jpeg");

    return {
      imageUrl: uploadedUrl,
      triggerRunId: null,
    };
  } catch (error) {
    const err = error instanceof Error ? error.message : String(error);
    console.error(`[extract-frame] Error: ${err}`);

    if (err.includes("ENOENT") || err.includes("not found")) {
      const fallbackUrl = await extractFrameFromVideoWithTransloadit(
        buffer,
        "extract-frame-fallback-input.mp4",
        timestamp,
      );

      return {
        imageUrl: fallbackUrl,
        triggerRunId: null,
      };
    }

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
