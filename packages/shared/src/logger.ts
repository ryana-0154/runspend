import { pino } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { service: process.env.SERVICE_NAME ?? "runspend" },
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
});

export type Logger = typeof logger;
