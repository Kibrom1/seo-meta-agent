import { createServerClient } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Sparkles, AlertTriangle, ArrowRightLeft, Link2 } from "lucide-react";

export default async function AuditLogPage({ params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: logs } = await supabase
    .from("audit_logs")
    .select(`
      *,
      agent_tasks ( task_type, tokens_used, project_id )
    `)
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false });

  // Get project ID from the first log entry to build the back link
  const projectId = (logs?.[0] as any)?.agent_tasks?.project_id;
  const backLink = projectId ? `/dashboard/projects/${projectId}` : "/dashboard";

  return (
    <div className="max-w-5xl mx-auto px-8 py-10 relative z-10">
      <Link href={backLink} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
        <ChevronLeft className="w-4 h-4" />
        Back to Project
      </Link>

      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2 flex items-center gap-3">
          <ArrowRightLeft className="w-7 h-7 text-brand-violet" />
          Audit Log
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">Entry ID: <span className="text-gray-300 bg-[#1f2937] px-2 py-0.5 rounded ml-1 border border-[#374151]">{entryId}</span></p>
      </div>

      {(logs ?? []).length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center border-dashed border-[#1f2937]">
          <p className="text-gray-400">No AI transitions recorded for this entry yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(logs ?? []).map((log) => {
            const isError = log.field_name.toLowerCase() === "error";
            const isLinkRec = log.field_name === "internal_links";
            const taskType = (log as { agent_tasks?: { task_type?: string } }).agent_tasks?.task_type;
            
            // Render a field value for display — strips redundant JSON string wrapping
            const formatValue = (val: unknown): string => {
              if (val === null || val === undefined) return "—";
              if (typeof val === "string") {
                try {
                  const parsed = JSON.parse(val);
                  if (typeof parsed === "string") return parsed;
                } catch { /* not JSON — use as-is */ }
                return val;
              }
              return JSON.stringify(val, null, 2);
            };

            return (
              <div key={log.id} className={`glass rounded-2xl overflow-hidden shadow-lg border relative ${isError ? 'border-red-500/30' : isLinkRec ? 'border-amber-500/20' : 'border-[#1f2937]'}`}>
                {/* Glow for specific blocks */}
                {!isError && <div className="absolute -inset-[1px] bg-gradient-to-r from-violet-600/20 to-blue-600/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-2xl" />}
                
                {/* Header */}
                <div className={`px-6 py-4 flex flex-wrap items-center justify-between border-b ${isError ? 'bg-red-500/5 border-red-500/20' : isLinkRec ? 'bg-amber-500/5 border-amber-500/15' : 'bg-[#0c111d] border-[#1f2937]'}`}>
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-bold tracking-wider uppercase ${isError ? 'text-red-400 flex items-center gap-2' : 'text-gray-200'}`}>
                      {isError && <AlertTriangle className="w-4 h-4" />}
                      {log.field_name.replace(/_/g, " ")}
                    </span>
                    {!isError && (
                       <span className="text-xs text-gray-500 px-2 py-1 rounded bg-[#1f2937]/50 border border-[#374151]">
                         {taskType}
                       </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-mono">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>

                {/* Diff Body */}
                {isError ? (
                  <div className="p-6 bg-red-500/5 font-mono text-sm text-red-200 whitespace-pre-wrap break-words">
                    {formatValue(log.new_value)}
                  </div>
                ) : isLinkRec ? (
                  <div className="p-6 bg-amber-500/5">
                    <div className="flex items-start gap-3 mb-5 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
                      <Link2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-300">
                        Advisory suggestions only — not written to CMS. Apply manually in your CMS editor.
                      </p>
                    </div>
                    {(() => {
                      let recs: { target_slug?: string; anchor_text?: string; placement_context?: string }[] = [];
                      try {
                        const parsed = typeof log.new_value === "string" ? JSON.parse(log.new_value) : log.new_value;
                        recs = Array.isArray(parsed) ? parsed : [];
                      } catch { /* ignore */ }
                      return recs.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No link recommendations recorded.</p>
                      ) : (
                        <div className="space-y-3">
                          {recs.map((rec, i) => (
                            <div key={i} className="rounded-lg border border-amber-500/15 bg-[#0c111d] p-4">
                              <p className="text-sm font-medium text-amber-300 mb-1">{rec.anchor_text ?? "—"}</p>
                              <p className="text-xs font-mono text-gray-400 mb-2">→ {rec.target_slug ?? "—"}</p>
                              {rec.placement_context && (
                                <p className="text-xs text-gray-500 italic">{rec.placement_context}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#1f2937] bg-[#111827]/80">
                    {/* Before */}
                    <div className="p-6 relative">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest border border-[#374151] px-2 py-0.5 rounded bg-[#0c111d]">Original</span>
                      </div>
                      <div className="text-sm text-gray-400 italic font-mono whitespace-pre-wrap">
                        {log.old_value ? formatValue(log.old_value) : <span className="text-gray-600">No pre-existing data</span>}
                      </div>
                    </div>

                    {/* After */}
                    <div className="p-6 relative bg-blue-900/5">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest border border-blue-500/30 px-2 py-0.5 rounded bg-blue-500/10 flex items-center gap-1.5 shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                          <Sparkles className="w-3.5 h-3.5" />
                          AI Generated
                        </span>
                      </div>
                      <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-medium">
                        {formatValue(log.new_value)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
