import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    prepare: false,
  });
  return drizzle(client, { schema });
}

let cached: Database | undefined;

export function getDb(): Database {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  cached = createDb(url);
  return cached;
}
