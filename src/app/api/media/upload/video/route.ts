import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { uploadBufferToTransloadit } from "@/lib/transloadit-upload";

const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") ?? "";
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
      mimeType = file.type || mimeType;
    } else {
      fileBuffer = Buffer.from(await request.arrayBuffer());
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
