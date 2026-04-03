import { createServerClient } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Terminal, LayoutList, AlertTriangle } from "lucide-react";
import { CopyButton } from "./CopyButton";
import type { AgentTask } from "@/types";
import { RetryButton } from "./RetryButton";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  processing: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/10 border-red-500/20 text-red-400",
};

const TASK_LABELS: Record<string, string> = {
  metadata_gen: "Metadata Optimization",
  alt_text_vision: "Alt Text Vision API",
  internal_linking: "Internal Link Suggestions (Advisory)",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, brand_name, cms_type, token_limit")
    .eq("id", id)
    .single();

  if (!project) notFound();
  if (project.user_id !== user.id) notFound(); // surface as 404 rather than leaking ownership

  const { data: tasks } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/cms-event?projectId=${project.id}`;

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 relative z-10">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
        <ChevronLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Project header */}
      <div className="glass rounded-2xl p-8 mb-10 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-violet-600/10 blur-[60px] rounded-full pointer-events-none" />
        
        <div className="flex items-start justify-between relative z-10">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">{project.brand_name}</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">{project.cms_type} Workspace</span>
              <span className="w-1 h-1 rounded-full bg-gray-600" />
              <span className="text-sm font-mono text-gray-500 bg-[#0c111d] px-2 py-0.5 rounded border border-[#1f2937]">
                ID: {project.id.split('-')[0]}
              </span>
            </div>
          </div>
        </div>

        {/* Webhook Configuration */}
        <div className="mt-8 bg-[#0c111d] rounded-xl border border-[#1f2937] p-5">
          <div className="flex items-center gap-2 mb-3">
             <Terminal className="w-4 h-4 text-violet-400" />
             <p className="text-sm font-medium text-gray-300">Webhook URL</p>
          </div>
          <div className="flex items-center justify-between bg-black/40 rounded-lg p-3 border border-[#1f2937]">
            <code className="text-sm font-mono text-blue-300 truncate pr-4">
              {webhookUrl}
            </code>
            <CopyButton url={webhookUrl} />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Configure this URL in your CMS webhook settings to trigger the SEO Meta-Agent automatically on publish events.
          </p>
        </div>
      </div>

      {/* Task list Section */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <LayoutList className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">Agent Task History</h2>
          {(tasks ?? []).some(t => t.status === "failed") && (
            <RetryButton
              projectId={id}
              failedCount={(tasks ?? []).filter(t => t.status === "failed").length}
            />
          )}
        </div>

        {(tasks ?? []).length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center border-dashed border-[#1f2937]">
            <p className="text-gray-400">No tasks have been intercepted yet.</p>
            <p className="text-gray-500 text-sm mt-2">Publish an entry in your connected CMS to trigger the AI agents.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(tasks as AgentTask[]).map((task) => (
              <div
                key={task.id}
                className={`group glass rounded-xl px-6 py-5 flex items-center justify-between hover:border-[#374151] transition-all ${task.status === "failed" ? "border-red-500/10" : ""}`}
              >
                <div className="flex items-center gap-5">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_COLORS[task.status]}`}>
                    {task.status.toUpperCase()}
                  </span>
                  <div>
                    <h3 className="text-gray-200 font-medium mb-0.5">{TASK_LABELS[task.task_type] ?? task.task_type}</h3>
                    <p className="text-xs text-gray-500">
                      Entry ID: <span className="font-mono text-gray-400">{task.entry_id}</span>
                    </p>
                    {task.status === "failed" && task.error_message && (
                      <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-xs" title={task.error_message}>{task.error_message}</span>
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-8">
                  <div className="text-right">
                    <p className="text-sm text-gray-300 font-medium">{task.tokens_used.toLocaleString()} tokens</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/audit/${task.entry_id}`}
                    className="text-sm font-medium text-brand-blue hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-4 py-2 rounded-lg"
                  >
                    View audit log
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
