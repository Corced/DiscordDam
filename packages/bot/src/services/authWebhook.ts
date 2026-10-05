import { randomUUID } from "node:crypto";
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import type {
  InternalHealthStatus,
  RevokeAccessResult,
  UserPublicProfile,
} from "@DiscordDam/shared";
import { logger } from "../utils/logger.js";

const REQUEST_TIMEOUT_MS = 5_000;
// Delays before each retry → 4 attempts total (initial + 3 retries).
const RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Axios config carrying the request-start timestamp for duration logging. */
interface TrackedRequestConfig extends InternalAxiosRequestConfig {
  meta?: { startedAt: number };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retryable: network errors/timeouts, any 5xx, and 429. Other 4xx fail fast. */
function isRetryable(error: AxiosError): boolean {
  if (error.response === undefined) return true;
  return error.response.status >= 500 || error.response.status === 429;
}

/**
 * Client for the auth-server's internal API. Every call goes through
 * `retryWithBackoff`: 4 attempts, exponential backoff 1s→2s→4s, no retry on
 * 4xx. Methods never throw — they return the response data, or null/false on
 * terminal failure (the detail is in the logs).
 */
export class AuthWebhookService {
  private readonly httpClient: AxiosInstance;

  /**
   * @param httpClient Optional axios instance for unit-test injection.
   */
  public constructor(httpClient?: AxiosInstance) {
    this.httpClient =
      httpClient ??
      axios.create({
        baseURL: botConfig.AUTH_SERVER_INTERNAL_URL,
        timeout: REQUEST_TIMEOUT_MS,
        headers: { "x-internal-secret": botConfig.BOT_INTERNAL_SECRET },
      });
    this.attachInterceptors(this.httpClient);
  }

  /**
   * Revoke all API access for a user who left or was banned from the guild.
   *
   * @returns `{ success, sessionsRevoked }` on 2xx, or null on terminal failure
   *   (404 = user never registered — logged at info, not retried).
   */

  /**
   * Fetch active/revoked user counts for /botstats.
   *
   * @returns Counts, or null on terminal failure.
   */
  public async getUserStats(): Promise<UserApiStats | null> {
    return this.retryWithBackoff("/internal/stats", async () => {
      const response = await this.httpClient.get<UserApiStats>("/internal/stats");
      return response.data;
    });
  }

  /**
   * Discord IDs of all active API users, for /syncmembers.
   *
   * @returns The id list, or null on terminal failure.
   */
  public async getActiveUserIds(): Promise<string[] | null> {
    const list = await this.retryWithBackoff("/internal/users", async () => {
      const response = await this.httpClient.get<ActiveUserList>("/internal/users");
      return response.data;
    });
    return list === null ? null : list.discordUserIds;
  }
  public async revokeAccess(params: {
    discordUserId: string;
    reason: string;
    revokedBy?: string;
  }): Promise<RevokeAccessResult | null> {
    return this.retryWithBackoff("/internal/revoke-access", async () => {
      const response = await this.httpClient.post<RevokeAccessResult>(
        "/internal/revoke-access",
        params,
      );
      return response.data;
    });
  }

  /**
   * Fetch a registered user's public profile.
   *
   * @returns The profile on 2xx, or null on 404 / failure.
   */
  public async getUserStatus(discordUserId: string): Promise<UserPublicProfile | null> {
    return this.retryWithBackoff("/internal/users", async () => {
      const response = await this.httpClient.get<UserPublicProfile>(
        `/internal/users/${discordUserId}`,
      );
      return response.data;
    });
  }

  /**
   * Add or remove the verification whitelist override.
   *
   * @returns true on 2xx, false on terminal failure.
   */
  public async setWhitelist(
    discordUserId: string,
    action: "add" | "remove",
    durationMinutes?: number,
  ): Promise<boolean> {
    const outcome = await this.retryWithBackoff("/internal/whitelist", async () => {
      await this.httpClient.post("/internal/whitelist", {
        discordUserId,
        action,
        durationMinutes,
      });
      return true;
    });
    return outcome !== null;
  }

  /**
   * Auth-server liveness probe (db + redis booleans are informational).
   *
   * @returns The health payload, or null on failure.
   */
  public async checkHealth(): Promise<InternalHealthStatus | null> {
    return this.retryWithBackoff("/internal/health", async () => {
      const response = await this.httpClient.get<InternalHealthStatus>("/internal/health");
      return response.data;
    });
  }

  /**
   * Run `operation` with the retry ladder. Returns its result, or null once
   * every attempt is exhausted (or a non-retryable error is hit).
   */
  private async retryWithBackoff<T>(
    endpoint: string,
    operation: () => Promise<T>,
  ): Promise<T | null> {
    const totalAttempts = RETRY_DELAYS_MS.length + 1;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      if (attempt > 1) {
        const delayMs = RETRY_DELAYS_MS[attempt - 2] ?? 0;
        logger.warn("Retrying internal call", { endpoint, attempt, delayMs });
        await sleep(delayMs);
      }
      try {
        return await operation();
      } catch (error) {
        if (error instanceof AxiosError && isRetryable(error)) {
          logger.warn("Internal call attempt failed", {
            endpoint,
            attempt,
            status: error.response?.status ?? 0,
            code: error.code ?? null,
          });
          continue;
        }
        this.logTerminalFailure(endpoint, error);
        return null;
      }
    }
    logger.error(`All retries exhausted for ${endpoint}`, {
      endpoint,
      attempts: totalAttempts,
    });
    return null;
  }

  /** Log a non-retryable failure at the severity its status deserves. */
  private logTerminalFailure(endpoint: string, error: unknown): void {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 0;
      const level: "info" | "warn" | "error" =
        status === 404 ? "info" : status === 401 ? "error" : "warn";
      logger[level]("Internal call failed (non-retryable)", {
        endpoint,
        status,
        code: error.code ?? null,
        error: error.message,
      });
      return;
    }
    logger.error("Internal call failed (unexpected error type)", {
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  /** Attach request/response logging interceptors to the given client. */
  private attachInterceptors(client: AxiosInstance): void {
    client.interceptors.request.use((config) => {
      const tracked = config as TrackedRequestConfig;
      tracked.meta = { startedAt: Date.now() };
      const requestId = randomUUID();
      config.headers.set("x-request-id", requestId);
      logger.debug("auth_webhook_request", {
        requestId,
        method: config.method,
        url: config.url,
      });
      return config;
    });

    client.interceptors.response.use(
      (response) => {
        const tracked = response.config as TrackedRequestConfig;
        const durationMs =
          tracked.meta?.startedAt !== undefined ? Date.now() - tracked.meta.startedAt : null;
        logger.debug("auth_webhook_response", {
          requestId: response.config.headers.get("x-request-id") ?? null,
          method: response.config.method,
          url: response.config.url,
          status: response.status,
          durationMs,
        });
        return response;
      },
      (error: AxiosError) => {
        const tracked = error.config as TrackedRequestConfig | undefined;
        const durationMs =
          tracked?.meta?.startedAt !== undefined ? Date.now() - tracked.meta.startedAt : null;
        logger.warn("auth_webhook_error", {
          requestId: tracked !== undefined ? (tracked.headers.get("x-request-id") ?? null) : null,
          method: tracked?.method ?? null,
          url: tracked?.url ?? null,
          status: error.response?.status ?? 0,
          code: error.code ?? null,
          durationMs,
        });
        return Promise.reject(error);
      },
    );
  }
}

/** Singleton used by the bot's event handlers and slash commands. */
export const authWebhookService = new AuthWebhookService();
