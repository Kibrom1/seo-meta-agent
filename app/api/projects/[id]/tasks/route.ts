import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db";

export async function GET(
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

  const url = new URL(request.url);
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));
  const statusFilter = url.searchParams.get("status");
  const since = url.searchParams.get("since");

  let query = supabase
    .from("agent_tasks")
    .select("id, entry_id, task_type, status, tokens_used, error_message, created_at, updated_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter) query = query.eq("status", statusFilter);
  if (since) query = query.gt("updated_at", since);

  const { data: tasks, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count total failed tasks for the retry badge
  const { count: total_failed } = await supabase
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .eq("status", "failed");

  return NextResponse.json({ tasks: tasks ?? [], total_failed: total_failed ?? 0 });
}
