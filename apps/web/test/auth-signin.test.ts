import { randomUUID } from "node:crypto";
import { createDb, type Database, users } from "@runspend/db";
import { runMigrations } from "@runspend/db/migrate";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertUserFromGithub } from "@/lib/auth/upsert-user";

const baseUrl = process.env.TEST_DATABASE_URL;

const describeIfDb = baseUrl ? describe : describe.skip;

let adminClient: ReturnType<typeof postgres> | undefined;
let testDbName: string | undefined;
let testDbUrl: string | undefined;
let db: Database;

beforeAll(async () => {
  if (!baseUrl) return;
  // Create a fresh database per test run for isolation.
  testDbName = `runspend_test_${randomUUID().replace(/-/g, "")}`;
  adminClient = postgres(baseUrl, { max: 1 });
  await adminClient.unsafe(`CREATE DATABASE "${testDbName}"`);
  const url = new URL(baseUrl);
  url.pathname = `/${testDbName}`;
  testDbUrl = url.toString();
  await runMigrations(testDbUrl);
  db = createDb(testDbUrl);
});

afterAll(async () => {
  if (!adminClient || !testDbName) return;
  await adminClient.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()`,
  );
  await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}"`);
  await adminClient.end({ timeout: 5 });
});

describeIfDb("Auth.js GitHub sign-in", () => {
  it("creates a users row on first sign-in", async () => {
    const created = await upsertUserFromGithub(db, {
      githubUserId: 4242n,
      email: "priya@example.com",
      name: "Priya Platform",
      avatarUrl: "https://avatars.example/priya.png",
    });
    expect(created.email).toBe("priya@example.com");

    const [row] = await db.select().from(users).where(eq(users.githubUserId, 4242n)).limit(1);

    expect(row).toBeDefined();
    expect(row?.email).toBe("priya@example.com");
    expect(row?.name).toBe("Priya Platform");
    expect(row?.avatarUrl).toBe("https://avatars.example/priya.png");
    expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("updates an existing row on repeat sign-in", async () => {
    await upsertUserFromGithub(db, {
      githubUserId: 9999n,
      email: "old@example.com",
      name: "Old Name",
      avatarUrl: null,
    });

    const updated = await upsertUserFromGithub(db, {
      githubUserId: 9999n,
      email: "new@example.com",
      name: "New Name",
      avatarUrl: "https://avatars.example/new.png",
    });
    expect(updated.email).toBe("new@example.com");

    const rows = await db.select().from(users).where(eq(users.githubUserId, 9999n));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("new@example.com");
    expect(rows[0]?.name).toBe("New Name");
  });
});

if (!baseUrl) {
  describe.skip("Auth.js GitHub sign-in (TEST_DATABASE_URL unset)", () => {
    it.skip("set TEST_DATABASE_URL to a Postgres admin URL to run integration tests", () => {});
  });
}
