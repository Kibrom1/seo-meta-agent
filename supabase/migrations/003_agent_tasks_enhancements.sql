-- Add error message visibility to agent_tasks
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Store original webhook payload for retry support
ALTER TABLE agent_tasks ADD COLUMN IF NOT EXISTS payload JSONB;

-- Primary locale per project (replaces Object.keys hack, avoids multi-locale token explosion)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS primary_locale TEXT NOT NULL DEFAULT 'en-US';

-- SQL helper for daily token usage (powers usage forecast API)
CREATE OR REPLACE FUNCTION get_daily_token_usage(p_project_id uuid)
RETURNS TABLE (day date, total_tokens bigint) LANGUAGE sql STABLE AS $$
  SELECT date_trunc('day', created_at)::date AS day,
         COALESCE(SUM(tokens_used), 0) AS total_tokens
  FROM agent_tasks
  WHERE project_id = p_project_id
    AND created_at >= date_trunc('month', now())
  GROUP BY 1 ORDER BY 1;
$$;

-- Partial index for fast failed-task queries (bulk retry, badge counts)
CREATE INDEX IF NOT EXISTS agent_tasks_project_status_failed_idx
  ON agent_tasks (project_id, status) WHERE status = 'failed';
