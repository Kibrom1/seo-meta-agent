import * as AnthropicSDK from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { metadataPrompts, PROMPT_VERSION } from "@/lib/prompts";
import type { MetadataOutput, WebhookPayload, Project } from "@/types";

// Lazy client instantiators (prevents build-time crashes when keys are missing)
const getAnthropic = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not defined");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AnthropicCtor = (AnthropicSDK as any).Anthropic || (AnthropicSDK as any).default?.Anthropic || (AnthropicSDK as any).default;
  return new AnthropicCtor({ apiKey: key });
};

const getOpenAI = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not defined");
  return new OpenAI({ apiKey: key });
};

interface MetadataAgentResult {
  output: MetadataOutput;
  tokensUsed: number;
  promptVersion: string;
}

export async function runMetadataAgent(
  payload: WebhookPayload,
  project: Project
): Promise<MetadataAgentResult> {
  const locale = project.primary_locale ?? "en-US";

  const contentJson = JSON.stringify({
    title: payload.fields.title?.[locale],
    body: payload.fields.body?.[locale] ?? payload.fields.content?.[locale],
    tags: payload.metadata?.tags,
  });

  const userMessage = metadataPrompts.buildUserMessage(
    contentJson,
    project.brand_name,
    project.tone_guidelines ?? "Professional and informative"
  );

  let output: MetadataOutput | undefined;
  let tokensUsed = 0;

  try {
    const response = await getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: metadataPrompts.SYSTEM_PROMPT,
      tools: [metadataPrompts.TOOL_DEFINITION],
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userMessage }],
    });

    tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
    const toolUse = response.content.find((b: AnthropicSDK.Anthropic.ContentBlock): b is AnthropicSDK.Anthropic.ToolUseBlock => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      output = toolUse.input as MetadataOutput;
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message?.includes("credit balance") || (err as { status?: number }).status === 400)) {
      console.log("⚠️ Anthropic balance low, falling back to OpenAI...");
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: metadataPrompts.SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        tools: [{ type: "function", function: { ...metadataPrompts.TOOL_DEFINITION, name: "generate_metadata" } }],
        tool_choice: { type: "function", function: { name: "generate_metadata" } }
      });

      const toolCall = response.choices[0].message.tool_calls?.[0];
      if (toolCall && toolCall.type === "function") {
        output = JSON.parse(toolCall.function.arguments);
        tokensUsed = response.usage?.total_tokens ?? 0;
      }
    } else {
      throw err;
    }
  }

  if (!output) {
    throw new Error("Failed to generate metadata from both agents");
  }

  // Validate character constraints (trigger retry if violated)
  if (!output.error) {
    if (output.seo_title.length < 50 || output.seo_title.length > 60) {
      throw new Error(
        `seo_title length ${output.seo_title.length} is outside 50–60 char range: "${output.seo_title}"`
      );
    }
    if (output.meta_description.length < 140 || output.meta_description.length > 155) {
      throw new Error(
        `meta_description length ${output.meta_description.length} is outside 140–155 char range`
      );
    }
  }

  return { output, tokensUsed, promptVersion: PROMPT_VERSION };
}
