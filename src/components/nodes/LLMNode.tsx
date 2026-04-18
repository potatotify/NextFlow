import { Position, type NodeProps } from "@xyflow/react";
import { BrainCircuit } from "lucide-react";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";

import { HandlePort } from "@/components/nodes/shared/HandlePort";
import { NodeWrapper } from "@/components/nodes/shared/NodeWrapper";
import { useWorkflowStore } from "@/store/workflow-store";
import type { NodeData } from "@/types/nodes";

const modelOptions = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

export const LLMNode = ({ id, data, selected }: NodeProps) => {
  const removeNode = useWorkflowStore((state) => state.removeNode);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const nodeData = (data ?? {}) as unknown as NodeData;
  const resultText = (nodeData.llmResult ?? "").trim();
  const isResultLong = resultText.length > 220 || resultText.split(/\r?\n/).length > 4;

  useEffect(() => {
    setIsResultExpanded(false);
  }, [resultText]);

  const onModelChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      updateNodeData(id, { llmModel: event.target.value, llmError: undefined });
    },
    [id, updateNodeData],
  );

  const onSystemPromptChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { systemPrompt: event.target.value, llmError: undefined });
    },
    [id, updateNodeData],
  );

  const onUserMessageChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { userMessage: event.target.value, llmError: undefined });
    },
    [id, updateNodeData],
  );

  return (
    <NodeWrapper
      nodeId={id}
      title="Run Any LLM"
      subtitle="Prompt and multimodal inference"
      status={nodeData.status ?? "idle"}
      nodeType={nodeData.nodeType}
      selected={selected}
      onDelete={() => removeNode(id)}
    >
      <HandlePort type="target" position={Position.Left} id="images" dataType="image" style={{ top: "20%" }} />
      <HandlePort type="target" position={Position.Left} id="system_prompt" dataType="text" style={{ top: "48%" }} />
      <HandlePort type="target" position={Position.Left} id="user_message" dataType="text" style={{ top: "68%" }} />
      <HandlePort type="source" position={Position.Right} id="output" dataType="text" />

      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-(--nf-text-secondary)">
        <BrainCircuit className="h-3.5 w-3.5" />
        Model
      </div>

      <select
        value={nodeData.llmModel ?? modelOptions[0]}
        onChange={onModelChange}
        className="mb-2 h-9 w-full rounded-lg border border-(--nf-input-border) bg-(--nf-input-bg) px-2 text-[12px] text-(--nf-text) outline-none focus:border-(--nf-input-focus)"
      >
        {modelOptions.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </select>

      <textarea
        value={nodeData.systemPrompt ?? ""}
        onChange={onSystemPromptChange}
        placeholder="System prompt"
        className="mb-2 h-16 w-full resize-none rounded-lg border border-(--nf-input-border) bg-(--nf-input-bg) px-2 py-1.5 text-[12px] text-(--nf-text) outline-none placeholder:text-(--nf-text-secondary) focus:border-(--nf-input-focus)"
      />

      <textarea
        value={nodeData.userMessage ?? ""}
        onChange={onUserMessageChange}
        placeholder="User message"
        className="h-16 w-full resize-none rounded-lg border border-(--nf-input-border) bg-(--nf-input-bg) px-2 py-1.5 text-[12px] text-(--nf-text) outline-none placeholder:text-(--nf-text-secondary) focus:border-(--nf-input-focus)"
      />

      <div className={`mt-2 rounded-lg border px-2 py-1.5 text-[12px] ${nodeData.llmError ? "border-(--nf-danger-border) bg-(--nf-danger-bg) text-(--nf-danger-text)" : "border-(--nf-soft-border) bg-(--nf-soft-panel) text-(--nf-text-secondary)"}`}>
        {nodeData.llmError ? (
          <span>{nodeData.llmError}</span>
        ) : resultText ? (
          <>
            <div className={`${isResultExpanded ? "max-h-none" : "max-h-20 overflow-hidden"} whitespace-pre-wrap leading-5 text-(--nf-text)`}>
              {resultText}
            </div>

            {isResultLong ? (
              <button
                type="button"
                onClick={() => setIsResultExpanded((value) => !value)}
                className="mt-2 inline-flex items-center rounded-md border border-(--nf-border) bg-(--nf-surface) px-2.5 py-1 text-[11px] font-medium text-(--nf-text) transition hover:bg-(--nf-hover)"
              >
                {isResultExpanded ? "Show less" : "Show more"}
              </button>
            ) : null}
          </>
        ) : (
          <span>Result will appear here after execution.</span>
        )}
      </div>
    </NodeWrapper>
  );
};
