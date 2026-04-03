-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_embeddings ENABLE ROW LEVEL SECURITY;

-- projects: each user can only access their own projects
CREATE POLICY "Users own their projects"
  ON projects FOR ALL
  USING (auth.uid() = user_id);

-- agent_tasks: accessible if the parent project belongs to the user
CREATE POLICY "Tasks visible to project owner"
  ON agent_tasks FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- audit_logs: accessible via task → project → user chain
CREATE POLICY "Logs visible to project owner"
  ON audit_logs FOR ALL
  USING (
    task_id IN (
      SELECT id FROM agent_tasks WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

-- content_embeddings: same pattern as agent_tasks
CREATE POLICY "Embeddings visible to project owner"
  ON content_embeddings FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );
