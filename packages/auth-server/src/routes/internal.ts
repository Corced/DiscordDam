import { timingSafeEqual } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authConfig } from "@discordgate/shared/config/authConfig.js";
import {
  AuditEventType,
  type RevokeAccessResult,
  type UserPublicProfile,
} from "@discordgate/shared";
import { createRateLimiter } from "../middleware/index.js";
import { redisService } from "../services/redisService.js";
import { guildVerifier } from "../services/guildVerifier.js";
import { userRepository } from "../db/repositories/userRepository.js";
import { sessionRepository } from "../db/repositories/sessionRepository.js";
import { auditRepository } from "../db/repositories/auditRepository.js";
import { pool } from "../db/pool.js";
import { logger } from "../utils/logger.js";

const DISCORD_SNOWFLAKE = /^\d{17,19}$/;
const internalLimiter = createRateLimiter({ windowSeconds: 60, maxRequests: 200 });

/** Constant-time comparison of the received secret against config. */
function secretMatches(header: string): boolean {
  const expected = Buffer.from(authConfig.BOT_INTERNAL_SECRET);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Guard for internal routes: constant-time shared-secret check. Echoes the
 * caller's `x-request-id` (generating one if absent) for cross-service tracing.
 */
function requireInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const provided = req.get("x-internal-secret");
  if (provided === undefined || !secretMatches(provided)) {
    res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  const requestId = req.get("x-request-id") ?? uuidv4();
  res.setHeader("X-Request-ID", requestId);
  logger.debug("internal_request", { requestId, method: req.method, path: req.path });
  next();
}

const revokeAccessSchema = z.object({
  discordUserId: z.string().regex(DISCORD_SNOWFLAKE),
  reason: z.string().min(1).max(200),
  revokedBy: z.string().optional(),
});

const whitelistSchema = z.object({
  discordUserId: z.string().regex(DISCORD_SNOWFLAKE),
  action: z.enum(["add", "remove"]),
  durationMinutes: z.number().min(1).max(1440).optional(),
});

/** Map a revoke reason onto its audit event type. */
function eventTypeForReason(reason: string): AuditEventType {
  switch (reason) {
    case "member_banned":
      return AuditEventType.MEMBER_BANNED;
    case "member_left":
      return AuditEventType.MEMBER_LEFT_GUILD;
    default:
      return AuditEventType.TOKEN_REVOKED;
  }
}

/** Postgres liveness probe. */
async function checkDb(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/** Redis liveness probe. */
async function checkRedis(): Promise<boolean> {
  try {
    await redisService.ping();
    return true;
  } catch {
    return false;
  }
}

export const internalRouter = Router();
internalRouter.use(express.json());

// Health route FIRST — registered before the guards, so it stays unauthenticated.
internalRouter.get("/internal/health", async (_req, res) => {
  const [db, redis] = await Promise.all([checkDb(), checkRedis()]);
  const status: import("@discordgate/shared").InternalHealthStatus = {
    status: "ok",
    db,
    redis,
    timestamp: new Date().toISOString(),
  };
  res.json(status);
});

internalRouter.use(requireInternalSecret);
internalRouter.use(internalLimiter);

/**
 * GET /internal/users — Discord IDs of all active (MEMBER) API users.
 * Used by /syncmembers to diff against the live guild member list.
 */
internalRouter.get("/internal/users", async (_req, res) => {
  const discordUserIds = await userRepository.getActiveUserIds();
  res.json({ discordUserIds } satisfies ActiveUserList);
});

/**
 * GET /internal/stats — active/revoked user counts. Used by /botstats.
 */
internalRouter.get("/internal/stats", async (_req, res) => {
  const stats = await userRepository.getUserStats();
  res.json(stats satisfies UserApiStats);
});

/**
 * POST /internal/revoke-access — revoke all API access for a user who left or
 * was banned from the target guild. Idempotent per step; unknown users 404
 * (the bot logs that at info and does not retry it).
 */
internalRouter.post("/internal/revoke-access", async (req, res) => {
  const parsed = revokeAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", code: "INVALID_BODY", details: parsed.error.issues });
    return;
  }
  const { discordUserId, reason, revokedBy } = parsed.data;

  const dbUser = await userRepository.findByDiscordId(discordUserId);
  if (dbUser === null) {
    res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
    return;
  }

  await userRepository.revokeUserAccess(discordUserId, reason);
  const sessionsRevoked = await sessionRepository.revokeAllUserSessions(dbUser.id);
  await redisService.deleteAllUserRefreshTokens(discordUserId);
  guildVerifier.clearCache(discordUserId);

  const eventType = eventTypeForReason(reason);
  // Fire-and-forget: a failed audit insert must not 500 an otherwise
  // successful revoke (the bot would retry a completed operation).
  void auditRepository
    .log({ eventType, discordId: discordUserId, metadata: { reason, revokedBy } })
    .catch((error) =>
      logger.warn("Audit log failed", {
        error: error instanceof Error ? error.message : String(error),
      }),
    );

  res.json({ success: true, sessionsRevoked } satisfies RevokeAccessResult);
});

/**
 * GET /internal/users/:discordUserId — public profile projection of a
 * registered user. 404 when the user never logged in.
 */
internalRouter.get("/internal/users/:discordUserId", async (req, res) => {
  const discordUserId = req.params.discordUserId ?? "";
  if (!DISCORD_SNOWFLAKE.test(discordUserId)) {
    res.status(400).json({ error: "Invalid discord user id", code: "INVALID_REQUEST" });
    return;
  }
  const dbUser = await userRepository.findByDiscordId(discordUserId);
  if (dbUser === null) {
    res.status(404).json({ error: "User not found", code: "NOT_FOUND" });
    return;
  }
  const profile: UserPublicProfile = {
    id: dbUser.id,
    discordUserId: dbUser.discordUserId,
    username: dbUser.username,
    role: dbUser.role,
    status: dbUser.status,
    lastLogin: dbUser.lastLogin?.toISOString() ?? null,
    createdAt: dbUser.createdAt.toISOString(),
  };
  res.json(profile);
});

/**
 * POST /internal/whitelist — add/remove the membership-verification whitelist
 * override. TTL in minutes; no expiry when omitted.
 */
internalRouter.post("/internal/whitelist", async (req, res) => {
  const parsed = whitelistSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", code: "INVALID_BODY", details: parsed.error.issues });
    return;
  }
  const { discordUserId, action, durationMinutes } = parsed.data;

  if (action === "add") {
    await redisService.addToWhitelist(
      discordUserId,
      durationMinutes ? durationMinutes * 60 : undefined,
    );
  } else {
    await redisService.removeFromWhitelist(discordUserId);
  }
  // A cached verdict masks both directions: a stale isMember:false hides a new
  // whitelist entry, a stale override hides a removal. Drop it either way.
  guildVerifier.clearCache(discordUserId);

  res.json({ success: true });
});