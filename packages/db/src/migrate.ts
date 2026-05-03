import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(connectionString: string) {
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: join(here, "..", "migrations") });
  } finally {
    await client.end({ timeout: 5 });
  }
}
