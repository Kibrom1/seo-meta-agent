export type CmsType = "Contentful" | "Strapi" | "Sanity";
export type TaskType = "metadata_gen" | "alt_text_vision" | "internal_linking";
export type TaskStatus = "queued" | "processing" | "completed" | "failed";

export interface Project {
  id: string;
  user_id: string;
  cms_type: CmsType;
  api_key_enc: string;
  webhook_secret: string;
  brand_name: string;
  tone_guidelines: string | null;
  linking_threshold: number;
  token_limit: number;
  stripe_customer_id: string | null;
  primary_locale: string;
  created_at: string;
}

export interface AgentTask {
  id: string;
  project_id: string;
  entry_id: string;
  task_type: TaskType;
  status: TaskStatus;
  tokens_used: number;
  error_message: string | null;
  payload?: WebhookPayload;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  task_id: string;
  entry_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export interface ContentEmbedding {
  id: string;
  project_id: string;
  entry_id: string;
  entry_title: string;
  entry_slug: string;
  updated_at: string;
}

// Webhook payload shape from CMS
export interface WebhookPayload {
  sys: {
    type: "Entry" | "Asset";
    id: string;
    [key: string]: unknown;
  };
  fields: Record<string, Record<string, unknown>>;
  metadata?: { tags: unknown[] };
}

// Job data enqueued in BullMQ
export interface SeoJobData {
  taskId: string;
  projectId: string;
  entryId: string;
  task_type: TaskType;
  payload: WebhookPayload;
}

// Agent outputs
export interface MetadataOutput {
  seo_title: string;
  meta_description: string;
  primary_keyword: string;
  tldr_summary: string;
  error: string | null;
}

export interface AltTextOutput {
  alt_text: string;
  decorative: boolean;
  primary_keyword: string;
  error: string | null;
}

export interface LinkRecommendation {
  target_entry_id: string;
  target_slug: string;
  anchor_text: string;
  placement_context: string;
}

export interface LinkingOutput {
  recommendations: LinkRecommendation[];
  error: string | null;
}

export interface RelatedEntry {
  entry_id: string;
  entry_title: string;
  entry_slug: string;
  similarity: number;
}

// CMS adapter interface
export interface SeoFields {
  seo_title?: string;
  meta_description?: string;
  alt_text?: string;
  tldr_summary?: string;
}

export interface CmsEntry {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
  imageContentType?: string;
  existingSeoFields: SeoFields;
}

export interface CmsAdapter {
  getEntry(entryId: string): Promise<CmsEntry>;
  updateSeoFields(entryId: string, fields: SeoFields): Promise<void>;
}

export interface UsageForecast {
  tokens_used: number;
  token_limit: number;
  percent_used: number;
  projected_month_end: number;
  days_remaining_in_month: number;
  will_exceed: boolean;
  daily_breakdown: Array<{ day: string; total_tokens: number }>;
}
