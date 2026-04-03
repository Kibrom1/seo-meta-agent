import { Queue, Worker, type Processor } from "bullmq";
import Redis from "ioredis";
import type { SeoJobData } from "@/types";

// Upstash Redis requires TLS — use rediss:// protocol
function createRedisConnection() {
  return new Redis(process.env.UPSTASH_REDIS_REST_URL!, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    tls: process.env.UPSTASH_REDIS_REST_URL?.startsWith("rediss://") ? {} : undefined,
  });
}

const QUEUE_NAME = "seo-tasks";

// Export the Queue separately from the Worker so Next.js API routes
// can import only the Queue (to enqueue) without instantiating a Worker
// (which would try to run a long-lived process inside a serverless function).
export const seoQueue = new Queue<SeoJobData>(QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }, // 2s → 4s → 8s
    removeOnComplete: { count: 1000 },
    removeOnFail: false, // Keep failed jobs for inspection
  },
});

// Job options applied per enqueue call (can be overridden)
export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
};

// Worker factory — imported only by worker/index.ts, not by Next.js routes.
export function createWorker(processor: Processor<SeoJobData>): Worker<SeoJobData> {
  return new Worker<SeoJobData>(QUEUE_NAME, processor, {
    connection: createRedisConnection(),
    concurrency: 5,       // Max 5 parallel Claude API calls
    limiter: {
      max: 50,            // Max 50 jobs per minute (Anthropic Tier-1 RPM safe)
      duration: 60_000,
    },
  });
}
