import * as AnthropicSDK from "@anthropic-ai/sdk";
import { linkingPrompts, PROMPT_VERSION } from "@/lib/prompts";
import { generateEmbedding, upsertEmbedding } from "@/lib/embeddings";
import { createServiceClient } from "@/lib/db";
import type { LinkingOutput, RelatedEntry, WebhookPayload, Project } from "@/types";

// Robust constructor lookup for mixed ESM/CJS environments (e.g. Node v25/Jiti)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Anthropic = (AnthropicSDK as any).Anthropic || (AnthropicSDK as any).default?.Anthropic || (AnthropicSDK as any).default;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LinkingAgentResult {
  output: LinkingOutput;
  tokensUsed: number;
  promptVersion: string;
}

export async function runLinkingAgent(
  payload: WebhookPayload,
  project: Project
): Promise<LinkingAgentResult> {
  const locale = project.primary_locale ?? "en-US";
  const entryTitle = String(payload.fields.title?.[locale] ?? "");
  const bodyText = String(
    payload.fields.body?.[locale] ?? payload.fields.content?.[locale] ?? ""
  );
  const entrySlug = String(payload.fields.slug?.[locale] ?? `/${payload.sys.id}`);

  // Step 1: Upsert this entry's embedding so the index stays fresh
  await upsertEmbedding(project.id, payload.sys.id, entryTitle, entrySlug, bodyText);

  // Step 2: Find related entries via pgvector cosine similarity
  const queryEmbedding = await generateEmbedding(`${entryTitle} ${bodyText.slice(0, 500)}`);
  const supabase = createServiceClient();

  const { data: relatedEntries, error } = await supabase.rpc("match_related_entries", {
    query_embedding: queryEmbedding,
    match_project_id: project.id,
    exclude_entry_id: payload.sys.id,
    match_threshold: project.linking_threshold,
    match_count: 5,
  });

  if (error) throw new Error(`pgvector query failed: ${error.message}`);

  const related = (relatedEntries ?? []) as RelatedEntry[];

  // Not enough related content — return empty recommendations gracefully
  if (related.length === 0) {
    return {
      output: { recommendations: [], error: null },
      tokensUsed: 0,
      promptVersion: PROMPT_VERSION,
    };
  }

  // Step 3: Ask Claude to select the best links and craft anchor text
  const userMessage = linkingPrompts.buildUserMessage(entryTitle, bodyText, related);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: linkingPrompts.SYSTEM_PROMPT,
    tools: [linkingPrompts.TOOL_DEFINITION],
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: userMessage }],
  });

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  const toolUse = response.content.find((b): b is AnthropicSDK.Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block for internal linking");
  }

  const output = toolUse.input as LinkingOutput;
  return { output, tokensUsed, promptVersion: PROMPT_VERSION };
}
