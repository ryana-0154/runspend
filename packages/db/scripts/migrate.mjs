import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Fixed advisory-lock key so concurrent web instances starting at the same
// time can't race on the same migration. Arbitrary 32-bit int — never change
// once deployed.
const LOCK_KEY = 4242042;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate] DATABASE_URL is required");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, "..", "migrations");

const client = postgres(connectionString, { max: 1 });

try {
  await client`SELECT pg_advisory_lock(${LOCK_KEY})`;
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("[migrate] applied any pending migrations");
  } finally {
    await client`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exit(1);
} finally {
  await client.end({ timeout: 5 });
}
