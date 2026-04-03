/**
 * SEO Meta-Agent Worker
 *
 * Long-running BullMQ worker process — deploy separately (Railway, Render, etc.).
 * NOT a Vercel serverless function. Start with: npx tsx worker/index.ts
 */

import "dotenv/config";
import { createWorker } from "@/lib/queue";
import { createServiceClient } from "@/lib/db";
import { runMetadataAgent } from "@/lib/agents/metadataAgent";
import { runAltTextAgent } from "@/lib/agents/altTextAgent";
import { runLinkingAgent } from "@/lib/agents/linkingAgent";
import { getCmsAdapter } from "@/lib/cms";
import { reportTokenUsage } from "@/lib/stripe";
import type { SeoJobData, Project } from "@/types";

// ── Structured logger ──────────────────────────────────────────────────────
// Emits JSON lines to stdout so log aggregators (Datadog, Logtail, etc.) can
// parse them. Falls back to plain strings in dev via NODE_ENV check.
const IS_DEV = process.env.NODE_ENV !== "production";

function log(
  level: "info" | "warn" | "error",
  msg: string,
  ctx: Record<string, unknown> = {}
) {
  if (IS_DEV) {
    const prefix = level === "error" ? "✖" : level === "warn" ? "⚠" : "→";
    const extra = Object.keys(ctx).length ? " " + JSON.stringify(ctx) : "";
    console[level](`[worker] ${prefix} ${msg}${extra}`);
  } else {
    console[level](JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() }));
  }
}

log("info", "Starting worker process...");

const supabase = createServiceClient();

