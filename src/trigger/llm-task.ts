import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import { task } from "@trigger.dev/sdk/v3";

import { fetchMediaBuffer } from "@/lib/media-utils";

export interface LlmTaskPayload {
  model: string;
  systemPrompt: string;
  userMessage: string;
  images?: string[];
}

interface LlmTaskResult {
  text: string;
  triggerRunId?: string | null;
}

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const FALLBACK_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"] as const;

const isModelNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return message.includes("404") || message.includes("not found") || message.includes("is not supported");
};

const buildPrompt = (payload: LlmTaskPayload): string => {
  const lines = [
    payload.systemPrompt ? `System instructions: ${payload.systemPrompt}` : "",
    payload.userMessage ? `User message: ${payload.userMessage}` : "",
  ].filter(Boolean);

  return lines.join("\n\n");
};

const buildContentParts = async (payload: LlmTaskPayload): Promise<Part[]> => {
  const prompt = buildPrompt(payload);
  const parts: Part[] = [];

  if (prompt) {
    parts.push({ text: prompt });
  }

  for (const imageSource of payload.images ?? []) {
    const { buffer, mimeType } = await fetchMediaBuffer(imageSource);
    parts.push({
      inlineData: {
        data: buffer.toString("base64"),
        mimeType,
      },
    });
  }

  return parts;
};

export const runLlmNode = async (payload: LlmTaskPayload): Promise<LlmTaskResult> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      text: "GEMINI_API_KEY is missing. Configure environment variables to run LLM inference.",
      triggerRunId: null,
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(payload);

  const requestedModel = payload.model?.trim() || DEFAULT_GEMINI_MODEL;
  const modelCandidates = [requestedModel, ...FALLBACK_GEMINI_MODELS].filter(
    (model, index, values) => values.indexOf(model) === index,
  );

  const contentParts = await buildContentParts(payload);

  let lastError: unknown;

  for (const candidateModel of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: candidateModel });
      const response = await model.generateContent(contentParts.length > 0 ? contentParts : prompt);
      const text = response.response.text();

      return {
        text,
        triggerRunId: null,
      };
    } catch (error) {
      lastError = error;

      if (!isModelNotFoundError(error)) {
        throw error;
      }
    }
  }

  const details = lastError instanceof Error ? ` ${lastError.message}` : "";
  throw new Error(
    `No compatible Gemini model was available. Tried: ${modelCandidates.join(", ")}.${details}`,
  );
};

export const llmTask = task({
  id: "llm-task",
  run: async (payload: LlmTaskPayload) => {
    return runLlmNode(payload);
  },
});
