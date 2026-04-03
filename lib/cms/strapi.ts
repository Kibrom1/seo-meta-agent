import { decryptApiKey } from "@/lib/crypto";
import type { CmsAdapter, CmsEntry, SeoFields, Project } from "@/types";

interface StrapiCmsConfig {
  baseUrl: string;
  contentType: string; // e.g. "articles"
  seoTitleField: string;      // Default: "seo_title"
  metaDescriptionField: string; // Default: "meta_description"
  tldrField: string;           // Default: "tldr_summary"
}

function parseConfig(project: Project): StrapiCmsConfig {
  let config: Partial<StrapiCmsConfig> = {};
  try {
    if (project.tone_guidelines) {
      config = JSON.parse(project.tone_guidelines);
    }
  } catch {
    // Fall through to defaults
  }
  return {
    baseUrl: config.baseUrl ?? process.env.STRAPI_BASE_URL ?? "",
    contentType: config.contentType ?? "articles",
    seoTitleField: config.seoTitleField ?? "seo_title",
    metaDescriptionField: config.metaDescriptionField ?? "meta_description",
    tldrField: config.tldrField ?? "tldr_summary",
  };
}

export class StrapiAdapter implements CmsAdapter {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  async getEntry(entryId: string): Promise<CmsEntry> {
    const config = parseConfig(this.project);
    const apiKey = decryptApiKey(this.project.api_key_enc);

    const response = await fetch(
      `${config.baseUrl}/api/${config.contentType}/${entryId}?populate=*`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!response.ok) throw new Error(`Strapi getEntry failed: ${response.status}`);

    const { data } = await response.json() as { data: { id: number; attributes: Record<string, unknown> } };
    const attrs = data.attributes;

    return {
      id: entryId,
      title: String(attrs.title ?? ""),
      body: String(attrs.body ?? attrs.content ?? ""),
      existingSeoFields: {
        seo_title: attrs[config.seoTitleField] as string | undefined,
        meta_description: attrs[config.metaDescriptionField] as string | undefined,
        tldr_summary: attrs[config.tldrField] as string | undefined,
      },
    };
  }

  async updateSeoFields(entryId: string, fields: SeoFields): Promise<void> {
    const config = parseConfig(this.project);
    const apiKey = decryptApiKey(this.project.api_key_enc);

    // Collision avoidance: fetch current values first
    const current = await this.getEntry(entryId);
    if (current.existingSeoFields.seo_title) {
      console.warn(`[strapi] Skipping entry ${entryId} — seo_title already set`);
      return;
    }

    const updatePayload: Record<string, unknown> = {};
    if (fields.seo_title) updatePayload[config.seoTitleField] = fields.seo_title;
    if (fields.meta_description) updatePayload[config.metaDescriptionField] = fields.meta_description;
    if (fields.tldr_summary) updatePayload[config.tldrField] = fields.tldr_summary;

    const response = await fetch(
      `${config.baseUrl}/api/${config.contentType}/${entryId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: updatePayload }),
      }
    );

    if (!response.ok) throw new Error(`Strapi updateSeoFields failed: ${response.status}`);
  }
}
