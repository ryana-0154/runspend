export function buildInstallUrl(slug: string, state: string): string {
  const url = new URL(`https://github.com/apps/${slug}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}
