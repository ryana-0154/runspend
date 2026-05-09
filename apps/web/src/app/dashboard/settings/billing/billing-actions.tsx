"use client";

import type { PaidPlan } from "@runspend/billing";
import { useState } from "react";

interface UpgradeButtonProps {
  orgId: string;
  plan: PaidPlan;
  label: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

async function startCheckout(orgId: string, plan: PaidPlan): Promise<void> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId, plan }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `checkout failed (${res.status})`);
  window.location.assign(data.url);
}

async function openPortal(orgId: string): Promise<void> {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgId }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `portal failed (${res.status})`);
  window.location.assign(data.url);
}

export function UpgradeButton({
  orgId,
  plan,
  label,
  variant = "primary",
  disabled,
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base =
    "inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-sm font-medium transition-colors disabled:opacity-50";
  const styles =
    variant === "primary"
      ? "bg-foreground text-background hover:bg-foreground/90"
      : "border border-border bg-card text-foreground hover:bg-muted";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await startCheckout(orgId, plan);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        }}
        className={`${base} ${styles}`}
      >
        {loading ? "Redirecting…" : label}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}

export function ManageSubscriptionButton({ orgId }: { orgId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await openPortal(orgId);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setLoading(false);
          }
        }}
        className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        {loading ? "Opening portal…" : "Manage subscription"}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
