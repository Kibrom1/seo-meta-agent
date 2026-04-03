import { createServerClient } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Database, Activity } from "lucide-react";
import type { Project } from "@/types";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  // Fetch token usage for each project this month
  const usageMap: Record<string, number> = {};
  await Promise.all(
    (projects ?? []).map(async (p: Project) => {
      const { data } = await supabase.rpc("get_monthly_token_usage", { p_project_id: p.id });
      usageMap[p.id] = Number(data?.[0]?.total_tokens ?? 0);
    })
  );

  return (
    <div className="max-w-6xl mx-auto px-8 py-12 relative z-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Projects Overview</h1>
          <p className="text-gray-400">Manage your connected CMS workspaces and SEO metadata.</p>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="bg-brand-violet hover:bg-violet-500 text-white font-medium px-5 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add New Project
        </Link>
      </div>

      {(projects ?? []).length === 0 ? (
        <div className="mt-12 w-full max-w-2xl mx-auto">
          <div className="glass rounded-2xl p-12 text-center border-dashed border-[#1f2937] hover:border-[#374151] transition-colors relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-blue-600/5 pointer-events-none" />
            <div className="w-16 h-16 rounded-2xl bg-[#0c111d] border border-[#1f2937] flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Database className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Configure your first workspace</h3>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
              There are no projects connected yet. Connect your CMS (Contentful, Strapi, etc.) to start automating your SEO workflow.
            </p>
            <Link 
              href="/dashboard/projects/new" 
              className="inline-flex items-center gap-2 bg-white text-gray-900 border border-transparent hover:bg-gray-100 font-medium px-6 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Connect a CMS
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {(projects as Project[]).map((p) => {
            const usage = usageMap[p.id] || 0;
            const percentage = Math.min(100, Math.max(2, (usage / p.token_limit) * 100)); // Minimum 2% to show the bar pill

            return (
              <Link
                key={p.id}
                href={`/dashboard/projects/${p.id}`}
                className="group block rounded-2xl p-6 glass glass-hover relative overflow-hidden"
              >
                {/* Subtle card glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-[50px] rounded-full pointer-events-none group-hover:bg-blue-500/20 transition-all duration-500" />

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-white tracking-tight mb-1">{p.brand_name}</h2>
                    <div className="flex items-center gap-2">
                       <span className="text-sm text-gray-400">{p.cms_type}</span>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <Activity className="w-3 h-3" />
                    Active
                  </span>
                </div>

                <div className="mt-8">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400 font-medium">Token Usage</span>
                    <span className="text-white font-medium">{percentage.toFixed(0)}%</span>
                  </div>
                  
                  {/* Neon Progress Bar */}
                  <div className="w-full h-2.5 bg-[#0c111d] rounded-full overflow-hidden border border-[#1f2937]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 relative"
                      style={{ width: `${percentage}%` }}
                    >
                      <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white/30 mix-blend-overlay" />
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      <span className="text-gray-300 font-medium">{usage.toLocaleString()}</span> / {p.token_limit.toLocaleString()} Tokens
                    </span>
                    <span className="text-xs text-blue-400 group-hover:underline flex flex-col relative top-1">
                      View details →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
