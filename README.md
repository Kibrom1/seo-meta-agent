# SEO Meta-Agent

Autonomous SEO metadata management for headless CMS platforms. When an editor publishes content, a webhook fires and an AI agent automatically generates SEO titles, meta descriptions, alt text, and internal link suggestions — writing results back to the CMS without any manual intervention.

Supported CMS: **Contentful**, **Strapi**, **Sanity**

---

## Architecture

```
Editor saves content
  → CMS webhook → POST /api/webhook/cms-event  (HMAC SHA-256 validated)
  → BullMQ job enqueued in Upstash Redis
  → Worker process picks up job:
      metadata_gen      → Claude generates SEO title + meta description
      alt_text_vision   → Claude Vision generates image alt text
      internal_linking  → pgvector RAG finds related entries
  → CMS Management SDK writes fields back to the original entry
  → Supabase audit_logs records old/new values
```

The **Next.js app** (Vercel) handles the API routes and dashboard UI. The **worker** (`worker/index.ts`) is a long-running Node process deployed separately (Railway, Render, Fly.io).

---

## Setup

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill in every value:

```bash
cp .env.example .env.local
```

| Variable | How to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings → API (keep secret) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `OPENAI_API_KEY` | platform.openai.com (used for embeddings) |
| `UPSTASH_REDIS_REST_URL` | Upstash console → Redis → Connect → ioredis URL (`rediss://`) |
| `ENCRYPTION_SECRET` | `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → signing secret |

### 2. Database migrations

Apply the schema to your Supabase project:

```bash
npx supabase db push
# or manually run:
# supabase/migrations/001_initial_schema.sql
# supabase/migrations/002_rls_policies.sql
```

### 3. Install dependencies

```bash
npm install
```

### 4. Run the Next.js dev server

```bash
npm run dev        # http://localhost:3000
```

### 5. Run the worker (separate terminal)

```bash
npm run worker:dev    # tsx watch — auto-restarts on file changes
# or in production:
npm run worker
```

The worker must be running to process jobs. It connects to Upstash Redis and Supabase using the service role key.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run worker` | Start BullMQ worker |
| `npm run worker:dev` | Worker with auto-restart |
| `npm test` | Run unit tests (vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run type-check` | TypeScript check without emitting |
| `npm run lint` | ESLint |

---

## Webhook setup in your CMS

Point your CMS webhook to:

```
POST https://your-domain.com/api/webhook/cms-event?projectId=<YOUR_PROJECT_ID>
```

Set the webhook secret to the value you entered when creating the project in the dashboard. The route validates the `X-Hub-Signature-256` header using HMAC SHA-256.

> **Local testing:** HMAC validation is temporarily bypassed in `app/api/webhook/cms-event/route.ts`. Re-enable it before deploying to production.

---

## Key design constraints

- **Collision avoidance** — SEO fields that already have a human-entered value are never overwritten.
- **Anti-hallucination** — Content under 50 words is rejected and the task is sent to the Dead Letter Queue instead of retried.
- **Retry policy** — Exponential backoff, 3 attempts, then DLQ.
- **Token budget** — Each project has a monthly token limit. Requests over the limit receive a 429.
- **Prompt versioning** — System prompts live in `lib/prompts/v1/`. Never mutate production prompts in-place; create a new version folder.
