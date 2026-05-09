import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["trial", "starter", "growth", "scale", "cancelled"]);

export const orgRoleEnum = pgEnum("org_role", ["owner", "member"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubUserId: bigint("github_user_id", { mode: "bigint" }).notNull(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_github_user_id_idx").on(t.githubUserId)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    githubOrgId: bigint("github_org_id", { mode: "bigint" }).notNull(),
    githubLogin: text("github_login").notNull(),
    installationId: bigint("installation_id", { mode: "bigint" }).notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    plan: planEnum("plan").notNull().default("trial"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organizations_github_org_id_idx").on(t.githubOrgId),
    uniqueIndex("organizations_installation_id_idx").on(t.installationId),
  ],
);

export const orgMemberships = pgTable(
  "org_memberships",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_memberships_user_org_idx").on(t.userId, t.orgId)],
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubRepoId: bigint("github_repo_id", { mode: "bigint" }).notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch"),
    isPrivate: boolean("is_private").notNull().default(false),
    active: boolean("active").notNull().default(true),
    lastIngestedRunId: bigint("last_ingested_run_id", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("repositories_github_repo_id_idx").on(t.githubRepoId),
    index("repositories_org_id_active_idx").on(t.orgId).where(sql`${t.active} = true`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrgMembership = typeof orgMemberships.$inferSelect;
export type NewOrgMembership = typeof orgMemberships.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export const runnerOsEnum = pgEnum("runner_os", ["ubuntu", "windows", "macos", "self-hosted"]);

export const workflowStateEnum = pgEnum("workflow_state", [
  "active",
  "deleted",
  "disabled_fork",
  "disabled_inactivity",
  "disabled_manually",
]);

export const ingestKindEnum = pgEnum("ingest_kind", ["backfill", "incremental"]);

export const ingestStatusEnum = pgEnum("ingest_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubWorkflowId: bigint("github_workflow_id", { mode: "bigint" }).notNull(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    state: workflowStateEnum("state").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("workflows_github_workflow_id_idx").on(t.githubWorkflowId)],
);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubRunId: bigint("github_run_id", { mode: "bigint" }).notNull(),
    runNumber: integer("run_number").notNull(),
    event: text("event").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    headBranch: text("head_branch"),
    headSha: text("head_sha"),
    actorLogin: text("actor_login"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    totalDurationMs: integer("total_duration_ms"),
    billableDurationMs: integer("billable_duration_ms"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workflow_runs_github_run_id_idx").on(t.githubRunId),
    index("workflow_runs_org_started_idx").on(t.orgId, t.startedAt),
    index("workflow_runs_workflow_started_idx").on(t.workflowId, t.startedAt),
  ],
);

export const workflowJobs = pgTable(
  "workflow_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runId: uuid("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    githubJobId: bigint("github_job_id", { mode: "bigint" }).notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    runnerOs: runnerOsEnum("runner_os").notNull(),
    runnerLabel: text("runner_label"),
    runnerSize: text("runner_size"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    billableDurationMs: integer("billable_duration_ms"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workflow_jobs_github_job_id_idx").on(t.githubJobId),
    index("workflow_jobs_run_id_idx").on(t.runId),
  ],
);

export const ingestJobs = pgTable("ingest_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  kind: ingestKindEnum("kind").notNull(),
  status: ingestStatusEnum("status").notNull().default("pending"),
  cursor: text("cursor"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runnerPricing = pgTable(
  "runner_pricing",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    runnerOs: runnerOsEnum("runner_os").notNull(),
    runnerLabel: text("runner_label"),
    perMinuteUsd: numeric("per_minute_usd", { precision: 10, scale: 6 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runner_pricing_os_label_idx").on(t.runnerOs, sql`coalesce(${t.runnerLabel}, '')`),
  ],
);

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
export type WorkflowJob = typeof workflowJobs.$inferSelect;
export type NewWorkflowJob = typeof workflowJobs.$inferInsert;
export type IngestJob = typeof ingestJobs.$inferSelect;
export type NewIngestJob = typeof ingestJobs.$inferInsert;
export type RunnerPricing = typeof runnerPricing.$inferSelect;
export type NewRunnerPricing = typeof runnerPricing.$inferInsert;

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
  "paused",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    plan: planEnum("plan").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_subscription_id_idx").on(t.stripeSubscriptionId),
    index("subscriptions_org_id_idx").on(t.orgId),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
