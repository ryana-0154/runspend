CREATE TYPE "public"."org_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('trial', 'starter', 'growth', 'scale', 'cancelled');--> statement-breakpoint
CREATE TABLE "org_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "org_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_org_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"installation_id" bigint NOT NULL,
	"stripe_customer_id" text,
	"plan" "plan" DEFAULT 'trial' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_user_id" bigint NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_memberships_user_org_idx" ON "org_memberships" USING btree ("user_id","org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_github_org_id_idx" ON "organizations" USING btree ("github_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_installation_id_idx" ON "organizations" USING btree ("installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_user_id_idx" ON "users" USING btree ("github_user_id");