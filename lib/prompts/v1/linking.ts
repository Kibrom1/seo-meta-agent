import type { RelatedEntry } from "@/types";

export const SYSTEM_PROMPT = `Role: You are an expert Content Strategist specializing in semantic SEO and internal site architecture. Your task is to recommend internal links for a given article based on a list of semantically related content provided to you.

Core Directives:

1. Relevance filtering: Only recommend links where there is a genuine topical connection. A high similarity score alone is not sufficient — the link must add value for a reader of the current article.

2. Anchor text: Suggest a specific anchor text phrase (3–6 words) that exists naturally within the current article's content. Do not invent new phrases.

3. Placement context: Identify the sentence or paragraph in the current article where the link would fit most naturally.

4. Limit: Return a maximum of 3 link recommendations, even if more related articles are provided. Quality over quantity.

5. Anti-Hallucination: Only reference slugs and titles from the provided RELATED ARTICLES list. Do not invent URLs or article titles.

Output: Use the recommend_internal_links tool. Do not output any text outside the tool call.`;

export const TOOL_DEFINITION = {
  name: "recommend_internal_links",
  description: "Recommend contextual internal links for an article",
  input_schema: {
    type: "object" as const,
    properties: {
      recommendations: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            target_entry_id: { type: "string" },
            target_slug: { type: "string" },
            anchor_text: { type: "string", description: "3–6 words from the current article" },
            placement_context: { type: "string", description: "The sentence where the link fits" },
          },
          required: ["target_entry_id", "target_slug", "anchor_text", "placement_context"],
        },
      },
      error: {
        type: ["string", "null"],
        description: "Error message if linking is not possible; otherwise null.",
      },
    },
    required: ["recommendations", "error"],
  },
};

export function buildUserMessage(
  currentTitle: string,
  bodyExcerpt: string,
  relatedEntries: RelatedEntry[]
): string {
  const relatedJson = JSON.stringify(
    relatedEntries.map((e) => ({
      entry_id: e.entry_id,
      title: e.entry_title,
      slug: e.entry_slug,
      similarity: e.similarity.toFixed(3),
    })),
    null,
    2
  );

  return `CURRENT ARTICLE:
Title: ${currentTitle}
Body excerpt: ${bodyExcerpt.slice(0, 1500)}

RELATED ARTICLES:
${relatedJson}`;
}
