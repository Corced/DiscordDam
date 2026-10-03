import { botConfig } from "@discordgate/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";

const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 3; // after the initial attempt → 4 attempts total
const BASE_BACKOFF_MS = 1_000; // 1s → 2s → 4s before each retry

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST /internal/revoke-access on the auth server for a member that left or
 * was banned from the target guild. Retries with exponential backoff and
 * never throws — a failed notification must never crash the bot.
 */
export async function revokeAccess(
  discordUserId: string,
  reason: "member_left" | "member_banned",
): Promise<void> {
  const url = `${botConfig.AUTH_SERVER_INTERNAL_URL.replace(/\/+$/, "")}/internal/revoke-access`;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) {
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 2));
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": botConfig.BOT_INTERNAL_SECRET,
        },
        body: JSON.stringify({ discordUserId, reason }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        logger.info("Revoke-access request delivered", { discordUserId, reason, attempt });
        return;
      }
      logger.warn("Revoke-access non-2xx response", {
        discordUserId,
        reason,
        attempt,
        status: res.status,
      });
    } catch (error) {
      logger.warn("Revoke-access attempt failed", {
        discordUserId,
        reason,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  logger.error("Revoke-access gave up after all retries", { discordUserId, reason, url });
}