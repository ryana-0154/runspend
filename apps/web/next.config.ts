import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are TS source consumed directly. Tell Next to
  // compile them as part of the app build instead of expecting prebuilt
  // JS — this makes Turbopack follow `./foo.js` imports back to `foo.ts`.
  transpilePackages: ["@runspend/db", "@runspend/github", "@runspend/shared", "@runspend/billing"],
};

export default nextConfig;
