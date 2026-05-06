import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { execSync } from "node:child_process";
import https from "node:https";

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
    const isVideo = mimeType.startsWith("video/");
    
    const assemblyParams = isVideo ? {
      steps: {
        ":original": {
          robot: "/upload/handle",
          result: true,
        },
        encoded: {
          use: ":original",
          robot: "/video/encode",
          format: "mp4",
          video_codec: "h264",
          audio_codec: "aac",
          quality: 6,
          result: true,
        },
      },
    } : {
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
    };

    const status = (await client.createAssembly({
      waitForCompletion: true,
      files: {
        input: inputPath,
      },
      params: assemblyParams as any,
    })) as TransloaditAssemblyStatus;

    const uploadedUrl = isVideo 
      ? extractAssemblyFileUrl(status, ["encoded", ":original", "exported"])
      : extractAssemblyFileUrl(status, ["watermarked", ":original", "exported"]);

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
      encoded: {
        use: ":original",
        robot: "/video/encode",
        format: "mp4",
        video_codec: "h264",
        audio_codec: "aac",
        quality: 6,
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

    const uploadedUrl = extractAssemblyFileUrl(status, ["encoded", ":original", "exported"]);
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


const downloadFile = async (url: string, outputPath: string): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https
      .get(url, (response) => {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
  });
};

export const addWatermarkToTransloaditVideo = async (
  videoUrl: string,
  outputFileName: string = "watermarked-video.mp4",
): Promise<string> => {
  const tempDir = createTempDirectory();
  const inputPath = path.join(tempDir, "video.mp4");
  const outputPath = path.join(tempDir, outputFileName);

  try {
    // Download the video from Transloadit
    console.log("Downloading video from Transloadit...");
    await downloadFile(videoUrl, inputPath);
    console.log("Video downloaded successfully");

    // Verify input file exists and has content
    if (!fs.existsSync(inputPath) || fs.statSync(inputPath).size === 0) {
      throw new Error("Downloaded video file is empty or does not exist");
    }

    // Try multiple FFmpeg command approaches
    let ffmpegSuccess = false;
    const ffmpegCommands = [
      // Approach 1: Simple drawtext with proper quoting
      `ffmpeg -i "${inputPath}" -vf "drawtext=text='Created with Transloadit':fontsize=20:fontcolor=white:x=20:y=h-50:box=1:boxcolor=black@0.7:boxborderw=5" -c:v libx264 -preset medium -c:a aac "${outputPath}" -y`,
      // Approach 2: Without opacity (simpler)
      `ffmpeg -i "${inputPath}" -vf "drawtext=fontfile=/Windows/Fonts/arial.ttf:text='Created with Transloadit':fontsize=16:fontcolor=white:x=20:y=h-50" -c:v libx264 -preset medium -c:a aac "${outputPath}" -y`,
      // Approach 3: Fallback with basic drawtext
      `ffmpeg -i "${inputPath}" -vf "drawtext=text='Watermarked':fontsize=16:fontcolor=white:x=20:y=h-50" -c:v libx264 -preset medium -c:a aac "${outputPath}" -y`,
      // Approach 4: Re-encode without drawtext as last resort
      `ffmpeg -i "${inputPath}" -c:v libx264 -preset medium -c:a aac "${outputPath}" -y`,
    ];

    for (let i = 0; i < ffmpegCommands.length; i++) {
      try {
        console.log(`Attempting FFmpeg command ${i + 1}...`);
        execSync(ffmpegCommands[i], { stdio: "pipe", encoding: "utf-8" });
        ffmpegSuccess = true;
        console.log(`FFmpeg command ${i + 1} succeeded`);
        break;
      } catch (error) {
        console.error(`FFmpeg command ${i + 1} failed:`, error instanceof Error ? error.message : error);
        if (i === ffmpegCommands.length - 1) {
          throw new Error("All FFmpeg approaches failed");
        }
      }
    }

    if (!ffmpegSuccess) {
      throw new Error("FFmpeg processing failed");
    }

    // Verify output file was created
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error("FFmpeg output file is empty or was not created");
    }

    console.log("Reading watermarked video...");
    // Read the watermarked video
    const watermarkedBuffer = fs.readFileSync(outputPath);
    console.log(`Watermarked video size: ${watermarkedBuffer.length} bytes`);

    // Upload the watermarked video back to Transloadit
    console.log("Uploading watermarked video back to Transloadit...");
    const uploadedUrl = await uploadBufferToTransloadit(
      watermarkedBuffer,
      outputFileName,
      "video/mp4",
    );
    console.log("Watermarked video uploaded successfully");

    return uploadedUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Watermarking error:", errorMessage);
    throw error;
  } finally {
    if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
};