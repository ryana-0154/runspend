import type { GithubAppConfig } from "@runspend/github";

export class GithubAppNotConfiguredError extends Error {
  constructor() {
    super("GitHub App env vars (GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY) are not set");
    this.name = "GithubAppNotConfiguredError";
  }
}

export function getGithubAppConfig(): GithubAppConfig {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) throw new GithubAppNotConfiguredError();
  return { appId, privateKey };
}
