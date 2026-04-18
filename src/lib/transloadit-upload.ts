import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Transloadit } from "transloadit";

type TransloaditResultFile = {
  ssl_url?: string | null;
  url?: string | null;
};

type TransloaditAssemblyStatus = {
  uploads?: Record<string, TransloaditResultFile[] | undefined>;
  results?: Record<string, TransloaditResultFile[] | undefined>;
};

const createTempDirectory = (): string => {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nextflow-transloadit-"));
};

const getTransloaditClient = (): Transloadit => {
  const authKey = process.env.NEXT_PUBLIC_TRANSLOADIT_KEY?.trim();
  const authSecret = process.env.TRANSLOADIT_SECRET?.trim();

  if (!authKey) {
    throw new Error("Missing NEXT_PUBLIC_TRANSLOADIT_KEY for Transloadit uploads.");
  }

  if (!authSecret) {
    throw new Error("Missing TRANSLOADIT_SECRET for Transloadit uploads.");
  }

  return new Transloadit({
    authKey,
    authSecret,
  });
};

const getFirstFileUrl = (file: TransloaditResultFile | undefined): string | null => {
  if (!file) return null;
  return file.ssl_url ?? file.url ?? null;
};

const extractAssemblyFileUrl = (
  status: TransloaditAssemblyStatus,
  preferredStepNames: string[] = [],
): string | null => {
  for (const stepName of preferredStepNames) {
    const stepResult = status.results?.[stepName]?.[0];
    const url = getFirstFileUrl(stepResult);
    if (url) return url;
  }

  if (status.results) {
    for (const stepResult of Object.values(status.results)) {
      const url = getFirstFileUrl(stepResult?.[0]);
      if (url) return url;
    }
  }

  if (status.uploads) {
    for (const uploadResult of Object.values(status.uploads)) {
      const url = getFirstFileUrl(uploadResult?.[0]);
      if (url) return url;
    }
  }

  return null;
};

const writeTempBuffer = (buffer: Buffer, filename: string): { tempDirectory: string; inputPath: string } => {
  const tempDirectory = createTempDirectory();
  const inputPath = path.join(tempDirectory, filename);
  fs.writeFileSync(inputPath, buffer);

  return { tempDirectory, inputPath };
};

export const uploadBufferToTransloadit = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> => {
  const { tempDirectory, inputPath } = writeTempBuffer(buffer, filename);

  try {
    const client = getTransloaditClient();
    const status = (await client.createAssembly({
      waitForCompletion: true,
      files: {
        input: inputPath,
      },
      params: {
        steps: {
          ":original": {
            robot: "/upload/handle",
            result: true,
          },
        },
      },
    })) as TransloaditAssemblyStatus;

    const uploadedUrl = extractAssemblyFileUrl(status, [":original", "exported"]);

    if (!uploadedUrl) {
      throw new Error("Transloadit did not return a file URL for the processed output.");
    }

    return uploadedUrl;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(tempDirectory)) fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const extractFrameFromVideoWithTransloadit = async (
  buffer: Buffer,
  filename: string,
  timestampSeconds: number,
): Promise<string> => {
  const { tempDirectory, inputPath } = writeTempBuffer(buffer, filename);

  try {
    const client = getTransloaditClient();
    const safeTimestamp = Number.isFinite(timestampSeconds) && timestampSeconds >= 0 ? timestampSeconds : 0;
    const status = (await client.createAssembly({
      waitForCompletion: true,
      files: {
        input: inputPath,
      },
      params: {
        steps: {
          ":original": {
            robot: "/upload/handle",
          },
          thumbnailed: {
            use: ":original",
            robot: "/video/thumbs",
            offsets: [safeTimestamp],
            format: "jpg",
            result: true,
            ffmpeg_stack: "v6",
          },
        },
      },
    })) as TransloaditAssemblyStatus;

    const extractedUrl = extractAssemblyFileUrl(status, ["thumbnailed"]);

    if (!extractedUrl) {
      throw new Error("Transloadit did not return a frame URL for Extract Frame output.");
    }

    return extractedUrl;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(tempDirectory)) fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};