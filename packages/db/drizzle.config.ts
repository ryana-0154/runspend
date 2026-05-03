import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/runspend";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
