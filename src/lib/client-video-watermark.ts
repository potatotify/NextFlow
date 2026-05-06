import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

async function createWatermarkPng(text: string, videoWidth: number) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // size watermark relative to video width
  const scale = Math.max(1, videoWidth / 640);
  const fontSize = Math.round(18 * scale);
  const padding = Math.round(12 * scale);
  ctx.font = `${fontSize}px Arial, sans-serif`;
  const textMetrics = ctx.measureText(text);
  const w = Math.ceil(textMetrics.width + padding * 2);
  const h = Math.ceil(fontSize + padding * 2);

  canvas.width = w;
  canvas.height = h;

  // transparent background
  ctx.clearRect(0, 0, w, h);

  // optional semi-transparent background for readability
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, w, h);

  // white text with slight shadow
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, padding, h / 2 + 1);

  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

export default async function addWatermarkToVideo(file: File, text = "Created with Transloadit") {
  if (typeof window === "undefined") throw new Error("Client-side only");

  console.log("[Watermark] Starting watermark process for:", file.name);

  // get video dimensions
  const videoUrl = URL.createObjectURL(file);
  const videoEl = document.createElement("video");
  videoEl.preload = "metadata";
  videoEl.src = videoUrl;

  const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const onLoaded = () => {
      const w = videoEl.videoWidth || 640;
      const h = videoEl.videoHeight || 360;
      console.log("[Watermark] Video dimensions:", { w, h });
      resolve({ w, h });
      cleanup();
    };
    const onErr = (e: any) => { reject(new Error("Failed to load video metadata")); cleanup(); };
    function cleanup() {
      videoEl.removeEventListener("loadedmetadata", onLoaded);
      videoEl.removeEventListener("error", onErr);
      URL.revokeObjectURL(videoUrl);
    }
    videoEl.addEventListener("loadedmetadata", onLoaded);
    videoEl.addEventListener("error", onErr);
  });

  const watermarkBlob = await createWatermarkPng(text, dims.w);
  if (!watermarkBlob) throw new Error("Failed to create watermark image");
  console.log("[Watermark] PNG created, size:", watermarkBlob.size);

  const ffmpeg = new FFmpeg();
  console.log("[Watermark] Loading FFmpeg...");
  if (!ffmpeg.loaded) {
    await ffmpeg.load();
    console.log("[Watermark] FFmpeg loaded successfully");
  }

  // write files
  ffmpeg.writeFile("input.mp4", await fetchFile(file));
  ffmpeg.writeFile("watermark.png", await fetchFile(watermarkBlob));
  console.log("[Watermark] Files written, starting processing...");

  // overlay watermark at bottom-left with small offset
  // using a simple re-encode; may be slow in browser depending on file size
  try {
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-i",
      "watermark.png",
      "-filter_complex",
      "overlay=20:main_h-overlay_h-28",
      "-c:v",
      "libx264",
      "-crf",
      "28",  // lower quality for faster encoding
      "-preset",
      "ultrafast",  // fastest preset
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "out.mp4",
    ]);
    console.log("[Watermark] Processing complete");
  } catch (err) {
    console.error("[Watermark] FFmpeg exec error:", err);
    throw err;
  }

  const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
  const outputBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const blob = new Blob([outputBuffer], { type: "video/mp4" });
  console.log("[Watermark] Output created, size:", blob.size);
  const outName = file.name.replace(/(\.[^.]+)?$/, "-wm.mp4");
  return new File([blob], outName, { type: "video/mp4" });
}
