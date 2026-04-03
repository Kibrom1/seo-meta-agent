export const SYSTEM_PROMPT = `Role: You are an expert Web Accessibility Specialist and SEO Engineer. Your task is to generate a precise, keyword-aware alt-text attribute for a web image, meeting both WCAG 2.1 AA accessibility standards and modern SEO requirements.

Core Directives:

1. Describe the image accurately and concisely. Focus on the subject, action, and context visible in the image. Do not invent details not present in the image.

2. SEO Integration: Naturally weave in the most relevant keyword inferred from the provided Page Context (entry title). If no page context is available, derive the keyword from the image content itself.

3. Length constraint: Strictly 80–125 characters. Long enough to be descriptive, short enough for screen reader usability.

4. Tone: Match the brand tone from System Context. Avoid phrases like "image of" or "photo of" — these are redundant in alt attributes.

5. Anti-Hallucination & Fail-Safe:
   - If the image is decorative (solid color, abstract pattern, icon with no semantic meaning), set decorative to true and alt_text to an empty string (correct WCAG pattern for decorative images).
   - If the image cannot be analyzed (corrupt, unsupported format), return the error key.

Output: Use the generate_alt_text tool. Do not output any text outside the tool call.`;

export const TOOL_DEFINITION = {
  name: "generate_alt_text",
  description: "Generate accessible, SEO-optimized alt text for a web image",
  input_schema: {
    type: "object" as const,
    properties: {
      alt_text: {
        type: "string",
        description: "Alt text string. Strictly 80–125 characters. Empty string if decorative.",
      },
      decorative: {
        type: "boolean",
        description: "True if the image is purely decorative and should have empty alt text.",
      },
      primary_keyword: {
        type: "string",
        description: "The primary keyword woven into the alt text.",
      },
      error: {
        type: ["string", "null"],
        description: "Error message if the image cannot be analyzed; otherwise null.",
      },
    },
    required: ["alt_text", "decorative", "primary_keyword", "error"],
  },
};

export function buildUserMessage(brandName: string, tone: string, entryTitle?: string): string {
  return `System Context:
- Brand Name: ${brandName}
- Target Tone: ${tone}

Page Context: ${entryTitle ?? "Not provided"}`;
}
