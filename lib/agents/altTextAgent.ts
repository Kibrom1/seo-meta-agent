import * as AnthropicSDK from "@anthropic-ai/sdk";
import { altTextPrompts, PROMPT_VERSION } from "@/lib/prompts";
import type { AltTextOutput, WebhookPayload, Project } from "@/types";

// Robust constructor lookup for mixed ESM/CJS environments (e.g. Node v25/Jiti)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Anthropic = (AnthropicSDK as any).Anthropic || (AnthropicSDK as any).default?.Anthropic || (AnthropicSDK as any).default;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

interface AltTextAgentResult {
  output: AltTextOutput;
  tokensUsed: number;
  promptVersion: string;
}

export async function runAltTextAgent(
  payload: WebhookPayload,
  project: Project
): Promise<AltTextAgentResult> {
  const locale = project.primary_locale ?? "en-US";
  const file = payload.fields.file?.[locale] as
    | { url: string; contentType: string }
    | undefined;

  if (!file?.url) {
    return {
      output: { alt_text: "", decorative: false, primary_keyword: "", error: "No image URL in payload" },
      tokensUsed: 0,
      promptVersion: PROMPT_VERSION,
    };
  }

  // Fetch and encode image as base64 (30s timeout, validate status)
  const imageUrl = file.url.startsWith("//") ? `https:${file.url}` : file.url;
  const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!imageResponse.ok) {
    return {
      output: { alt_text: "", decorative: false, primary_keyword: "", error: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}` },
      tokensUsed: 0,
      promptVersion: PROMPT_VERSION,
    };
  }
  const arrayBuffer = await imageResponse.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    return {
      output: { alt_text: "", decorative: false, primary_keyword: "", error: "Image exceeds 5MB limit" },
      tokensUsed: 0,
      promptVersion: PROMPT_VERSION,
    };
  }

  const base64Image = Buffer.from(arrayBuffer).toString("base64");
  const mediaType = (file.contentType as "image/jpeg" | "image/png" | "image/gif" | "image/webp") ?? "image/jpeg";

  // Entry title from payload if available (for context injection)
  const entryTitle = payload.fields.title?.[locale] as string | undefined;

  const userMessage = altTextPrompts.buildUserMessage(
    project.brand_name,
    project.tone_guidelines ?? "Professional and informative",
    entryTitle
  );

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: altTextPrompts.SYSTEM_PROMPT,
    tools: [altTextPrompts.TOOL_DEFINITION],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Image } },
          { type: "text", text: userMessage },
        ],
      },
    ],
  });

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  const toolUse = response.content.find((b: AnthropicSDK.Anthropic.ContentBlock): b is AnthropicSDK.Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block for alt-text generation");
  }

  const output = toolUse.input as AltTextOutput;
  return { output, tokensUsed, promptVersion: PROMPT_VERSION };
}
