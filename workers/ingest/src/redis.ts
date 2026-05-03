import { Redis, type RedisOptions } from "ioredis";

/**
 * BullMQ requires `maxRetriesPerRequest: null` so blocking commands aren't
 * aborted, and `enableReadyCheck: false` to avoid a startup race against
 * Railway's Redis when the worker boots before Redis is fully ready.
 */
const bullmqDefaults: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

export function createRedis(connectionString: string, overrides: RedisOptions = {}): Redis {
  return new Redis(connectionString, { ...bullmqDefaults, ...overrides });
}
