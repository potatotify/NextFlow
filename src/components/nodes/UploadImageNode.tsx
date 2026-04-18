import { Position, type NodeProps } from "@xyflow/react";
import { ImagePlus, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

export const UploadImageNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);

  const nodeData = (data ?? {}) as unknown as NodeData;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImageFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/media/upload/image", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; url?: string } | null;
    if (!response.ok || !payload?.url) {
      throw new Error(payload?.error ?? "Failed to upload image.");
    }

    return payload.url;
  }, []);

  const onPickImage = useCallback(
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
        const uploadedImageUrl = await uploadImageFile(file);
        updateNodeData(id, {
          imageUrl: uploadedImageUrl,
          imageName: file.name,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload image.";
        setUploadError(message);
      } finally {
        setIsUploading(false);
      }

      inputElement.value = "";
    },
    [id, updateNodeData, uploadImageFile],
  );

  useEffect(() => {
    if (!previewSource && nodeData.imageUrl) {
      setPreviewSource(nodeData.imageUrl);
    }
  }, [nodeData.imageUrl, previewSource]);

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
      title="Upload Image"
      subtitle="Select a local image"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="source" position={Position.Right} id="output" dataType="image" />

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />

      {!nodeData.imageUrl ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-(--nf-input-border) bg-(--nf-input-bg) px-3 py-4 text-center transition hover:border-(--nf-input-focus) hover:bg-(--nf-surface)"
        >
          <ImagePlus className="h-4 w-4 text-(--nf-text-secondary)" />
          <span className="text-[12px] text-(--nf-text)">{isUploading ? "Uploading..." : "Choose image"}</span>
          <span className="text-[11px] text-(--nf-text-secondary)">PNG, JPG, WEBP</span>
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
            aria-label="Edit image"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <img src={previewSource} alt={nodeData.imageName ?? "Uploaded image"} className="h-28 w-full object-cover" />
          <p className="truncate border-t border-(--nf-border) px-2 py-1.5 text-[11px] text-(--nf-text-secondary)">{nodeData.imageName}</p>
        </div>
      ) : null}
    </NodeWrapper>
  );
};
