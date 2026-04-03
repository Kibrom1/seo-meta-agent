"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lock, Webhook, Sparkles } from "lucide-react";
import Link from "next/link";

type CmsType = "Contentful" | "Strapi" | "Sanity";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    brand_name: "",
    cms_type: "Contentful" as CmsType,
    api_key: "",
    webhook_secret: "",
    tone_guidelines: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Failed to create project");
      setLoading(false);
      return;
    }

    router.push(`/dashboard/projects/${result.id}`);
  }

  const set =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 relative z-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          Connect a CMS
        </h1>
        <p className="text-gray-400 text-sm">
          Configure a new workspace. Your API key is encrypted at rest using
          AES-256.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Brand & CMS */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3">
            Workspace
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Brand Name
            </label>
            <input
              required
              value={form.brand_name}
              onChange={set("brand_name")}
              placeholder="Acme Corp"
              className="w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              CMS Platform
            </label>
            <select
              value={form.cms_type}
              onChange={set("cms_type")}
              className="w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors"
            >
              <option value="Contentful">Contentful</option>
              <option value="Strapi">Strapi</option>
              <option value="Sanity">Sanity</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              Tone Guidelines
              <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.tone_guidelines}
              onChange={set("tone_guidelines")}
              rows={2}
              placeholder="e.g. Professional, concise, and data-driven"
              className="w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors resize-none"
            />
          </div>
        </div>

        {/* Credentials */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            Credentials
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Management API Key
            </label>
            <input
              required
              type="password"
              value={form.api_key}
              onChange={set("api_key")}
              placeholder="Encrypted before storage"
              className="w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Webhook className="w-3.5 h-3.5 text-blue-400" />
              Webhook Secret
            </label>
            <input
              required
              type="password"
              value={form.webhook_secret}
              onChange={set("webhook_secret")}
              placeholder="Used to validate HMAC signatures"
              className="w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors"
            />
            <p className="text-xs text-gray-500 mt-2">
              Set this same value in your CMS webhook configuration so every
              inbound request is HMAC-verified.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="flex-1 text-center py-2.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-white hover:border-[#374151] text-sm font-medium transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-brand-violet hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] text-sm"
          >
            {loading ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}
