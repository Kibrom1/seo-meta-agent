import { createClient } from "contentful-management";
import { decryptApiKey } from "@/lib/crypto";
import type { CmsAdapter, CmsEntry, SeoFields, Project } from "@/types";

export class ContentfulAdapter implements CmsAdapter {
  private project: Project;

  constructor(project: Project) {
    this.project = project;
  }

  private getClient() {
    const apiKey = decryptApiKey(this.project.api_key_enc);
    return createClient({ accessToken: apiKey });
  }

  private getSpaceId(): string {
    const spaceId = process.env.CONTENTFUL_SPACE_ID;
    if (!spaceId) throw new Error("CONTENTFUL_SPACE_ID environment variable not set");
    return spaceId;
  }

  async getEntry(entryId: string): Promise<CmsEntry> {
    const client = this.getClient();
    const entry = await client.entry.get({
      spaceId: this.getSpaceId(),
      environmentId: "master",
      entryId,
    });

    const locale = this.project.primary_locale ?? "en-US";

    return {
      id: entryId,
      title: String(entry.fields.title?.[locale] ?? ""),
      body: String(entry.fields.body?.[locale] ?? entry.fields.content?.[locale] ?? ""),
      existingSeoFields: {
        seo_title: entry.fields.seo_title?.[locale] as string | undefined,
        meta_description: entry.fields.meta_description?.[locale] as string | undefined,
        tldr_summary: entry.fields.tldr_summary?.[locale] as string | undefined,
        alt_text: entry.fields.description?.[locale] as string | undefined,
      },
    };
  }

  async updateSeoFields(entryId: string, fields: SeoFields): Promise<void> {
    const client = this.getClient();
    const spaceId = this.getSpaceId();

    const entry = await client.entry.get({ spaceId, environmentId: "master", entryId });
    const locale = this.project.primary_locale ?? "en-US";

    // Collision avoidance: abort if seo_title is already populated
    if (entry.fields.seo_title?.[locale]) {
      console.warn(`[contentful] Skipping entry ${entryId} — seo_title already set`);
      return;
    }

    const updatedFields = { ...entry.fields };
    if (fields.seo_title) updatedFields.seo_title = { [locale]: fields.seo_title };
    if (fields.meta_description) updatedFields.meta_description = { [locale]: fields.meta_description };
    if (fields.tldr_summary) updatedFields.tldr_summary = { [locale]: fields.tldr_summary };
    if (fields.alt_text) updatedFields.description = { [locale]: fields.alt_text };

    await client.entry.update(
      { spaceId, environmentId: "master", entryId },
      { ...entry, fields: updatedFields }
    );
    // Note: does not auto-publish. Publishing is a separate editorial decision.
  }
}
