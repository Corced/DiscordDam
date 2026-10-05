import { timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { DiscordAPIError } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { client } from "../../client.js";
import { logger } from "../../utils/logger.js";

/** Discord API error code: Unknown Member. */
const UNKNOWN_MEMBER_CODE = 10_007;

/** Constant-time comparison of a received secret header against config. */
function secretMatches(header: string | undefined): boolean {
  if (typeof header !== "string" || header.length === 0) return false;
  const expected = Buffer.from(botConfig.BOT_INTERNAL_SECRET);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Rejects with 401 unless x-internal-secret matches BOT_INTERNAL_SECRET. */
function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  if (!secretMatches(req.get("x-internal-secret"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * GET /internal/verify/:discordUserId — reports whether that user is
 * currently a member of the target guild, and with which role IDs.
 */
async function verifyMembership(req: Request, res: Response): Promise<void> {
  const discordUserId = String(req.params.discordUserId ?? "");
  if (!/^\d+$/.test(discordUserId)) {
    res.status(400).json({ error: "Invalid discord user id" });
    return;
  }
  const guild = client.guilds.cache.get(botConfig.TARGET_GUILD_ID);
  if (guild === undefined) {
    res.status(500).json({ error: "Target guild not available" });
    return;
  }
  try {
    const member = await guild.members.fetch(discordUserId);
    res.json({ isMember: true, roles: [...member.roles.cache.keys()] });
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === UNKNOWN_MEMBER_CODE) {
      res.json({ isMember: false, roles: [] });
      return;
    }
    const message = error instanceof Error ? error.message : "Internal error";
    logger.error("Verify route failed", { discordUserId, error: message });
    res.status(500).json({ error: message });
  }
}

/** Internal-only verification routes (guarded by x-internal-secret). */
export const verifyRouter = Router();
verifyRouter.get("/internal/verify/:discordUserId", requireInternalSecret, verifyMembership);
