"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, AlertTriangle } from "lucide-react";

interface RetryButtonProps {
  projectId: string;
  failedCount: number;
}

export function RetryButton({ projectId, failedCount }: RetryButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/retry`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `Retry failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRetry}
        disabled={loading}
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Retrying…" : `Retry ${failedCount} Failed`}
      </button>
      {error && (
        <span className="text-xs text-red-400 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          {error}
        </span>
      )}
    </div>
  );
}
