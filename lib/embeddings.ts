import OpenAI from "openai";
import { createServiceClient } from "@/lib/db";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // Stay within token limit
  });
  return response.data[0].embedding;
}

export async function upsertEmbedding(
  projectId: string,
  entryId: string,
  entryTitle: string,
  entrySlug: string,
  bodyText: string
): Promise<void> {
  const inputText = `${entryTitle} ${bodyText.slice(0, 500)}`;
  const embedding = await generateEmbedding(inputText);

  const supabase = createServiceClient();
  await supabase.from("content_embeddings").upsert(
    { project_id: projectId, entry_id: entryId, entry_title: entryTitle, entry_slug: entrySlug, embedding, updated_at: new Date().toISOString() },
    { onConflict: "project_id,entry_id" }
  );
}
