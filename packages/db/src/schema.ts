import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
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
