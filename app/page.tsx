import Link from "next/link";
import { Code, Zap, FileText, Link2, Image as ImageIcon, ArrowRight, CheckCircle } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100">
      {/* Nav */}
      <header className="border-b border-[#1f2937] bg-[#0c111d]/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.5)]">
              <Code className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              SEO Meta-Agent
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium bg-brand-violet hover:bg-violet-500 text-white px-4 py-2 rounded-xl transition-all shadow-[0_0_15px_rgba(139,92,246,0.3)]"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-1/2 h-96 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 py-28 text-center relative z-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold bg-violet-500/10 border border-violet-500/20 text-violet-300 px-3 py-1.5 rounded-full mb-8">
            <Zap className="w-3.5 h-3.5" />
            Powered by Claude Sonnet
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Your CMS publishes.<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-blue-400">
              AI writes the SEO.
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            SEO Meta-Agent hooks into your CMS webhook and automatically generates
            optimised titles, meta descriptions, alt text, and internal link suggestions
            — the moment you hit publish.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-brand-violet hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-[0_0_25px_rgba(139,92,246,0.4)] hover:shadow-[0_0_35px_rgba(139,92,246,0.6)] text-base"
            >
              Connect your CMS
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white border border-[#1f2937] hover:border-[#374151] px-6 py-3 rounded-xl transition-all text-base"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <p className="text-center text-xs font-semibold text-gray-500 uppercase tracking-widest mb-12">
          Three AI agents. One webhook.
        </p>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              icon: <FileText className="w-5 h-5 text-violet-400" />,
              title: "Metadata Generation",
              desc: "Produces a 50–60 char SEO title and 140–155 char meta description calibrated to your brand tone. Validates character constraints before writing back.",
            },
            {
              icon: <ImageIcon className="w-5 h-5 text-blue-400" />,
              title: "Alt Text via Vision",
              desc: "Claude's vision model analyses each published image and generates descriptive, keyword-rich alt text. Skips decorative assets automatically.",
            },
            {
              icon: <Link2 className="w-5 h-5 text-emerald-400" />,
              title: "Internal Link Suggestions",
              desc: "pgvector RAG query finds the most semantically related entries in your content graph and suggests anchor text and placement — advisory, not auto-inserted.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-[#0c111d] border border-[#1f2937] rounded-2xl p-6 hover:border-[#374151] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-[#111827] border border-[#1f2937] flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-[#1f2937] bg-[#0c111d]/50">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold text-white text-center mb-12">Up and running in minutes</h2>
          <ol className="space-y-6">
            {[
              ["Connect your CMS", "Create a project, add your Contentful, Strapi, or Sanity management API key, and paste the generated webhook URL into your CMS settings."],
              ["Publish content", "Every time an editor publishes or updates an entry, the CMS fires a signed webhook. SEO Meta-Agent validates the HMAC signature and queues the job."],
              ["AI writes, CMS updates", "Claude processes the content in the background and writes SEO fields directly back to your CMS entry — no manual copy-paste required."],
              ["Review in the audit log", "Every field change is recorded: original value, AI-generated value, tokens used, timestamp. Full transparency, always reversible."],
            ].map(([title, desc], i) => (
              <li key={title} className="flex gap-5">
                <span className="w-7 h-7 rounded-full bg-brand-violet/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium text-white mb-1">{title}</p>
                  <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trust signals */}
      <section className="border-t border-[#1f2937]">
        <div className="max-w-4xl mx-auto px-6 py-16 grid sm:grid-cols-3 gap-8 text-center">
          {[
            ["Collision-safe", "Never overwrites a field an editor has already filled in."],
            ["HMAC-secured", "Every inbound webhook is validated with SHA-256 before processing."],
            ["Retry resilient", "Exponential backoff with 3 attempts. Failed tasks surfaced in dashboard with one-click retry."],
          ].map(([title, desc]) => (
            <div key={title}>
              <CheckCircle className="w-5 h-5 text-emerald-400 mx-auto mb-3" />
              <p className="font-semibold text-white mb-1">{title}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[#1f2937] bg-gradient-to-b from-[#0c111d] to-[#0B0F19]">
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Stop writing meta tags by hand.</h2>
          <p className="text-gray-400 mb-8">Connect your first CMS workspace for free.</p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-brand-violet hover:bg-violet-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:shadow-[0_0_40px_rgba(139,92,246,0.6)] text-base"
          >
            Get started free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1f2937] bg-[#0c111d]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-xs text-gray-600">
          <span>SEO Meta-Agent</span>
          <Link href="/login" className="hover:text-gray-400 transition-colors">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
