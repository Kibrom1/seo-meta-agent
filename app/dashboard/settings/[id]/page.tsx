"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Sparkles, Lock, Webhook, Zap,
  CheckCircle, XCircle, Loader2, TrendingUp, Trash2
} from "lucide-react";

interface ProjectSettings {
  id: string;
  brand_name: string;
  cms_type: string;
  tone_guidelines: string | null;
  linking_threshold: number;
  primary_locale: string;
  token_limit: number;
}

interface UsageForecast {
  tokens_used: number;
  token_limit: number;
  percent_used: number;
  projected_month_end: number;
  days_remaining_in_month: number;
  will_exceed: boolean;
  daily_breakdown: Array<{ day: string; total_tokens: number }>;
}

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [project, setProject] = useState<ProjectSettings | null>(null);
  const [forecast, setForecast] = useState<UsageForecast | null>(null);
  const [form, setForm] = useState({
    tone_guidelines: "",
    linking_threshold: 0.75,
    primary_locale: "en-US",
    api_key: "",
    webhook_secret: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) return;
    const data: ProjectSettings = await res.json();
    setProject(data);
    setForm(f => ({
      ...f,
      tone_guidelines: data.tone_guidelines ?? "",
      linking_threshold: data.linking_threshold,
      primary_locale: data.primary_locale,
    }));
  }, [id]);

  const loadForecast = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/usage`);
    if (!res.ok) return;
    setForecast(await res.json());
  }, [id]);

  useEffect(() => {
    loadProject();
    loadForecast();
  }, [loadProject, loadForecast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    const body: Record<string, unknown> = {
      tone_guidelines: form.tone_guidelines || null,
      linking_threshold: form.linking_threshold,
      primary_locale: form.primary_locale,
    };
    if (form.api_key) body.api_key = form.api_key;
    if (form.webhook_secret) body.webhook_secret = form.webhook_secret;

    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setSaveResult({ ok: true, message: "Settings saved successfully." });
      setForm(f => ({ ...f, api_key: "", webhook_secret: "" }));
      setTimeout(() => setSaveResult(null), 4000);
    } else {
      setSaveResult({ ok: false, message: data.error ?? "Failed to save settings." });
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setSaveResult({ ok: false, message: data.error ?? "Failed to delete project." });
      setDeleting(false);
    }
  }

  async function handleTestWebhook() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`/api/projects/${id}/test-webhook`, { method: "POST" });
    const data = await res.json();
    setTesting(false);
    setTestResult({ ok: data.ok, message: data.message });
    setTimeout(() => setTestResult(null), 8000);
  }

  // Inline SVG sparkline — no chart library
  function Sparkline({ data }: { data: Array<{ day: string; total_tokens: number }> }) {
    if (data.length === 0) return <p className="text-xs text-gray-600">No data yet this month.</p>;
    const max = Math.max(...data.map(d => d.total_tokens), 1);
    const width = 300;
    const height = 48;
    const barW = Math.floor(width / data.length) - 2;
    return (
      <svg width={width} height={height} className="w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.total_tokens / max) * height));
          return (
            <rect
              key={d.day}
              x={i * (barW + 2)}
              y={height - barH}
              width={barW}
              height={barH}
              rx={2}
              className="fill-violet-500/50"
            />
          );
        })}
      </svg>
    );
  }

  const inputClass = "w-full bg-[#0c111d] border border-[#1f2937] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 transition-colors";
  const labelClass = "block text-sm font-medium text-gray-300 mb-1.5";

  if (!project) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-20 text-center">
        <Loader2 className="w-8 h-8 text-gray-600 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 relative z-10">
      <Link href={`/dashboard/projects/${id}`}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8">
        <ChevronLeft className="w-4 h-4" />
        Back to {project.brand_name}
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Project Settings</h1>
        <p className="text-gray-400 text-sm">{project.brand_name} · {project.cms_type}</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Panel 1 — Workspace */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            Workspace
          </h2>

          <div>
            <label className={labelClass}>Tone Guidelines</label>
            <textarea
              value={form.tone_guidelines}
              onChange={e => setForm(f => ({ ...f, tone_guidelines: e.target.value }))}
              rows={3}
              placeholder="e.g. Professional, concise, and data-driven"
              className={`${inputClass} resize-none`}
            />
          </div>

          <div>
            <label className={labelClass}>
              Linking Threshold
              <span className="ml-2 text-violet-400 font-mono">{form.linking_threshold.toFixed(2)}</span>
            </label>
            <input
              type="range" min="0" max="1" step="0.05"
              value={form.linking_threshold}
              onChange={e => setForm(f => ({ ...f, linking_threshold: parseFloat(e.target.value) }))}
              className="w-full accent-violet-500"
            />
            <p className="text-xs text-gray-500 mt-1">Minimum cosine similarity for internal link recommendations. Higher = stricter.</p>
          </div>

          <div>
            <label className={labelClass}>Primary Locale</label>
            <input
              list="locales"
              value={form.primary_locale}
              onChange={e => setForm(f => ({ ...f, primary_locale: e.target.value }))}
              placeholder="en-US"
              className={inputClass}
            />
            <datalist id="locales">
              {["en-US","en-GB","de-DE","fr-FR","es-ES","it-IT","pt-BR","ja-JP","zh-CN","ko-KR"].map(l => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <p className="text-xs text-gray-500 mt-1">The locale used when reading and writing SEO fields in your CMS.</p>
          </div>
        </div>

        {/* Panel 2 — Credentials */}
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            Rotate Credentials
          </h2>
          <p className="text-xs text-gray-500">Leave blank to keep existing credentials.</p>

          <div>
            <label className={labelClass}>New Management API Key</label>
            <input type="password" value={form.api_key}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
              placeholder="Encrypted before storage"
              className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>New Webhook Secret</label>
            <input type="password" value={form.webhook_secret}
              onChange={e => setForm(f => ({ ...f, webhook_secret: e.target.value }))}
              placeholder="Must match your CMS webhook configuration"
              className={inputClass} />
          </div>
        </div>

        {/* Panel 3 — Test Connection */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3 flex items-center gap-2">
            <Webhook className="w-3.5 h-3.5 text-blue-400" />
            Test Connection
          </h2>
          <p className="text-xs text-gray-400">Fires a signed synthetic webhook at your project endpoint to verify the full HMAC round-trip.</p>

          <button type="button" onClick={handleTestWebhook} disabled={testing}
            className="flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 hover:text-blue-300 font-medium px-4 py-2.5 rounded-xl transition-all text-sm disabled:opacity-50">
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {testing ? "Testing..." : "Test Webhook"}
          </button>

          {testResult && (
            <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${testResult.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
              {testResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {testResult.message}
            </div>
          )}
        </div>

        {/* Panel 4 — Usage Forecast */}
        <div className="glass rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-widest border-b border-[#1f2937] pb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            Usage & Billing
          </h2>

          {forecast ? (
            <>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">This month</span>
                <span className="text-white font-medium">{forecast.percent_used}%</span>
              </div>
              <div className="w-full h-2.5 bg-[#0c111d] rounded-full overflow-hidden border border-[#1f2937]">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${forecast.will_exceed ? "from-red-500 to-amber-500" : "from-blue-500 to-violet-500"}`}
                  style={{ width: `${Math.min(100, forecast.percent_used)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span><span className="text-gray-300 font-medium">{forecast.tokens_used.toLocaleString()}</span> used</span>
                <span>{forecast.token_limit.toLocaleString()} limit</span>
              </div>

              <p className={`text-sm ${forecast.will_exceed ? "text-amber-400" : "text-gray-400"}`}>
                At current pace: ~<span className="font-medium text-white">{forecast.projected_month_end.toLocaleString()}</span> tokens by month end
                {forecast.will_exceed && " — you may hit your limit"}
              </p>

              {forecast.daily_breakdown.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-2">Daily usage this month</p>
                  <Sparkline data={forecast.daily_breakdown} />
                </div>
              )}

              {forecast.will_exceed && (
                <a href="mailto:billing@example.com"
                  className="inline-flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-medium px-4 py-2 rounded-xl text-sm transition-all">
                  Upgrade Plan &rarr;
                </a>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="h-2.5 bg-[#1f2937] rounded-full animate-pulse" />
              <div className="h-4 bg-[#1f2937] rounded w-48 animate-pulse" />
            </div>
          )}
        </div>

        {/* Panel 5 — Danger Zone */}
        <div className="glass rounded-2xl p-6 space-y-4 border-red-500/20">
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-widest border-b border-red-500/20 pb-3 flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5" />
            Danger Zone
          </h2>
          <p className="text-xs text-gray-400">
            Permanently delete <span className="text-white font-medium">{project.brand_name}</span> and all its tasks, audit logs, and embeddings.
            This cannot be undone.
          </p>
          <p className="text-xs text-gray-500">
            Type <span className="text-gray-300 font-mono">{project.brand_name}</span> to confirm.
          </p>
          <input
            value={deleteConfirm}
            onChange={e => setDeleteConfirm(e.target.value)}
            placeholder={project.brand_name}
            className="w-full bg-[#0c111d] border border-red-500/20 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-700 focus:outline-none focus:border-red-500/50 transition-colors"
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteConfirm !== project.brand_name || deleting}
            className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 font-medium px-4 py-2.5 rounded-xl transition-all text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? "Deleting..." : "Delete Project"}
          </button>
        </div>

        {/* Save result */}
        {saveResult && (
          <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${saveResult.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"}`}>
            {saveResult.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            {saveResult.message}
          </div>
        )}

        <div className="flex gap-3">
          <Link href={`/dashboard/projects/${id}`}
            className="flex-1 text-center py-2.5 rounded-xl border border-[#1f2937] text-gray-400 hover:text-white hover:border-[#374151] text-sm font-medium transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={saving}
            className="flex-1 bg-brand-violet hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_25px_rgba(139,92,246,0.5)] text-sm flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
