import { getDb } from "@runspend/db";
import {
  type GithubAppConfig,
  ingestIncremental,
  ingestRunsSince,
  ingestSingleRun,
} from "@runspend/github";
import {
  INGEST_BACKFILL_QUEUE,
  INGEST_INCREMENTAL_QUEUE,
  INGEST_RUN_QUEUE,
  type IngestBackfillPayload,
  type IngestIncrementalPayload,
  type IngestRunPayload,
  logger,
} from "@runspend/shared";
import { Worker } from "bullmq";
import { startHealthServer } from "./health";
import { createRedis } from "./redis";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  logger.error("REDIS_URL is required to start the ingest worker");
  process.exit(1);
}

const appId = process.env.GITHUB_APP_ID;
const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
if (!appId || !privateKey) {
  logger.error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required to start the ingest worker");
  process.exit(1);
}
const githubConfig: GithubAppConfig = { appId, privateKey };

const db = getDb();
const connection = createRedis(redisUrl);
const concurrency = Number(process.env.INGEST_CONCURRENCY ?? 5);

const runWorker = new Worker<IngestRunPayload>(
  INGEST_RUN_QUEUE,
  async (job) => {
    logger.info({ queue: INGEST_RUN_QUEUE, jobId: job.id, data: job.data }, "ingest run start");
    const result = await ingestSingleRun(githubConfig, db, job.data);
    logger.info({ queue: INGEST_RUN_QUEUE, jobId: job.id, ...result }, "ingest run done");
  },
  { connection, concurrency },
);

const incrementalWorker = new Worker<IngestIncrementalPayload>(
  INGEST_INCREMENTAL_QUEUE,
  async (job) => {
    logger.info(
      { queue: INGEST_INCREMENTAL_QUEUE, jobId: job.id, data: job.data },
      "ingest incremental start",
    );
    const result = await ingestIncremental(githubConfig, db, job.data);
    logger.info(
      { queue: INGEST_INCREMENTAL_QUEUE, jobId: job.id, ...result },
      "ingest incremental done",
    );
  },
  { connection, concurrency },
);

const backfillWorker = new Worker<IngestBackfillPayload>(
  INGEST_BACKFILL_QUEUE,
  async (job) => {
    logger.info(
      { queue: INGEST_BACKFILL_QUEUE, jobId: job.id, data: job.data },
      "ingest backfill start",
    );
    const result = await ingestRunsSince(githubConfig, db, {
      orgId: job.data.orgId,
      repoId: job.data.repoId,
      since: job.data.since,
    });
    logger.info({ queue: INGEST_BACKFILL_QUEUE, jobId: job.id, ...result }, "ingest backfill done");
  },
  { connection, concurrency: 1 },
);

const workers = [runWorker, incrementalWorker, backfillWorker];

for (const w of workers) {
  w.on("failed", (job, err) => {
    logger.error(
      {
        queue: w.name,
        jobId: job?.id,
        jobName: job?.name,
        data: job?.data,
        err: err.message,
        stack: err.stack,
      },
      `job failed (${w.name}) — ${err.message}`,
    );
  });
  w.on("error", (err) => {
    logger.error({ queue: w.name, err: err.message }, `worker error (${w.name}) — ${err.message}`);
  });
}

const healthServer = startHealthServer({
  port: Number(process.env.HEALTH_PORT ?? 9100),
  redis: connection,
});

logger.info({ concurrency, queues: workers.map((w) => w.name) }, "ingest worker started");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutdown signal received, draining workers");

  await Promise.allSettled(workers.map((w) => w.close()));
  await new Promise<void>((resolve) => {
    healthServer.close(() => resolve());
  });
  await connection.quit().catch(() => connection.disconnect());

  logger.info("shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
