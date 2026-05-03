import { App } from "@octokit/app";

export interface GithubAppConfig {
  appId: string;
  privateKey: string;
}

let cached: App | undefined;
let cachedKey: string | undefined;

export function getApp(config: GithubAppConfig): App {
  const cacheKey = `${config.appId}:${config.privateKey.slice(0, 32)}`;
  if (cached && cachedKey === cacheKey) return cached;
  cached = new App({
    appId: config.appId,
    // GitHub App private keys arrive as PEM strings. Some env stores
    // collapse newlines into "\n" — un-escape transparently.
    privateKey: config.privateKey.replace(/\\n/g, "\n"),
  });
  cachedKey = cacheKey;
  return cached;
}

/** Returns an Octokit instance authenticated as the installation. */
export async function getInstallationOctokit(config: GithubAppConfig, installationId: number) {
  return getApp(config).getInstallationOctokit(installationId);
}
