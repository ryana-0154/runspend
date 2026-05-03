import { createServer, type Server } from "node:http";
import { logger } from "@runspend/shared";
import type { Redis } from "ioredis";

export interface HealthServerOptions {
  port: number;
  redis: Redis;
}

/**
 * Plain-http health endpoint for Railway / orchestration probes. Returns 200
 * with `{status:"ok"}` when Redis responds to PING within 1s, otherwise 503.
 * Any other path returns 404.
 */
export function startHealthServer(opts: HealthServerOptions): Server {
  const server = createServer(async (req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404).end();
      return;
    }
    try {
      const pong = await Promise.race([
        opts.redis.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("redis ping timeout")), 1000),
        ),
      ]);
      if (pong !== "PONG") throw new Error(`unexpected ping reply: ${pong}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "unhealthy", error: message }));
    }
  });

  server.listen(opts.port, () => {
    logger.info({ port: opts.port }, "health server listening");
  });

  return server;
}
