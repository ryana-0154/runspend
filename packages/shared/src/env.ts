import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),

  AUTH_GITHUB_ID: z.string().min(1),
  AUTH_GITHUB_SECRET: z.string().min(1),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  // URL slug used to build the install link `https://github.com/apps/<slug>/installations/new`
  GITHUB_APP_SLUG: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_STARTER: z.string().optional(),
  STRIPE_PRICE_GROWTH: z.string().optional(),
  STRIPE_PRICE_SCALE: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
