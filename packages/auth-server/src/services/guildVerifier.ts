import axios, { AxiosError, type AxiosInstance } from "axios";
import pLimit from "p-limit";
import { v4 as uuidv4 } from "uuid";
import { authConfig } from "@discordgate/shared/config/authConfig.js";
import {
  GuildVerificationError,
  UnauthorizedInternalCallError,
  type VerificationResult,
} from "@discordgate/shared";
import { redisService } from "./redisService.js";
import { logger } from "../utils/logger.js";

const CACHE_TTL_MS = 60_000;
const BATCH_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 5_000;

/** Cached verification result plus its expiry (epoch milliseconds). */
interface CacheEntry {
  result: VerificationResult;
  expiresAt: number;
}

/**
 * Verifies whether a Discord user is a member of the target guild by calling
 * the bot's internal verify endpoint. Results are cached in memory for 60
 * seconds; a Redis-backed whitelist can override a "not a member" answer.
 */
export class GuildVerifierService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly httpClient: AxiosInstance;

  /**
   * @param httpClient Optional axios instance for unit-test injection. When
   *   omitted, an instance is created against `BOT_INTERNAL_URL` with the
   *   shared internal secret attached and a 5-second timeout.
   */
  public constructor(httpClient?: AxiosInstance) {
    this.httpClient =
      httpClient ??
      axios.create({
        baseURL: authConfig.BOT_INTERNAL_URL,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "x-internal-secret": authConfig.BOT_INTERNAL_SECRET },
      });
  }

  /**
   * Verify that a Discord user is currently a member of the target guild.
   * Fresh cache hits skip the HTTP call entirely; otherwise this calls
   * `GET /internal/verify/{discordUserId}` on the bot, applies the Redis
   * whitelist override, caches the final result, and returns it.
   *
   * @param discordUserId Discord snowflake of the user to verify.
   * @returns The membership result with its `verifiedAt` timestamp.
   * @throws {UnauthorizedInternalCallError} Bot rejected the shared secret (401).
   * @throws {GuildVerificationError} Any other HTTP error, network error, or timeout.
   */
  public async verifyMembership(discordUserId: string): Promise<VerificationResult> {
    const cached = this.cache.get(discordUserId);
    if (cached !== undefined) {
      if (cached.expiresAt > Date.now()) return cached.result;
      this.cache.delete(discordUserId);
    }

    const requestId = uuidv4();
    logger.debug("Guild verification request", { discordUserId, requestId });

    let data: unknown;
    try {
      const response = await this.httpClient.get<unknown>(
        `/internal/verify/${discordUserId}`,
        { headers: { "x-request-id": requestId } },
      );
      data = response.data;
      logger.info("Guild verification response", {
        discordUserId,
        requestId,
        status: response.status,
      });
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 401) {
        logger.error("Bot rejected the internal secret", { discordUserId, requestId });
        throw new UnauthorizedInternalCallError();
      }
      const status = error instanceof AxiosError ? (error.response?.status ?? 0) : 0;
      logger.error("Guild verification call failed", {
        discordUserId,
        requestId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GuildVerificationError(
        status,
        error instanceof Error ? error.message : String(error),
      );
    }

    const body = (data ?? {}) as Record<string, unknown>;
    const result: VerificationResult = {
      isMember: body.isMember === true,
      roles: Array.isArray(body.roles) ? body.roles.map((role) => String(role)) : [],
      verifiedAt: new Date(),
    };

    // Whitelist bypasses guild check — managed via /whitelist slash command
    if (!result.isMember && (await this.checkWhitelist(discordUserId))) {
      result.isMember = true;
    }

    this.cache.set(discordUserId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  /**
   * Verify many users concurrently (bounded at 5 in-flight requests).
   * Failures are logged and their IDs omitted from the result map — one
   * failure never fails the batch.
   *
   * @param userIds Discord snowflakes to verify.
   * @returns Map of discordUserId to its VerificationResult.
   */
  public async batchVerify(userIds: string[]): Promise<Map<string, VerificationResult>> {
    const limit = pLimit(BATCH_CONCURRENCY);
    const results = new Map<string, VerificationResult>();
    await Promise.all(
      userIds.map((discordUserId) =>
        limit(async () => {
          try {
            results.set(discordUserId, await this.verifyMembership(discordUserId));
          } catch (error) {
            logger.error("batchVerify: skipping failed user", {
              discordUserId,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      ),
    );
    return results;
  }

  /**
   * Clear cached verification results. With `discordUserId`, drops only that
   * user's entry; without it, clears the whole cache. Call after revocation
   * events (and from tests) so the next verify hits the bot, not stale data.
   */
  public clearCache(discordUserId?: string): void {
    if (discordUserId === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(discordUserId);
  }

  /**
   * Check the Redis whitelist for a user. Any Redis failure is logged and
   * treated as "not whitelisted" — the whitelist can only grant access,
   * never deny it, so the guild check stays authoritative when Redis is down.
   */
  private async checkWhitelist(discordUserId: string): Promise<boolean> {
    try {
      return Boolean(await redisService.exists(`whitelist:${discordUserId}`));
    } catch (error) {
      logger.warn("Whitelist check failed; falling back to guild check only", {
        discordUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

/** Singleton used by the OAuth callback and token refresh flows. */
export const guildVerifier = new GuildVerifierService();