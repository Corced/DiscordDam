import Redis from "ioredis";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";

const SYNC_LOCK_TTL_SECONDS = 600;
const SYNC_LOCK_KEY = "sync_last_run";

/**
 * Thin Redis client for the bot: liveness for /botstats and the
 * /syncmembers once-per-10-minutes lock. All other Redis state
 * (whitelist, refresh tokens, rate limits) stays auth-server-side.
 */
export class BotRedisService {
  private readonly client: Redis;

  public constructor() {
    this.client = new Redis(botConfig.REDIS_URL, { maxRetriesPerRequest: 2 });
    // Without this listener, every Redis outage surfaces as an unhandled
    // 'error' event and crashes the bot process.
    this.client.on("error", (error) => {
      logger.warn("Redis connection error (bot)", { error: error.message });
    });
  }

  /**
   * Liveness probe for /botstats. Never throws — false means offline.
   */
  public async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * Remaining seconds on the /syncmembers lock; 0 when absent.
   * Fails open: a Redis outage blocking syncs entirely would be worse
   * than an occasional double sync (the sync itself is read-only).
   */
  public async getSyncLockTtlSeconds(guildId: string): Promise<number> {
    try {
      return Math.max(await this.client.ttl(`${SYNC_LOCK_KEY}:${guildId}`), 0);
    } catch {
      return 0;
    }
  }

  /**
   * Arm the /syncmembers lock (10 min). Swallows failures — a completed
   * sync must still report to the mod; the lock is best-effort.
   */
  public async setSyncLock(guildId: string): Promise<void> {
    try {
      await this.client.set(
        `${SYNC_LOCK_KEY}:${guildId}`,
        new Date().toISOString(),
        "EX",
        SYNC_LOCK_TTL_SECONDS,
      );
    } catch (error) {
      logger.warn("Failed to set sync lock", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const redisService = new BotRedisService();
