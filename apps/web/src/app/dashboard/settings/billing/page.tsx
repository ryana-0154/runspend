import { type AccessState, PLAN_REPO_LIMIT, resolveAccess } from "@runspend/billing";
import { getDb, repositories, subscriptions } from "@runspend/db";
import { and, count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { billingEnabled } from "@/lib/billing/enabled";
import { getUserOrgs } from "@/lib/db/user-orgs";
import { dashboardNav } from "@/lib/nav";
import { ManageSubscriptionButton, UpgradeButton } from "./billing-actions";

interface Search {
  status?: string;
}

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { status } = await searchParams;
  const db = getDb();
  const orgs = await getUserOrgs(db, session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const billingOn = billingEnabled();

  // v1: bill per org. We render one card per org the user owns; member-only
  // orgs are read-only on this page.
  const ownerOrgs = orgs.filter((o) => o.role === "owner");

  const cards = await Promise.all(
    ownerOrgs.map(async ({ org }) => {
      const [activeRepoCountRow] = await db
        .select({ value: count() })
        .from(repositories)
        .where(and(eq(repositories.orgId, org.id), eq(repositories.active, true)));
      const [latestSub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.orgId, org.id))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(1);

      const access = resolveAccess({ org, subscription: latestSub ?? null });
      return {
        org,
        access,
        subscription: latestSub ?? null,
        activeRepoCount: activeRepoCountRow?.value ?? 0,
      };
    }),
  );

  const email = session.user.email ?? "unknown";

  return (
    <DashboardShell email={email} nav={dashboardNav("settings")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan and subscription for each connected organization.
        </p>
      </div>

      {!billingOn ? (
        <p className="mt-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Billing is disabled in this environment (BILLING_ENABLED=false). Plans, checkout, and
          enforcement are all bypassed — every org behaves as if it has an active paid plan.
        </p>
      ) : null}

      {status === "success" ? (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Subscription updated. It can take a few seconds for the new plan to appear here.
        </p>
      ) : null}
      {status === "cancelled" ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout cancelled — no changes were made.
        </p>
      ) : null}

      {cards.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          You're not the owner of any connected organization. Ask the owner to manage billing.
        </p>
      ) : (
        <div className="mt-8 space-y-4">
          {cards.map(({ org, access, activeRepoCount }) => (
            <article
              key={org.id}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-mono text-lg font-medium">{org.githubLogin}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {planSummary(org.plan)} · {activeRepoCount} of {PLAN_REPO_LIMIT[org.plan]} repos
                    active
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                    {accessSummary(access)}
                  </p>
                </div>
                {billingOn && org.stripeCustomerId ? (
                  <ManageSubscriptionButton orgId={org.id} />
                ) : null}
              </div>

              {billingOn ? (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <PlanTile
                    title="Starter"
                    blurb={`Up to ${PLAN_REPO_LIMIT.starter} active repos.`}
                    action={
                      <UpgradeButton
                        orgId={org.id}
                        plan="starter"
                        label={org.plan === "starter" ? "Current" : "Choose Starter"}
                        variant="secondary"
                        disabled={org.plan === "starter"}
                      />
                    }
                    current={org.plan === "starter"}
                  />
                  <PlanTile
                    title="Growth"
                    blurb={`Up to ${PLAN_REPO_LIMIT.growth} active repos.`}
                    action={
                      <UpgradeButton
                        orgId={org.id}
                        plan="growth"
                        label={org.plan === "growth" ? "Current" : "Choose Growth"}
                        variant="primary"
                        disabled={org.plan === "growth"}
                      />
                    }
                    current={org.plan === "growth"}
                  />
                  <PlanTile
                    title="Scale"
                    blurb={`Up to ${PLAN_REPO_LIMIT.scale} active repos.`}
                    action={
                      <UpgradeButton
                        orgId={org.id}
                        plan="scale"
                        label={org.plan === "scale" ? "Current" : "Choose Scale"}
                        variant="secondary"
                        disabled={org.plan === "scale"}
                      />
                    }
                    current={org.plan === "scale"}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}

function planSummary(plan: string): string {
  if (plan === "trial") return "Trial";
  if (plan === "cancelled") return "Cancelled";
  return `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

function accessSummary(state: AccessState): string {
  switch (state.kind) {
    case "trial_active":
      return `Trial · ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left`;
    case "trial_expired":
      return "Trial expired — ingest paused. Upgrade to resume.";
    case "paid_active":
      return "Subscription active";
    case "paid_past_due":
      return "Payment past due — update your card to resume ingest";
    case "cancelled":
      return "Subscription cancelled";
  }
}

function PlanTile({
  title,
  blurb,
  action,
  current,
}: {
  title: string;
  blurb: string;
  action: React.ReactNode;
  current: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        current ? "border-foreground/40 bg-muted/40" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {current ? (
          <span className="rounded-md bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            Current
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      <div className="mt-3">{action}</div>
    </div>
  );
}
