import { createClient } from "@sanity/client";
import { decryptApiKey } from "@/lib/crypto";
import type { CmsAdapter, CmsEntry, SeoFields, Project } from "@/types";

interface SanityCmsConfig {
  projectId: string;
  dataset: string;
  seoTitleField: string;
  metaDescriptionField: string;
  tldrField: string;
}

function parseConfig(project: Project): SanityCmsConfig {
  let config: Partial<SanityCmsConfig> = {};
  try {
    if (project.tone_guidelines) {
      config = JSON.parse(project.tone_guidelines);
    }
  } catch {
    // Fall through to defaults
  }
  return {
    projectId: config.projectId ?? process.env.SANITY_PROJECT_ID ?? "",
    dataset: config.dataset ?? "production",
    seoTitleField: config.seoTitleField ?? "seo.title",
    metaDescriptionField: config.metaDescriptionField ?? "seo.description",
    tldrField: config.tldrField ?? "tldrSummary",
  };
}

export class SanityAdapter implements CmsAdapter {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  private getClient() {
    const config = parseConfig(this.project);
    const apiKey = decryptApiKey(this.project.api_key_enc);
    return createClient({
      projectId: config.projectId,
      dataset: config.dataset,
      apiVersion: "2024-01-01",
      token: apiKey,
      useCdn: false,
    });
  }

  async getEntry(entryId: string): Promise<CmsEntry> {
    const config = parseConfig(this.project);
    const client = this.getClient();

    const doc = await client.getDocument(entryId);
    if (!doc) throw new Error(`Sanity document ${entryId} not found`);

    // Resolve nested field paths like "seo.title"
    const getField = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split(".").reduce((acc: unknown, key) => {
        return acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined;
      }, obj);
    };

    return {
      id: entryId,
      title: String(doc.title ?? ""),
      body: String(doc.body ?? doc.content ?? ""),
      existingSeoFields: {
        seo_title: getField(doc as Record<string, unknown>, config.seoTitleField) as string | undefined,
        meta_description: getField(doc as Record<string, unknown>, config.metaDescriptionField) as string | undefined,
        tldr_summary: getField(doc as Record<string, unknown>, config.tldrField) as string | undefined,
      },
    };
  }

  async updateSeoFields(entryId: string, fields: SeoFields): Promise<void> {
    const config = parseConfig(this.project);
    const client = this.getClient();

    // Collision avoidance
    const current = await this.getEntry(entryId);
    if (current.existingSeoFields.seo_title) {
      console.warn(`[sanity] Skipping entry ${entryId} — seo_title already set`);
      return;
    }

    // Build Sanity patch using field path notation
    const patch = client.patch(entryId);
    if (fields.seo_title) patch.set({ [config.seoTitleField]: fields.seo_title });
    if (fields.meta_description) patch.set({ [config.metaDescriptionField]: fields.meta_description });
    if (fields.tldr_summary) patch.set({ [config.tldrField]: fields.tldr_summary });
    if (fields.alt_text) patch.set({ alt: fields.alt_text });

    await patch.commit();
  }
}
