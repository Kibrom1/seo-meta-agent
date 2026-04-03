-- Enable pgvector for internal linking embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cms_type            TEXT NOT NULL CHECK (cms_type IN ('Contentful', 'Strapi', 'Sanity')),
  api_key_enc         TEXT NOT NULL,
  webhook_secret      TEXT NOT NULL,
  brand_name          TEXT NOT NULL,
  tone_guidelines     TEXT,
  linking_threshold   FLOAT DEFAULT 0.75,
  token_limit         INTEGER DEFAULT 10000,
  stripe_customer_id  TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_id     TEXT NOT NULL,
  task_type    TEXT NOT NULL CHECK (task_type IN ('metadata_gen', 'alt_text_vision', 'internal_linking')),
  status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  tokens_used  INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  entry_id    TEXT NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE content_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_id    TEXT NOT NULL,
  entry_title TEXT NOT NULL,
  entry_slug  TEXT NOT NULL,
  embedding   vector(1536),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, entry_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX ON agent_tasks (project_id, created_at DESC);
CREATE INDEX ON audit_logs (entry_id);
-- hnsw works on empty tables (safer than ivfflat which needs 100+ rows)
CREATE INDEX ON content_embeddings USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Monthly token usage per project (used for billing gate in webhook route)
CREATE OR REPLACE FUNCTION get_monthly_token_usage(p_project_id uuid)
RETURNS TABLE (total_tokens bigint) LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(tokens_used), 0)
  FROM agent_tasks
  WHERE project_id = p_project_id
    AND created_at >= date_trunc('month', now());
$$;

-- Cosine similarity search for internal linking
CREATE OR REPLACE FUNCTION match_related_entries(
  query_embedding vector(1536),
  match_project_id uuid,
  exclude_entry_id text,
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (entry_id text, entry_title text, entry_slug text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT entry_id, entry_title, entry_slug,
         1 - (embedding <=> query_embedding) AS similarity
  FROM content_embeddings
  WHERE project_id = match_project_id
    AND entry_id != exclude_entry_id
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Auto-update updated_at on agent_tasks
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_tasks_updated_at
  BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
