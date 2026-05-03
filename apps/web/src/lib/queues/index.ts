import {
  INGEST_BACKFILL_QUEUE,
  INGEST_INCREMENTAL_QUEUE,
  INGEST_RUN_QUEUE,
  type IngestBackfillPayload,
  type IngestIncrementalPayload,
  type IngestRunPayload,
} from "@runspend/shared";
import { Queue } from "bullmq";
import { Redis, type RedisOptions } from "ioredis";

const bullmqDefaults: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

let cachedConnection: Redis | undefined;
function getConnection(): Redis {
  if (cachedConnection) return cachedConnection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required to enqueue ingest jobs");
  cachedConnection = new Redis(url, bullmqDefaults);
  return cachedConnection;
}

let cachedRunQueue: Queue<IngestRunPayload> | undefined;
let cachedIncrementalQueue: Queue<IngestIncrementalPayload> | undefined;
let cachedBackfillQueue: Queue<IngestBackfillPayload> | undefined;

function runQueue(): Queue<IngestRunPayload> {
  if (!cachedRunQueue) {
    cachedRunQueue = new Queue<IngestRunPayload>(INGEST_RUN_QUEUE, { connection: getConnection() });
  }
  return cachedRunQueue;
}

function incrementalQueue(): Queue<IngestIncrementalPayload> {
  if (!cachedIncrementalQueue) {
    cachedIncrementalQueue = new Queue<IngestIncrementalPayload>(INGEST_INCREMENTAL_QUEUE, {
      connection: getConnection(),
    });
  }
  return cachedIncrementalQueue;
}

function backfillQueue(): Queue<IngestBackfillPayload> {
  if (!cachedBackfillQueue) {
    cachedBackfillQueue = new Queue<IngestBackfillPayload>(INGEST_BACKFILL_QUEUE, {
      connection: getConnection(),
    });
  }
  return cachedBackfillQueue;
}

/**
 * Enqueue ingest of a single workflow run. Idempotent on `githubRunId`: a job
 * with the same id is a no-op when re-enqueued, so webhook redelivery is safe.
 */
export async function enqueueRunIngest(payload: IngestRunPayload): Promise<void> {
  await runQueue().add("ingest-run", payload, {
    jobId: `run:${payload.githubRunId}`,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
  });
}

export async function enqueueIncremental(payload: IngestIncrementalPayload): Promise<void> {
  await incrementalQueue().add("ingest-incremental", payload, {
    jobId: `incremental:${payload.repoId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
  });
}

export async function enqueueBackfill(payload: IngestBackfillPayload): Promise<void> {
  await backfillQueue().add("ingest-backfill", payload, {
    jobId: `backfill:${payload.repoId}`,
    removeOnComplete: 100,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
  });
}

const HOURLY_MS = 60 * 60_000;

/**
 * Register (or refresh) the per-repo hourly incremental poller. Uses
 * `upsertJobScheduler` so calling this twice for the same repo is a no-op
 * — the schedulerId acts as the dedupe key. Per spec §4.3, polls hourly.
 */
export async function registerIncrementalSchedule(
  payload: IngestIncrementalPayload,
): Promise<void> {
  await incrementalQueue().upsertJobScheduler(
    `incremental-sched:${payload.repoId}`,
    { every: HOURLY_MS },
    {
      name: "ingest-incremental",
      data: payload,
      opts: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: "exponential", delay: 30_000 },
      },
    },
  );
}

/** Stop polling a repo (e.g. plan-limit deactivation, install removed). */
export async function unregisterIncrementalSchedule(repoId: string): Promise<void> {
  await incrementalQueue().removeJobScheduler(`incremental-sched:${repoId}`);
}

/**
 * Convenience: kick off ingest for a freshly activated repo. Enqueues a
 * 30-day backfill and registers the hourly incremental poller. Idempotent
 * on `repoId` so repeated calls (re-install, webhook replay) collapse.
 */
export async function kickoffRepoIngest(input: {
  orgId: string;
  repoId: string;
  /** ISO-8601 lower bound; defaults to now - 30d (worker default). */
  since?: string;
}): Promise<void> {
  await enqueueBackfill(input);
  await registerIncrementalSchedule({ orgId: input.orgId, repoId: input.repoId });
}
