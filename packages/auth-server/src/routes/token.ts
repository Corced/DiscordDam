import { Router } from "express";
import cookieParser from "cookie-parser";
import { TokenBlacklistedError, type VerificationResult } from "@discordgate/shared";
import { requestLogger, refreshLimiter } from "../middleware/index.js";
import { guildVerifier } from "../services/guildVerifier.js";
import { jwtService } from "../services/jwtService.js";
import { userRepository } from "../db/repositories/userRepository.js";
import { logger } from "../utils/logger.js";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_TOKEN_TTL_MS = 604_800_000; // 7 days — must match jwtService's refresh TTL
const secureCookies = process.env.NODE_ENV === "production";

export const tokenRouter = Router();
tokenRouter.use(requestLogger);
tokenRouter.use(cookieParser());

/**
 * POST /token/refresh — rotate the refresh token and issue a fresh access
 * token. Guild membership is re-checked on every refresh: this is the only
 * guaranteed reconciliation point for users who left the guild after login
 * (the bot's revoke webhook is best-effort; access tokens are stateless).
 */
tokenRouter.post("/token/refresh", refreshLimiter, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token !== "string" || token === "") {
    return res.status(401).json({ error: "No refresh token provided", code: "NO_TOKEN" });
  }

  let payload: { sub: string; jti: string };
  try {
    payload = await jwtService.verifyRefreshToken(token);
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE);
    if (error instanceof TokenBlacklistedError) {
      return res.status(401).json({ error: "Refresh token revoked", code: "TOKEN_REVOKED" });
    }
    return res
      .status(401)
      .json({ error: "Refresh token expired or invalid", code: "TOKEN_EXPIRED" });
  }

  if (!(await jwtService.validateRefreshToken(payload.jti))) {
    res.clearCookie(REFRESH_COOKIE);
    return res.status(401).json({ error: "Refresh token revoked", code: "TOKEN_REVOKED" });
  }

  let dbUser;
  try {
    dbUser = await userRepository.findByDiscordId(payload.sub);
  } catch (error) {
    logger.error("User lookup failed during refresh", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Internal error", code: "INTERNAL_ERROR" });
  }
  if (dbUser === null || dbUser.role === "REVOKED") {
    void jwtService.revokeRefreshToken(payload.jti).catch(() => undefined);
    res.clearCookie(REFRESH_COOKIE);
    return res.status(401).json({ error: "Refresh token revoked", code: "TOKEN_REVOKED" });
  }

  let verification: VerificationResult;
  try {
    verification = await guildVerifier.verifyMembership(payload.sub);
  } catch (error) {
    // Bot unreachable: fail soft — keep the cookie; the current access token
    // stays valid and the client retries. Infra failure must not log users out.
    logger.error("Guild verification unavailable during refresh", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({
      error: "Guild verification unavailable, retry later",
      code: "VERIFICATION_UNAVAILABLE",
    });
  }

  if (!verification.isMember) {
    try {
      await jwtService.revokeRefreshToken(payload.jti);
      await userRepository.revokeUserAccess(payload.sub, "guild_membership_lost");
    } catch (error) {
      logger.error("Failed to fully revoke access after guild exit", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    res.clearCookie(REFRESH_COOKIE);
    return res.status(403).json({ error: "Guild membership lost", code: "GUILD_MEMBERSHIP_LOST" });
  }

  try {
    const { token: accessToken } = await jwtService.signAccessToken({
      sub: payload.sub,
      username: dbUser.username,
      role: "MEMBER",
    });
    const { token: newRefreshToken, jti: newJti } = await jwtService.signRefreshToken(payload.sub);
    await jwtService.revokeRefreshToken(payload.jti);
    await jwtService.storeRefreshToken(newJti, payload.sub);
    res.cookie(REFRESH_COOKIE, newRefreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    return res.json({ accessToken });
  } catch (error) {
    logger.error("Token rotation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Internal error", code: "INTERNAL_ERROR" });
  }
});

/**
 * POST /token/revoke — revoke the caller's refresh token and clear the
 * cookie. Idempotent: no cookie or an already-invalid token still returns
 * 200 { success: true }.
 */
tokenRouter.post("/token/revoke", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (typeof token === "string" && token !== "") {
    try {
      const payload = await jwtService.verifyRefreshToken(token);
      await jwtService.revokeRefreshToken(payload.jti);
    } catch {
      // Token already invalid, expired, or blacklisted — nothing to revoke.
    }
  }
  res.clearCookie(REFRESH_COOKIE);
  return res.status(200).json({ success: true });
});