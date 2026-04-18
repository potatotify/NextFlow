import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";

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

export const runCropImageNode = async (payload: CropImageTaskPayload): Promise<CropImageTaskResult> => {
  if (!payload.imageUrl) {
    throw new Error("CropImageNode requires an input image URL.");
  }

  const { buffer } = await fetchMediaBuffer(payload.imageUrl);
  const sourceImage = sharp(buffer);
  const metadata = await sourceImage.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to determine image dimensions for cropping.");
  }

  const left = Math.max(0, Math.floor((payload.xPercent / 100) * metadata.width));
  const top = Math.max(0, Math.floor((payload.yPercent / 100) * metadata.height));
  const width = Math.max(1, Math.floor((payload.widthPercent / 100) * metadata.width));
  const height = Math.max(1, Math.floor((payload.heightPercent / 100) * metadata.height));

  const maxWidth = Math.max(1, metadata.width - left);
  const maxHeight = Math.max(1, metadata.height - top);

  const croppedBuffer = await sourceImage
    .extract({
      left: Math.min(left, metadata.width - 1),
      top: Math.min(top, metadata.height - 1),
      width: Math.min(width, maxWidth),
      height: Math.min(height, maxHeight),
    })
    .jpeg({ quality: 92 })
    .toBuffer();

  const uploadedUrl = await uploadBufferToTransloadit(croppedBuffer, "cropped-image.jpg", "image/jpeg");

  return {
    imageUrl: uploadedUrl,
    triggerRunId: null,
  };
};

export const cropImageTask = task({
  id: "crop-image-task",
  run: async (payload: CropImageTaskPayload) => {
    return runCropImageNode(payload);
  },
});
