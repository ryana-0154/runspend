# PRD — GitHub Actions Cost Analyzer (working name: `runspend`)

## 1. Summary

- **What**: A SaaS that connects to a GitHub organization and shows where CI minutes (and dollars) are being spent across workflows, repos, and runners.
- **Who**: Engineering / Platform / DevEx leads at orgs spending **$500–$15,000/mo** on GitHub Actions.
- **Why now**: GitHub's native usage UI is shallow; teams know they're overspending but can't pinpoint where. Existing tools target enterprise; SMB segment is underserved.

## 2. Problem

- CI bills grow silently — nobody owns optimization.
- GitHub's billing page shows totals, not attribution.
- Engineers can't answer: *"Which workflow is most expensive? Which job is wasteful? What's my cache hit ratio?"*
- Self-hosted runner sprawl is invisible to finance.

## 3. v1 Scope (this PRD)

**In scope**:
- GitHub App + GitHub OAuth sign-in
- Ingest workflow runs + jobs for selected org
- Cost calculation per run/job (using public GitHub-hosted runner pricing)
- Dashboard: spend overview, top workflows by cost, top repos by cost, runner-OS breakdown, trend over time
- Stripe billing (3 tiers, monthly)
- Org-level multi-tenancy

**Explicitly out of scope (v2+)**:
- Flake detection / test reliability
- Weekly digest emails
- Recommendations engine ("split this matrix")
- Self-hosted runner cost modeling
- GitLab / CircleCI / Buildkite support
- Per-team / per-author attribution
- Slack integration

## 4. Target user persona

- "**Priya, Platform Lead at a 40-person Series B**"
- Owns the CI bill, reports to CTO quarterly.
- Has a Datadog account but it doesn't cover Actions.
- Procurement: can self-approve up to ~$500/mo.
- Needs: a 5-minute setup, a dashboard she can screenshot for the CTO, and one number that goes down over time.

## 5. Core user stories (v1)

- **US-1**: As a user, I can sign in with GitHub.
- **US-2**: As a user, I can install the GitHub App on one of my orgs.
- **US-3**: After install, the system ingests the last 30 days of workflow runs within ~10 minutes.
- **US-4**: I see a dashboard with: total spend (30d), spend trend (daily), top 10 workflows by cost, top 10 repos by cost, breakdown by runner OS.
- **US-5**: I can drill into a workflow to see its runs, durations, and costs.
- **US-6**: I can subscribe via Stripe Checkout and manage billing via Stripe Customer Portal.
- **US-7**: My data continues to refresh hourly (incremental ingest).

## 6. Pricing (v1)

| Tier    | Price       | Limit             |
|---------|-------------|-------------------|
| Starter | $49/mo      | up to 50 repos    |
| Growth  | $149/mo     | up to 250 repos   |
| Scale   | $399/mo     | unlimited repos   |

- Flat tiers, **no per-seat**.
- 14-day free trial, no credit card to start.
- Annual: 2 months free.

## 7. Success metrics

- **Activation**: % of installs that see a populated dashboard within 1 hour.
- **Conversion**: % of trials that convert to paid (target: 8–12%).
- **Retention**: monthly logo churn < 4%.
- **NRR target after 12 months**: 105%+.

## 8. Non-functional requirements

- Initial ingest for 100-repo org: < 15 minutes.
- Hourly incremental ingest: < 5 minutes.
- Dashboard p95 load time: < 1.5s.
- All customer data encrypted at rest (Postgres-managed).
- GitHub tokens encrypted application-side (libsodium / AES-GCM).
- No customer source code is ever fetched or stored — metadata only.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| GitHub ships this natively | Move fast; build digest + recommendations as moat (v2). |
| GitHub API rate limits | Use GitHub App installation tokens (15k/hr per install). |
| Cost calc inaccurate vs GitHub's invoice | Cross-check against `/orgs/{org}/settings/billing/actions` and surface delta. |
| Solo-dev trust gap | Public changelog, status page, SOC 2-lite posture from day 1. |

