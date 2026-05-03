/**
 * Queue names and payload types shared between the web app (which enqueues
 * jobs) and the ingest worker (which consumes them). Concrete Queue/Worker
 * instances live in `workers/ingest/` — this module only defines the contract.
 */

export const INGEST_RUN_QUEUE = "ingest:run";
export const INGEST_INCREMENTAL_QUEUE = "ingest:incremental";
export const INGEST_BACKFILL_QUEUE = "ingest:backfill";

export type IngestQueueName =
  | typeof INGEST_RUN_QUEUE
  | typeof INGEST_INCREMENTAL_QUEUE
  | typeof INGEST_BACKFILL_QUEUE;

/** Single workflow_run ingest, enqueued from the `workflow_run.completed` webhook. */
export interface IngestRunPayload {
  orgId: string;
  repoId: string;
  githubRunId: string;
}

/** Hourly per-repo poll for new completed runs since `last_ingested_run`. */
export interface IngestIncrementalPayload {
  orgId: string;
  repoId: string;
}

/** Initial 30-day backfill kicked off when an org installs the GitHub App. */
export interface IngestBackfillPayload {
  orgId: string;
  repoId: string;
  /** ISO-8601 lower bound; defaults to now - 30d when omitted. */
  since?: string;
}

export interface IngestQueuePayloads {
  [INGEST_RUN_QUEUE]: IngestRunPayload;
  [INGEST_INCREMENTAL_QUEUE]: IngestIncrementalPayload;
  [INGEST_BACKFILL_QUEUE]: IngestBackfillPayload;
}
