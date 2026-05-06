import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { Transloadit } from "transloadit";

type TransloaditResultFile = {
  ssl_url?: string | null;
  url?: string | null;
};

type TransloaditAssemblyStatus = {
  uploads?: Record<string, TransloaditResultFile[] | undefined>;
  results?: Record<string, TransloaditResultFile[] | undefined>;
  upload_urls?: Record<string, string | undefined>;
  assembly_id?: string | null;
  assembly_url?: string | null;
  assembly_ssl_url?: string | null;
  error?: string | null;
  ok?: string | null;
};

type VideoUploadSession = {
  assemblyId: string;
  assemblyUrl: string;
  uploadUrl: string;
  fieldName: string;
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

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const writeTempBuffer = (buffer: Buffer, filename: string): { tempDirectory: string; inputPath: string } => {
  const tempDirectory = createTempDirectory();
  const inputPath = path.join(tempDirectory, filename);
  fs.writeFileSync(inputPath, buffer);

  return { tempDirectory, inputPath };
};

const IMAGE_WATERMARK_TEXT = "Created with Transloadit";

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
          watermarked: {
            robot: "/image/resize",
            use: ":original",
            text: [
              {
                text: IMAGE_WATERMARK_TEXT,
                size: 18,
                font: "Arial",
                color: "#FFFFFFCC",
                valign: "bottom",
                align: "left",
                x_offset: 20,
                y_offset: -28,
              },
            ],
            result: true,
          },
        },
      },
    })) as TransloaditAssemblyStatus;

    const uploadedUrl = extractAssemblyFileUrl(status, ["watermarked", ":original", "exported"]);

    if (!uploadedUrl) {
      throw new Error("Transloadit did not return a file URL for the processed output.");
    }

    return uploadedUrl;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(tempDirectory)) fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
};

export const createVideoUploadSession = async (fileName: string, mimeType: string): Promise<VideoUploadSession> => {
  const client = getTransloaditClient();
  const fieldName = "video";
  const uploadTemplate = {
    steps: {
      ":original": {
        robot: "/upload/handle",
        result: true,
      },
      watermark: {
        robot: "/image/resize",
        width: 200,
        height: 40,
        background: "#00000099",
        text: [
          {
            text: IMAGE_WATERMARK_TEXT,
            size: 14,
            font: "Arial",
            color: "#FFFFFF",
            valign: "middle",
            align: "center",
          },
        ],
        result: false,
      },
      encoded: {
        use: ":original",
        robot: "/video/encode",
        preset: "mp4-baseline",
        result: false,
      },
      watermarked: {
        use: ["encoded", "watermark"],
        robot: "/video/merge",
        overlay_x: 20,
        overlay_y: -30,
        overlay_width: 200,
        overlay_height: 40,
        result: true,
      },
    },
    fields: {
      file_name: fileName,
      mime_type: mimeType,
    },
  };

  const assemblyPromise = client.createAssembly({
    uploadBehavior: "none",
    uploads: {
      [fieldName]: Readable.from([]),
    },
    params: uploadTemplate,
  });

  const assemblyId = assemblyPromise.assemblyId;
  const result = (await assemblyPromise) as TransloaditAssemblyStatus;
  const uploadUrl = result.upload_urls?.[fieldName]?.trim();
  const assemblyUrl = (result.assembly_ssl_url ?? result.assembly_url ?? "").trim();

  if (!assemblyId) {
    throw new Error("Transloadit did not return an assembly id for the video upload session.");
  }

  if (!uploadUrl) {
    throw new Error("Transloadit did not return a direct upload URL for the video upload session.");
  }

  if (!assemblyUrl) {
    throw new Error("Transloadit did not return an assembly URL for the video upload session.");
  }

  return {
    assemblyId,
    assemblyUrl,
    uploadUrl,
    fieldName,
  };
};

export const waitForVideoAssemblyUrl = async (assemblyId: string, timeoutMs = 180000): Promise<string> => {
  const client = getTransloaditClient();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = (await client.getAssembly(assemblyId)) as TransloaditAssemblyStatus;

    const uploadedUrl = extractAssemblyFileUrl(status, ["watermarked", "encoded", ":original", "exported"]);
    if (uploadedUrl) {
      return uploadedUrl;
    }

    if (status.error) {
      throw new Error(typeof status.error === "string" ? status.error : "Transloadit video assembly failed.");
    }

    await sleep(2000);
  }

  throw new Error("Timed out waiting for the Transloadit video upload to finish processing.");
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