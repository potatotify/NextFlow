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

  const readVideoAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Failed to read video file."));
      };
      reader.onerror = () => reject(new Error("Failed to read video file."));
      reader.readAsDataURL(file);
    });
  }, []);

  const onPickVideo = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const videoDataUrl = await readVideoAsDataUrl(file);
      const previewUrl = URL.createObjectURL(file);

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      previewUrlRef.current = previewUrl;

      updateNodeData(id, {
        videoUrl: videoDataUrl,
        videoName: file.name,
      });
      setPreviewSource(previewUrl);
    },
    [id, readVideoAsDataUrl, updateNodeData],
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
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#33353a] bg-[#0f1014] px-3 py-4 text-center transition hover:border-[#4b4e56] hover:bg-[#13151b]"
        >
          <Video className="h-4 w-4 text-[#9ca3af]" />
          <span className="text-[12px] text-[#cfd3dc]">Choose video</span>
          <span className="text-[11px] text-[#6b7280]">MP4, MOV, WEBM</span>
        </button>
      ) : null}

      {previewSource ? (
        <div className="relative mt-3 overflow-hidden rounded-xl border border-[#2b2b2b] bg-[#0e0f12]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#2f323a] bg-[#13161dcc] text-[#e5e7eb] transition hover:bg-[#1b1f28]"
            aria-label="Edit video"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <video src={previewSource} controls className="h-32 w-full bg-black object-cover" preload="metadata" />
          <p className="truncate border-t border-[#23252a] px-2 py-1.5 text-[11px] text-[#9ca3af]">{nodeData.videoName}</p>
        </div>
      ) : null}
    </NodeWrapper>
  );
};
