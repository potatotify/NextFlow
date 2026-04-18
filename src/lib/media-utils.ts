import { Buffer } from "node:buffer";

export interface MediaBufferResult {
  buffer: Buffer;
  mimeType: string;
}

const dataUrlPattern = /^data:([^;]+);base64,([\s\S]+)$/;

export const dataUrlToBuffer = (dataUrl: string): MediaBufferResult => {
  const match = dataUrl.match(dataUrlPattern);
  if (!match) {
    throw new Error("Expected a base64 data URL.");
  }

  const [, mimeType, base64Data] = match;
  return {
    buffer: Buffer.from(base64Data, "base64"),
    mimeType,
  };
};

export const bufferToDataUrl = (buffer: Buffer, mimeType: string): string => {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
};

export const fetchMediaBuffer = async (source: string): Promise<MediaBufferResult> => {
  if (source.startsWith("data:")) {
    return dataUrlToBuffer(source);
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to fetch media source: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType,
  };
};