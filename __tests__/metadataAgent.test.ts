import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK before importing the agent
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    Anthropic: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

// Mock OpenAI (only used as fallback)
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

import { runMetadataAgent } from "@/lib/agents/metadataAgent";
import type { WebhookPayload, Project } from "@/types";

const mockPayload: WebhookPayload = {
  sys: { type: "Entry", id: "entry-1" },
  fields: {
    title: { "en-US": "How to optimize your website for search engines in 2024" },
    body: { "en-US": "A".repeat(200) }, // > 50 words proxy
  },
};

const mockProject: Project = {
  id: "project-1",
  user_id: "user-1",
  cms_type: "Contentful",
  api_key_enc: "enc",
  webhook_secret: "secret",
  brand_name: "Acme Corp",
  tone_guidelines: "Professional",
  linking_threshold: 0.8,
  token_limit: 100000,
  stripe_customer_id: null,
  primary_locale: "en-US",
  created_at: new Date().toISOString(),
};

function makeClaudeResponse(input: object) {
  return {
    content: [{ type: "tool_use", input }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

describe("runMetadataAgent", () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const sdk = await import("@anthropic-ai/sdk");
    mockCreate = (sdk as any).__mockCreate;
    mockCreate.mockReset();
  });

  it("returns valid metadata within character constraints", async () => {
    const validOutput = {
      seo_title: "How to Optimize Your Website for Search Engines | Acme",
      meta_description:
        "Learn the top SEO practices for 2024. Discover how Acme Corp helps businesses rank higher with proven website optimization techniques and strategies.",
      primary_keyword: "website optimization",
      tldr_summary: "Key SEO tips for 2024.",
      error: null,
    };
    // Ensure lengths are valid
    expect(validOutput.seo_title.length).toBeGreaterThanOrEqual(50);
    expect(validOutput.seo_title.length).toBeLessThanOrEqual(60);
    expect(validOutput.meta_description.length).toBeGreaterThanOrEqual(140);
    expect(validOutput.meta_description.length).toBeLessThanOrEqual(155);

    mockCreate.mockResolvedValue(makeClaudeResponse(validOutput));

    const result = await runMetadataAgent(mockPayload, mockProject);
    expect(result.output.seo_title).toBe(validOutput.seo_title);
    expect(result.output.meta_description).toBe(validOutput.meta_description);
    expect(result.tokensUsed).toBe(150);
  });

  it("throws when seo_title is too short", async () => {
    const shortTitle = {
      seo_title: "Too Short",
      meta_description: "D".repeat(142),
      primary_keyword: "kw",
      tldr_summary: "s",
      error: null,
    };
    mockCreate.mockResolvedValue(makeClaudeResponse(shortTitle));
    await expect(runMetadataAgent(mockPayload, mockProject)).rejects.toThrow("seo_title length");
  });

  it("throws when meta_description is too long", async () => {
    const longDesc = {
      seo_title: "How to Optimize Your Website for Search Engines | Acme",
      meta_description: "D".repeat(160),
      primary_keyword: "kw",
      tldr_summary: "s",
      error: null,
    };
    mockCreate.mockResolvedValue(makeClaudeResponse(longDesc));
    await expect(runMetadataAgent(mockPayload, mockProject)).rejects.toThrow("meta_description length");
  });

  it("passes through error output without length validation", async () => {
    const errorOutput = {
      seo_title: "",
      meta_description: "",
      primary_keyword: "",
      tldr_summary: "",
      error: "Insufficient content",
    };
    mockCreate.mockResolvedValue(makeClaudeResponse(errorOutput));
    const result = await runMetadataAgent(mockPayload, mockProject);
    expect(result.output.error).toBe("Insufficient content");
  });

  it("throws when Claude returns no tool_use block", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "some text" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    await expect(runMetadataAgent(mockPayload, mockProject)).rejects.toThrow();
  });
});
