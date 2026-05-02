import type { Octokit } from "@octokit/core";
import { type GithubAppConfig, getInstallationOctokit } from "./app";

export interface GithubInstallationAccount {
  id: bigint;
  login: string;
  type: "Organization" | "User";
}

export interface GithubInstallation {
  id: bigint;
  account: GithubInstallationAccount;
}

export interface GithubRepositoryRef {
  id: bigint;
  name: string;
  fullName: string;
  defaultBranch: string | null;
  isPrivate: boolean;
}

function readAccount(raw: unknown): GithubInstallationAccount {
  if (!raw || typeof raw !== "object") {
    throw new Error("installation.account missing");
  }
  const a = raw as Record<string, unknown>;
  const id = a.id;
  const login = a.login;
  const type = a.type;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new Error("installation.account.id invalid");
  }
  if (typeof login !== "string") throw new Error("installation.account.login invalid");
  if (type !== "Organization" && type !== "User") {
    throw new Error(`installation.account.type unexpected: ${String(type)}`);
  }
  return { id: BigInt(id), login, type };
}

function readRepo(raw: unknown): GithubRepositoryRef {
  if (!raw || typeof raw !== "object") throw new Error("repository payload missing");
  const r = raw as Record<string, unknown>;
  const id = r.id;
  const name = r.name;
  const fullName = r.full_name;
  const defaultBranch = r.default_branch;
  const isPrivate = r.private;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new Error("repository.id invalid");
  }
  if (typeof name !== "string") throw new Error("repository.name invalid");
  return {
    id: BigInt(id),
    name,
    fullName: typeof fullName === "string" ? fullName : name,
    defaultBranch: typeof defaultBranch === "string" ? defaultBranch : null,
    isPrivate: typeof isPrivate === "boolean" ? isPrivate : false,
  };
}

/** Fetches `/app/installations/{id}` using app-JWT auth. */
export async function fetchInstallation(
  config: GithubAppConfig,
  installationId: number,
): Promise<GithubInstallation> {
  const octokit = await getInstallationOctokit(config, installationId);
  const { data } = await octokit.request("GET /app/installations/{installation_id}", {
    installation_id: installationId,
  });
  return {
    id: BigInt(data.id),
    account: readAccount(data.account),
  };
}

/** Lists all repositories accessible to an installation, paginated. */
export async function listInstallationRepositories(
  config: GithubAppConfig,
  installationId: number,
): Promise<GithubRepositoryRef[]> {
  const octokit = await getInstallationOctokit(config, installationId);
  const repos: GithubRepositoryRef[] = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.request("GET /installation/repositories", {
      per_page: 100,
      page,
    });
    for (const repo of data.repositories) {
      repos.push(readRepo(repo));
    }
    if (data.repositories.length < 100) break;
    page += 1;
  }
  return repos;
}

/**
 * Verifies the calling user has visibility into the given installation.
 * Uses the user's GitHub OAuth access token (NOT the app token).
 * Returns false on 404 (user can't see this install).
 */
export async function userCanSeeInstallation(
  userOctokit: Octokit,
  installationId: number,
): Promise<boolean> {
  try {
    await userOctokit.request("GET /user/installations/{installation_id}", {
      installation_id: installationId,
    });
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      (err as { status: number }).status === 404
    ) {
      return false;
    }
    throw err;
  }
}

export { readAccount, readRepo };
