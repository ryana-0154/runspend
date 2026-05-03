import {
  INGEST_BACKFILL_QUEUE,
  INGEST_INCREMENTAL_QUEUE,
  INGEST_RUN_QUEUE,
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

const connection = createRedis(redisUrl);
const concurrency = Number(process.env.INGEST_CONCURRENCY ?? 5);

const runWorker = new Worker(
  INGEST_RUN_QUEUE,
  async (job) => {
    logger.info({ queue: INGEST_RUN_QUEUE, jobId: job.id, data: job.data }, "received job");
  },
  { connection, concurrency },
);

const incrementalWorker = new Worker(
  INGEST_INCREMENTAL_QUEUE,
  async (job) => {
    logger.info({ queue: INGEST_INCREMENTAL_QUEUE, jobId: job.id, data: job.data }, "received job");
  },
  { connection, concurrency },
);

const backfillWorker = new Worker(
  INGEST_BACKFILL_QUEUE,
  async (job) => {
    logger.info({ queue: INGEST_BACKFILL_QUEUE, jobId: job.id, data: job.data }, "received job");
  },
  { connection, concurrency: 1 },
);

const workers = [runWorker, incrementalWorker, backfillWorker];

for (const w of workers) {
  w.on("failed", (job, err) => {
    logger.error(
      { queue: w.name, jobId: job?.id, err: err.message, stack: err.stack },
      "job failed",
    );
  });
  w.on("error", (err) => {
    logger.error({ queue: w.name, err: err.message }, "worker error");
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
