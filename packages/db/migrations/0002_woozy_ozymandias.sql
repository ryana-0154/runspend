CREATE TYPE "public"."ingest_kind" AS ENUM('backfill', 'incremental');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."runner_os" AS ENUM('ubuntu', 'windows', 'macos', 'self-hosted');--> statement-breakpoint
CREATE TYPE "public"."workflow_state" AS ENUM('active', 'deleted', 'disabled_fork', 'disabled_inactivity', 'disabled_manually');--> statement-breakpoint
CREATE TABLE "ingest_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "ingest_kind" NOT NULL,
	"status" "ingest_status" DEFAULT 'pending' NOT NULL,
	"cursor" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runner_os" "runner_os" NOT NULL,
	"runner_label" text,
	"per_minute_usd" numeric(10, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"github_job_id" bigint NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"runner_os" "runner_os" NOT NULL,
	"runner_label" text,
	"runner_size" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"billable_duration_ms" integer,
	"estimated_cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"github_run_id" bigint NOT NULL,
	"run_number" integer NOT NULL,
	"event" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"head_branch" text,
	"head_sha" text,
	"actor_login" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_duration_ms" integer,
	"billable_duration_ms" integer,
	"estimated_cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"github_workflow_id" bigint NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"state" "workflow_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingest_jobs" ADD CONSTRAINT "ingest_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_jobs" ADD CONSTRAINT "workflow_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_repo_id_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runner_pricing_os_label_idx" ON "runner_pricing" USING btree ("runner_os",coalesce("runner_label", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_jobs_github_job_id_idx" ON "workflow_jobs" USING btree ("github_job_id");--> statement-breakpoint
CREATE INDEX "workflow_jobs_run_id_idx" ON "workflow_jobs" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_github_run_id_idx" ON "workflow_runs" USING btree ("github_run_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_org_started_idx" ON "workflow_runs" USING btree ("org_id","started_at");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_started_idx" ON "workflow_runs" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_github_workflow_id_idx" ON "workflows" USING btree ("github_workflow_id");