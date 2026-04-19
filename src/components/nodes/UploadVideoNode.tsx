import { Position, type NodeProps } from "@xyflow/react";
import { Pencil, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

export const UploadVideoNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const nodeData = (data ?? {}) as unknown as NodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const toBase64 = useCallback((value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary);
  }, []);

  const uploadVideoFile = useCallback(async (file: File): Promise<string> => {
    const initResponse = await fetch("/api/media/upload/video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "init",
        fileName: file.name,
        mimeType: file.type || "video/mp4",
      }),
    });

    const initPayload = (await initResponse.json().catch(() => null)) as
      | { error?: string; uploadUrl?: string; assemblyId?: string }
      | null;

    if (!initResponse.ok || !initPayload?.uploadUrl || !initPayload.assemblyId) {
      throw new Error(initPayload?.error ?? "Failed to prepare video upload.");
    }

    const uploadResponse = await fetch(initPayload.uploadUrl, {
      method: "PATCH",
      headers: {
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Upload-Length": String(file.size),
        "Content-Type": "application/offset+octet-stream",
        "Upload-Metadata":
          `filename ${toBase64(file.name)},filetype ${toBase64(file.type || "video/mp4")}`,
      },
      body: file,
    });

    if (!uploadResponse.ok) {
      const text = await uploadResponse.text().catch(() => "");
      throw new Error(text || "Failed to upload video.");
    }

    const completeResponse = await fetch("/api/media/upload/video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "complete",
        assemblyId: initPayload.assemblyId,
      }),
    });

    const completePayload = (await completeResponse.json().catch(() => null)) as { error?: string; url?: string } | null;
    if (!completeResponse.ok || !completePayload?.url) {
      throw new Error(completePayload?.error ?? "Failed to upload video.");
    }

    return completePayload.url;
  }, [toBase64]);

  const onPickVideo = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const inputElement = event.currentTarget;
      const file = inputElement.files?.[0];
      if (!file) return;
      setUploadError(null);
      setIsUploading(true);
      const previewUrl = URL.createObjectURL(file);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = previewUrl;
      setPreviewSource(previewUrl);

      try {
        const uploadedVideoUrl = await uploadVideoFile(file);
        updateNodeData(id, {
          videoUrl: uploadedVideoUrl,
          videoName: file.name,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload video.";
        setUploadError(message);
      } finally {
        setIsUploading(false);
      }

      inputElement.value = "";
    },
    [id, updateNodeData, uploadVideoFile],
  );

  useEffect(() => {
    const videoSource = nodeData.videoUrl;

    if (previewSource || !videoSource) {
      return;
    }

    if (!videoSource.startsWith("data:")) {
      setPreviewSource(videoSource);
      return;
    }

    let cancelled = false;
    let generatedObjectUrl: string | null = null;

    void (async () => {
      const response = await fetch(videoSource);
      const blob = await response.blob();
      generatedObjectUrl = URL.createObjectURL(blob);

      if (cancelled) {
        URL.revokeObjectURL(generatedObjectUrl);
        return;
      }

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = generatedObjectUrl;
      setPreviewSource(generatedObjectUrl);
    })();

    return () => {
      cancelled = true;
      if (generatedObjectUrl) {
        URL.revokeObjectURL(generatedObjectUrl);
      }
    };
  }, [nodeData.videoUrl, previewSource]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  return (
    <NodeWrapper
      nodeId={id}
      title="Upload Video"
      subtitle="Select a local video"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="source" position={Position.Right} id="output" dataType="video" />

      <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={onPickVideo} />

      {!nodeData.videoUrl ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-(--nf-input-border) bg-(--nf-input-bg) px-3 py-4 text-center transition hover:border-(--nf-input-focus) hover:bg-(--nf-surface)"
        >
          <Video className="h-4 w-4 text-(--nf-text-secondary)" />
          <span className="text-[12px] text-(--nf-text)">{isUploading ? "Uploading..." : "Choose video"}</span>
          <span className="text-[11px] text-(--nf-text-secondary)">MP4, MOV, WEBM</span>
        </button>
      ) : null}

      {uploadError ? (
        <div className="mt-2 rounded-lg border border-(--nf-danger-border) bg-(--nf-danger-bg) px-2 py-1.5 text-[11px] text-(--nf-danger-text)">
          {uploadError}
        </div>
      ) : null}

      {previewSource ? (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-(--nf-border) bg-(--nf-surface)">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--nf-border) bg-(--nf-panel) text-(--nf-text) transition hover:bg-(--nf-hover)"
            aria-label="Edit video"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <video src={previewSource} controls className="h-32 w-full bg-black object-cover" preload="metadata" />
          <p className="truncate border-t border-(--nf-border) px-2 py-1.5 text-[11px] text-(--nf-text-secondary)">{nodeData.videoName}</p>
        </div>
      ) : null}
    </NodeWrapper>
  );
};
