import Redis from "ioredis";
import { authConfig } from "@discordgate/shared/config/authConfig.js";

// ── Key namespaces ────────────────────────────────────────────────────────

export const PKCE_PREFIX = "pkce:";
export const REFRESH_PREFIX = "refresh:";
export const BLACKLIST_PREFIX = "blacklist:";
export const RATE_LIMIT_PREFIX = "rl:";
export const WHITELIST_PREFIX = "whitelist:";

/** OAuth2 `state` → PKCE pair lifetime (5 min covers the redirect round-trip). */
export const PKCE_TTL_SECONDS = 300;

// ── Types ─────────────────────────────────────────────────────────────────

export interface PKCEData {
  codeVerifier: string;
  createdAt: number;
}

/** Every RedisService method rejects with this — never a raw driver error. */
export class RedisServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RedisServiceError";
  }
}

// ── Logging ───────────────────────────────────────────────────────────────
// ponytail: duplicates the 5-line structured logger in src/db/pool.ts —
// extract a shared logger module when a third consumer appears.
const logger = {
  info(msg: string): void {
    console.info(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg }));
  },
  warn(msg: string, extra?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...extra }));
  },
  error(msg: string, err?: unknown): void {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  },
};

// ── Lua ───────────────────────────────────────────────────────────────────
// Atomic one-time read: GET+DEL as a single script (pipelines are NOT atomic).
const CONSUME_SCRIPT = `
local val = redis.call('GET', KEYS[1])
if val then redis.call('DEL', KEYS[1]) end
return val`;

export class RedisService {
  private readonly redis: Redis;

  constructor() {
    // Connects eagerly; ioredis retries forever with backoff and emits
    // "error" without throwing — connection loss never crashes the process.
    this.redis = new Redis(authConfig.REDIS_URL);
    this.redis.on("connect", () => logger.info("Redis connected"));
    this.redis.on("error", (err: Error) => logger.error("Redis error", err));
    this.redis.on("reconnecting", (delay: number) =>
      logger.warn("Redis reconnecting", { delayMs: delay }),
    );
  }

  /** Runs `fn`, rethrowing any failure as a typed RedisServiceError. */
  private async exec<T>(op: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw new RedisServiceError(`redisService.${op} failed`, { cause: err });
    }
  }

  private rawSet(key: string, value: string, ttlSeconds?: number): Promise<unknown> {
    return ttlSeconds !== undefined
      ? this.redis.set(key, value, "EX", ttlSeconds)
      : this.redis.set(key, value);
  }

  // ── Base operations ────────────────────────────────────────────────────

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.exec("set", () => this.rawSet(key, value, ttlSeconds));
  }

  async get(key: string): Promise<string | null> {
    return this.exec("get", () => this.redis.get(key));
  }

  async del(key: string): Promise<void> {
    await this.exec("del", () => this.redis.del(key));
  }

  async exists(key: string): Promise<boolean> {
    return this.exec("exists", async () => (await this.redis.exists(key)) === 1);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.exec("expire", () => this.redis.expire(key, ttlSeconds));
  }

  /** Remaining TTL in seconds; -2 if the key does not exist, -1 if no expiry. */
  async ttl(key: string): Promise<number> {
    return this.exec("ttl", () => this.redis.ttl(key));
  }

  // ── PKCE (OAuth2 state → verifier, one-time-use) ───────────────────────

  async storePKCE(state: string, data: PKCEData): Promise<void> {
    await this.exec("storePKCE", () =>
      this.rawSet(`${PKCE_PREFIX}${state}`, JSON.stringify(data), PKCE_TTL_SECONDS),
    );
  }

  /** Atomic GET+DEL — reading consumes the key. Null if absent or expired. */
  async consumePKCE(state: string): Promise<PKCEData | null> {
    const key = `${PKCE_PREFIX}${state}`;
    return this.exec("consumePKCE", async () => {
      const val = (await this.redis.eval(CONSUME_SCRIPT, 1, key)) as string | null;
      return val ? (JSON.parse(val) as PKCEData) : null;
    });
  }

  // ── Refresh tokens (jti → discord user id) ─────────────────────────────

  async storeRefreshToken(jti: string, discordUserId: string, ttl: number): Promise<void> {
    await this.exec("storeRefreshToken", () =>
      this.rawSet(`${REFRESH_PREFIX}${jti}`, discordUserId, ttl),
    );
  }

  async getRefreshToken(jti: string): Promise<string | null> {
    return this.exec("getRefreshToken", () => this.redis.get(`${REFRESH_PREFIX}${jti}`));
  }

  async deleteRefreshToken(jti: string): Promise<void> {
    await this.exec("deleteRefreshToken", () => this.redis.del(`${REFRESH_PREFIX}${jti}`));
  }

  /**
   * @warning O(N) operation — scans all keys matching "refresh:*" then filters
   * by value matching discordUserId. Avoid in hot paths; revocation flows only.
   */
  async deleteAllUserRefreshTokens(discordUserId: string): Promise<void> {
    await this.exec("deleteAllUserRefreshTokens", async () => {
      let cursor = 0;
      do {
        const [next, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          `${REFRESH_PREFIX}*`,
          "COUNT",
          100,
        );
        cursor = Number(next);
        for (const key of keys) {
          const value = await this.redis.get(key);
          if (value === discordUserId) {
            await this.redis.del(key);
          }
        }
      } while (cursor !== 0);
    });
  }

  // ── Access token blacklist (jti → "1", TTL = remaining token lifetime) ─

  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.exec("blacklistToken", () =>
      this.rawSet(`${BLACKLIST_PREFIX}${jti}`, "1", ttlSeconds),
    );
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return this.exec("isBlacklisted", async () =>
      (await this.redis.exists(`${BLACKLIST_PREFIX}${jti}`)) === 1,
    );
  }

  // ── Whitelist (discord user id → "1", permanent unless TTL given) ──────

  async addToWhitelist(discordUserId: string, ttlSeconds?: number): Promise<void> {
    await this.exec("addToWhitelist", () =>
      this.rawSet(`${WHITELIST_PREFIX}${discordUserId}`, "1", ttlSeconds),
    );
  }

  async removeFromWhitelist(discordUserId: string): Promise<void> {
    await this.exec("removeFromWhitelist", () =>
      this.redis.del(`${WHITELIST_PREFIX}${discordUserId}`),
    );
  }

  async isWhitelisted(discordUserId: string): Promise<boolean> {
    return this.exec("isWhitelisted", async () =>
      (await this.redis.exists(`${WHITELIST_PREFIX}${discordUserId}`)) === 1,
    );
  }

  // ── Rate limiting (fixed window: INCR, EXPIRE on first hit) ────────────

  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    return this.exec("incrementRateLimit", async () => {
      const fullKey = `${RATE_LIMIT_PREFIX}${key}`;
      const count = await this.redis.incr(fullKey);
      // ponytail: INCR+EXPIRE not atomic — a crash between them strands a
      // TTL-less counter; swap for a Lua INCR+EXPIRE if that race bites.
      if (count === 1) {
        await this.redis.expire(fullKey, windowSeconds);
      }
      return count;
    });
  }

  async getRateLimitCount(key: string): Promise<number> {
    return this.exec("getRateLimitCount", async () => {
      const val = await this.redis.get(`${RATE_LIMIT_PREFIX}${key}`);
      return val === null ? 0 : Number(val);
    });
  }

  // ── Health ─────────────────────────────────────────────────────────────

  /** The one method that never throws: false means "Redis unreachable". */
  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

/** Singleton — importing this module connects to Redis using REDIS_URL. */
export const redisService = new RedisService();