const worker = createWorker(async (job) => {
  const { taskId, projectId, entryId, task_type, payload } = job.data as SeoJobData;
  // Correlation context attached to every log line for this job
  const ctx = { jobId: job.id, taskId, projectId, entryId, task_type };

  log("info", "Processing job", ctx);

  // Mark task as processing
  await supabase
    .from("agent_tasks")
    .update({ status: "processing" })
    .eq("id", taskId);

  // Load project (needed for brand context, CMS adapter, billing)
  const { data: project, error: projError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projError || !project) {
    log("error", "Project not found", ctx);
    throw new Error(`Project ${projectId} not found`);
  }

  const adapter = getCmsAdapter(project as Project);
  let tokensUsed = 0;

  try {
    if (task_type === "metadata_gen") {
      tokensUsed = await handleMetadataGen(taskId, entryId, payload, project as Project, adapter);
    } else if (task_type === "alt_text_vision") {
      tokensUsed = await handleAltText(taskId, entryId, payload, project as Project, adapter);
    } else if (task_type === "internal_linking") {
      tokensUsed = await handleInternalLinking(taskId, entryId, payload, project as Project);
    }

    // Mark completed and record token usage
    await supabase
      .from("agent_tasks")
      .update({ status: "completed", tokens_used: tokensUsed })
      .eq("id", taskId);

    // Report to Stripe (non-blocking — don't fail the job if Stripe is down)
    if (project.stripe_customer_id) {
      reportTokenUsage(project.stripe_customer_id, tokensUsed).catch((err) =>
        log("error", "Failed to report Stripe usage", { ...ctx, error: String(err) })
      );
    }

    log("info", "Job completed", { ...ctx, tokensUsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Non-retryable errors (agent detected bad content)
    if (message.includes("Insufficient content")) {
      log("warn", "Permanent failure — insufficient content, no retry", { ...ctx, error: message });
      await supabase
        .from("agent_tasks")
        .update({ status: "failed", error_message: message })
        .eq("id", taskId);
      return; // Don't rethrow — prevents BullMQ retry for permanent failures
    }

    // Transient errors — rethrow to trigger BullMQ exponential backoff
    log("error", "Transient failure — will retry", { ...ctx, error: message });
    await supabase
      .from("agent_tasks")
      .update({ status: "queued", error_message: message }) // Reset to queued while retrying
      .eq("id", taskId);
    throw err;
  }
});

// ============================================================
// Task Handlers
// ============================================================

async function handleMetadataGen(
  taskId: string,
  entryId: string,
  payload: SeoJobData["payload"],
  project: Project,
  adapter: ReturnType<typeof getCmsAdapter>
): Promise<number> {
  const { output, tokensUsed } = await runMetadataAgent(payload, project);

  if (output.error) {
    // Agent decided content is insufficient — permanent failure, no retry
    throw new Error(output.error);
  }

  // Get current entry to record old values in audit log
  const entry = await adapter.getEntry(entryId);

  // Write back to CMS (adapter handles collision avoidance internally)
  await adapter.updateSeoFields(entryId, {
    seo_title: output.seo_title,
    meta_description: output.meta_description,
    tldr_summary: output.tldr_summary,
  });

  // Write audit log
  await writeAuditLogs(taskId, entryId, [
    { field: "seo_title", old: entry.existingSeoFields.seo_title, new: output.seo_title },
    { field: "meta_description", old: entry.existingSeoFields.meta_description, new: output.meta_description },
    { field: "tldr_summary", old: entry.existingSeoFields.tldr_summary, new: output.tldr_summary },
  ]);

  return tokensUsed;
}

async function handleAltText(
  taskId: string,
  entryId: string,
  payload: SeoJobData["payload"],
  project: Project,
  adapter: ReturnType<typeof getCmsAdapter>
): Promise<number> {
  const { output, tokensUsed } = await runAltTextAgent(payload, project);

  if (output.error) {
    throw new Error(output.error);
  }

  if (!output.decorative) {
    const entry = await adapter.getEntry(entryId);
    await adapter.updateSeoFields(entryId, { alt_text: output.alt_text });
    await writeAuditLogs(taskId, entryId, [
      { field: "alt_text", old: entry.existingSeoFields.alt_text, new: output.alt_text },
    ]);
  }

  return tokensUsed;
}

async function handleInternalLinking(
  taskId: string,
  entryId: string,
  payload: SeoJobData["payload"],
  project: Project
): Promise<number> {
  const { output, tokensUsed } = await runLinkingAgent(payload, project);

  if (output.error) {
    throw new Error(output.error);
  }

  // Linking write-back is advisory — save recommendations to audit_logs only
  if (output.recommendations.length > 0) {
    await writeAuditLogs(taskId, entryId, [
      { field: "internal_links", old: null, new: output.recommendations },
    ]);
  }

  return tokensUsed;
}

// ============================================================
// Helpers
// ============================================================

async function writeAuditLogs(
  taskId: string,
  entryId: string,
  changes: Array<{ field: string; old: unknown; new: unknown }>
): Promise<void> {
  const rows = changes.map((c) => ({
    task_id: taskId,
    entry_id: entryId,
    field_name: c.field,
    old_value: c.old ?? null,
    new_value: c.new ?? null,
  }));
  await supabase.from("audit_logs").insert(rows);
}

// ============================================================
// Process lifecycle
// ============================================================

worker.on("failed", async (job, err) => {
  if (job) {
    // BullMQ fires this event after every failed attempt, not only after all retries are exhausted.
    // Guard: only write terminal failure once the last allowed attempt has been made.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

    const data = job.data as SeoJobData;
    log("error", "Job exhausted all retries — marking failed in DB", {
      jobId: job.id,
      taskId: data.taskId,
      projectId: data.projectId,
      task_type: data.task_type,
      error: err.message,
    });
    // Write terminal failed state to DB — BullMQ does not call the processor again
    await supabase
      .from("agent_tasks")
      .update({ status: "failed", error_message: err.message })
      .eq("id", data.taskId);
  }
});

worker.on("error", (err) => {
  log("error", "Worker-level error", { error: err.message });
});

process.on("SIGTERM", async () => {
  log("info", "SIGTERM received — shutting down gracefully");
  await worker.close();
  process.exit(0);
});

log("info", "SEO Meta-Agent worker started");
