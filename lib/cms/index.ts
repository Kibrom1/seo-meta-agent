import { ContentfulAdapter } from "./contentful";
import { StrapiAdapter } from "./strapi";
import { SanityAdapter } from "./sanity";
import type { CmsAdapter, Project } from "@/types";

export function getCmsAdapter(project: Project): CmsAdapter {
  switch (project.cms_type) {
    case "Contentful":
      return new ContentfulAdapter(project);
    case "Strapi":
      return new StrapiAdapter(project);
    case "Sanity":
      return new SanityAdapter(project);
    default:
      throw new Error(`Unsupported CMS type: ${project.cms_type}`);
  }
}

export { ContentfulAdapter, StrapiAdapter, SanityAdapter };
