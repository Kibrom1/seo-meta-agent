import { createServerClient } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings, ChevronRight } from "lucide-react";

export default async function SettingsIndexPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, brand_name, cms_type")
    .order("created_at", { ascending: true })
    .limit(20);

  if (!projects || projects.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-20 text-center relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-[#0c111d] border border-[#1f2937] flex items-center justify-center mx-auto mb-6">
          <Settings className="w-7 h-7 text-gray-500" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">No Projects Yet</h1>
        <p className="text-gray-400 text-sm mb-6">Create a project first to access its settings.</p>
        <Link href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 bg-brand-violet hover:bg-violet-500 text-white font-medium px-5 py-2.5 rounded-xl transition-all text-sm shadow-[0_0_20px_rgba(139,92,246,0.3)]">
          Create your first project
        </Link>
      </div>
    );
  }

  // Single project — go straight to its settings
  if (projects.length === 1) {
    redirect(`/dashboard/settings/${projects[0].id}`);
  }

  // Multiple projects — show a picker
  return (
    <div className="max-w-2xl mx-auto px-8 py-10 relative z-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
        <p className="text-sm text-gray-400">Select a project to configure.</p>
      </div>
      <div className="space-y-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/settings/${p.id}`}
            className="glass rounded-xl px-6 py-4 flex items-center justify-between hover:border-[#374151] transition-all group"
          >
            <div>
              <p className="text-white font-medium">{p.brand_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{p.cms_type} Workspace</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
