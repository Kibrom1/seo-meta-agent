import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";
import { seoQueue } from "@/lib/queue";
import type { SeoJobData } from "@/types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const taskIds: string[] | undefined = body.task_ids;

  // Fetch failed tasks (filtered by provided IDs or all failed for project)
  let query = supabase
    .from("agent_tasks")
    .select("id, entry_id, task_type, payload")
    .eq("project_id", id)
    .eq("status", "failed");

  if (taskIds && taskIds.length > 0) query = query.in("id", taskIds);

  const { data: failedTasks, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!failedTasks || failedTasks.length === 0) {
    return NextResponse.json({ error: "No failed tasks found" }, { status: 400 });
  }

  const retriedIds: string[] = [];

  for (const task of failedTasks) {
    // Skip tasks with no stored payload (created before migration 003) — re-enqueueing
    // with an empty fields stub would cause every agent to fail immediately with "Insufficient content".
    if (!task.payload) {
      await supabase
        .from("agent_tasks")
        .update({ error_message: "Cannot retry: original payload was not stored (pre-migration task). Republish the entry in your CMS to re-trigger." })
        .eq("id", task.id);
      continue;
    }

    // Enqueue first — only update DB status if the queue write succeeds.
    const jobData: SeoJobData = {
      taskId: task.id,
      projectId: id,
      entryId: task.entry_id,
      task_type: task.task_type as SeoJobData["task_type"],
      payload: task.payload as SeoJobData["payload"],
    };
    try {
      await seoQueue.add(task.task_type, jobData);
    } catch {
      // Queue unavailable — leave the task as failed so the user can retry again later
      continue;
    }

    await supabase
      .from("agent_tasks")
      .update({ status: "queued", error_message: null })
      .eq("id", task.id);
    retriedIds.push(task.id);
  }

  return NextResponse.json({ retried: retriedIds.length, task_ids: retriedIds }, { status: 202 });
}
