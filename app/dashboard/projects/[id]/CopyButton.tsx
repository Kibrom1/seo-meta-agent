"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className={`transition-colors ${copied ? "text-emerald-400" : "text-gray-400 hover:text-white"}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}
