import { NextResponse } from "next/server";
import { validateHmacSignature, decryptApiKey } from "@/lib/crypto";
import { createServiceClient } from "@/lib/db";
import { seoQueue } from "@/lib/queue";
import type { WebhookPayload, TaskType, SeoJobData } from "@/types";

export async function POST(request: Request) {
  // 1. Buffer raw body BEFORE any parsing (HMAC requires original bytes)
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 2. Extract project ID from query string
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  // 3. Look up project using the service client (bypasses RLS — no session here)
  const supabase = createServiceClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // 4. Validate HMAC signature
  const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
  let webhookSecret: string;
  try {
    webhookSecret = decryptApiKey(project.webhook_secret);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!validateHmacSignature(rawBody, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 5. Parse payload (only after HMAC passes)
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const entryId = payload.sys?.id;
  if (!entryId) {
    return NextResponse.json({ error: "Missing sys.id in payload" }, { status: 400 });
  }

  // 6. Check monthly token budget
  const { data: usageData } = await supabase.rpc("get_monthly_token_usage", {
    p_project_id: projectId,
  });
  const totalTokens = Number(usageData?.[0]?.total_tokens ?? 0);

  if (totalTokens >= project.token_limit) {
    return NextResponse.json(
      { error: "Monthly token limit reached. Upgrade your plan." },
      { status: 429 }
    );
  }

  // 7. Determine task type(s) from payload
  const taskTypes = resolveTaskTypes(payload, project.primary_locale ?? "en-US");
  if (taskTypes.length === 0) {
    // Nothing to do (e.g., SEO fields already populated)
    return NextResponse.json({ accepted: false, reason: "No tasks required" }, { status: 200 });
  }

  // 8. Enqueue one job per task type, recording each in agent_tasks.
  //    Deduplicate: skip if a queued/processing task already exists for this entry+type
  //    (prevents double-processing on CMS retry or duplicate webhook deliveries).
  const taskIds: string[] = [];
  for (const task_type of taskTypes) {
    const { data: existing } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("project_id", projectId)
      .eq("entry_id", entryId)
      .eq("task_type", task_type)
      .in("status", ["queued", "processing"])
      .maybeSingle();

    if (existing) continue; // Already in flight — skip

    const { data: task, error: taskError } = await supabase
      .from("agent_tasks")
      .insert({ project_id: projectId, entry_id: entryId, task_type, status: "queued", payload })
      .select("id")
      .single();

    if (taskError || !task) continue;

    const jobData: SeoJobData = { taskId: task.id, projectId, entryId, task_type, payload };
    try {
      await seoQueue.add(task_type, jobData);
      taskIds.push(task.id);
    } catch {
      // Queue unavailable — roll back so the task is visible as failed and can be retried
      await supabase
        .from("agent_tasks")
        .update({ status: "failed", error_message: "Queue unavailable — task will need to be retried" })
        .eq("id", task.id);
    }
  }

  return NextResponse.json({ accepted: true, taskIds }, { status: 202 });
}

function resolveTaskTypes(payload: WebhookPayload, primaryLocale: string): TaskType[] {
  const types: TaskType[] = [];
  const isAsset = payload.sys?.type === "Asset";
  const isEntry = payload.sys?.type === "Entry";

  if (isAsset) {
    // Vision task for image assets
    types.push("alt_text_vision");
  }

  if (isEntry) {
    const fields = payload.fields ?? {};
    const locale = primaryLocale;

    // Collision avoidance: skip if SEO title already populated
    const existingSeoTitle = fields.seo_title?.[locale];
    if (!existingSeoTitle) {
      types.push("metadata_gen");
    }

    // Internal linking for published long-form entries
    const hasBody = Boolean(fields.body?.[locale] || fields.content?.[locale]);
    if (hasBody) {
      types.push("internal_linking");
    }
  }

  return types;
}
