import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { createVideoUploadSession, uploadBufferToTransloadit, waitForVideoAssemblyUrl } from "@/lib/transloadit-upload";

const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
export const maxDuration = 300;

const mimeTypeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".ogv": "video/ogg",
};

const inferVideoMimeType = (fileName: string, fallbackMimeType: string): string => {
  const lowerName = fileName.toLowerCase();
  for (const [extension, mimeType] of Object.entries(mimeTypeByExtension)) {
    if (lowerName.endsWith(extension)) {
      return mimeType;
    }
  }

  if (fallbackMimeType.startsWith("video/")) {
    return fallbackMimeType;
  }

  return "video/mp4";
};

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | { action?: string; fileName?: string; mimeType?: string; assemblyId?: string }
        | null;

      if (!body?.action) {
        return NextResponse.json({ error: "Missing upload action." }, { status: 400 });
      }

      if (body.action === "init") {
        const fileName = body.fileName?.trim() || "video-upload.mp4";
        const mimeType = body.mimeType?.trim() || "video/mp4";
        const session = await createVideoUploadSession(fileName, mimeType);

        return NextResponse.json({
          uploadUrl: session.uploadUrl,
          assemblyId: session.assemblyId,
          assemblyUrl: session.assemblyUrl,
          fieldName: session.fieldName,
        });
      }

      if (body.action === "complete") {
        if (!body.assemblyId) {
          return NextResponse.json({ error: "assemblyId is required." }, { status: 400 });
        }

        const uploadedUrl = await waitForVideoAssemblyUrl(body.assemblyId);
        return NextResponse.json({ url: uploadedUrl });
      }

      return NextResponse.json({ error: "Unsupported upload action." }, { status: 400 });
    }

    let fileBuffer: Buffer;
    let fileName = request.headers.get("x-file-name")?.trim() || "video-upload.mp4";
    let mimeType = request.headers.get("x-file-type")?.trim() || contentType || "video/mp4";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Video file is required." }, { status: 400 });
      }

      fileBuffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name || fileName;
      mimeType = inferVideoMimeType(fileName, file.type || mimeType);
    } else {
      fileBuffer = Buffer.from(await request.arrayBuffer());
      mimeType = inferVideoMimeType(fileName, mimeType);
    }

    if (!mimeType.startsWith("video/")) {
      return NextResponse.json({ error: "Only video files are supported." }, { status: 400 });
    }

    if (fileBuffer.length <= 0) {
      return NextResponse.json({ error: "Video file is empty." }, { status: 400 });
    }

    if (fileBuffer.length > MAX_VIDEO_BYTES) {
      return NextResponse.json(
        { error: "Video is too large. Upload a file smaller than 120MB." },
        { status: 413 },
      );
    }

    const uploadedUrl = await uploadBufferToTransloadit(fileBuffer, fileName, mimeType);

    return NextResponse.json({ url: uploadedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
