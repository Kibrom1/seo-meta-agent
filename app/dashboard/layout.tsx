import Link from "next/link";
import { createServerClient } from "@/lib/db";
import { redirect } from "next/navigation";
import { LayoutDashboard, FolderKanban, Settings, LogOut, Code, FileText, Pickaxe } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const userEmail = user.email;

  return (
    <div className="flex h-screen bg-[#0B0F19] text-gray-100 overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-[#1f2937] bg-[#0c111d] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo / Brand */}
          <div className="h-16 flex items-center px-6 border-b border-[#1f2937]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)]">
                <Code className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                SEO Meta-Agent
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-1">
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-blue-600/10 text-blue-400 font-medium">
              <LayoutDashboard className="w-5 h-5" />
              Dashboard
            </Link>
            <Link href="/dashboard/projects/new" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#1f2937] transition-colors">
              <FolderKanban className="w-5 h-5" />
              Projects
            </Link>
            <span title="Coming soon" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 cursor-not-allowed select-none">
              <FileText className="w-5 h-5" />
              Content Library
            </span>
            <span title="Coming soon" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 cursor-not-allowed select-none">
              <Pickaxe className="w-5 h-5" />
              API Logs
            </span>
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-4 border-t border-[#1f2937]">
          <Link href="/dashboard/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-[#1f2937] mb-2 transition-colors">
            <Settings className="w-5 h-5" />
            Settings
          </Link>
          <div className="px-3 py-3 rounded-lg bg-[#1f2937]/50 border border-[#1f2937] flex items-center justify-between">
            <div className="flex flex-col truncate pr-2">
              <span className="text-sm font-medium text-white truncate">{userEmail}</span>
              <span className="text-xs text-gray-500">SEO Meta-Agent</span>
            </div>
            <form action="/api/auth/signout" method="POST">
               <button 
                  type="submit"
                  className="text-gray-400 hover:text-red-400 transition-colors p-1"
                  title="Sign out"
                >
                 <LogOut className="w-4 h-4" />
               </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/4 w-1/2 h-64 bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />
        {children}
      </main>
    </div>
  );
}
