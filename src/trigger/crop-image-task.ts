import { task } from "@trigger.dev/sdk/v3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStaticPath from "ffmpeg-static";

import { fetchMediaBuffer } from "@/lib/media-utils";
import { uploadBufferToTransloadit } from "@/lib/transloadit-upload";

export interface CropImageTaskPayload {
  imageUrl: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
}

interface CropImageTaskResult {
  imageUrl: string;
  triggerRunId?: string | null;
}

const execFileAsync = promisify(execFile);

const createTempDirectory = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nextflow-crop-"));
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

const clampPercent = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, value));
};

export const runCropImageNode = async (payload: CropImageTaskPayload): Promise<CropImageTaskResult> => {
  if (!payload.imageUrl) {
    throw new Error("CropImageNode requires an input image URL.");
  }

  const { buffer, mimeType } = await fetchMediaBuffer(payload.imageUrl);
  const ffmpegBinary = resolveFfmpegBinary();

  if (!ffmpegBinary) {
    throw new Error("FFmpeg binary not found for crop-image task. Configure FFMPEG_BIN/FFMPEG_PATH or install ffmpeg.");
  }

  const tempDirectory = createTempDirectory();
  const inputPath = path.join(tempDirectory, "input-image");
  const outputPath = path.join(tempDirectory, "cropped.jpg");

  const extensionByMimeType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/bmp": "bmp",
  };

  const extension = extensionByMimeType[mimeType] ?? "jpg";
  const inputWithExtension = `${inputPath}.${extension}`;
  fs.writeFileSync(inputWithExtension, buffer);

  const x = clampPercent(payload.xPercent, 0) / 100;
  const y = clampPercent(payload.yPercent, 0) / 100;
  const width = clampPercent(payload.widthPercent, 100) / 100;
  const height = clampPercent(payload.heightPercent, 100) / 100;

  const cropFilter = `crop=iw*${width}:ih*${height}:iw*${x}:ih*${y}`;

  try {
    await execFileAsync(ffmpegBinary, ["-y", "-i", inputWithExtension, "-vf", cropFilter, outputPath]);
    const croppedBuffer = fs.readFileSync(outputPath);
    const uploadedUrl = await uploadBufferToTransloadit(croppedBuffer, "cropped-image.jpg", "image/jpeg");

    return {
      imageUrl: uploadedUrl,
      triggerRunId: null,
    };
  } finally {
    if (fs.existsSync(inputWithExtension)) fs.unlinkSync(inputWithExtension);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(tempDirectory)) fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const cropImageTask = task({
  id: "crop-image-task",
  run: async (payload: CropImageTaskPayload) => {
    return runCropImageNode(payload);
  },
});
