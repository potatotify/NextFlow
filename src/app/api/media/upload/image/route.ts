import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { uploadBufferToTransloadit } from "@/lib/transloadit-upload";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const maxDuration = 120;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are supported." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: "Image file is empty." }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Upload a file smaller than 25MB." },
        { status: 413 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadedUrl = await uploadBufferToTransloadit(fileBuffer, file.name || "image-upload.jpg", file.type);

    return NextResponse.json({ url: uploadedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
