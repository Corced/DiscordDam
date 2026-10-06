import { Router } from "express";
import cookieParser from "cookie-parser";
import { AuditEventType, TokenBlacklistedError, type VerificationResult } from "@DiscordDam/shared";
import { requestLogger, authLimiter } from "../middleware/index.js";
import {
  discordOAuthService,
  InvalidStateError,
  type DiscordTokenSet,
  type DiscordUser,
} from "../services/discordOAuth.js";
import { guildVerifierService } from "../services/guildVerifier.js";
import { jwtService } from "../services/jwtService.js";
import { userRepository } from "../db/repositories/userRepository.js";
import { sessionRepository } from "../db/repositories/sessionRepository.js";
import { auditRepository } from "../db/repositories/auditRepository.js";
import { logger } from "../utils/logger.js";

const STATE_COOKIE = "oauth_state";
const REFRESH_COOKIE = "refresh_token";
const STATE_COOKIE_MAX_AGE_MS = 300_000;
const REFRESH_TOKEN_TTL_MS = 604_800_000; // 7 days — must match jwtService's refresh TTL
const secureCookies = process.env.NODE_ENV === "production";

/** Fire-and-forget audit write — an audit failure must never fail the request. */
function auditSafely(eventType: AuditEventType, discordId: string, ipAddress?: string): void {
  void auditRepository.log({ eventType, discordId, ipAddress }).catch((error: unknown) =>
    logger.warn("Audit log failed", {
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

export const authRouter: Router = Router();
authRouter.use(requestLogger);
authRouter.use(cookieParser());

/**
 * GET /auth/discord — start the OAuth2 flow: store PKCE in Redis, set the
 * state cookie, redirect to Discord's authorize URL.
 */
authRouter.get("/auth/discord", async (_req, res) => {
  try {
    const { url, state } = await discordOAuthService.generateAuthUrl();
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      maxAge: STATE_COOKIE_MAX_AGE_MS,
    });
    res.redirect(url);
  } catch (error) {
    logger.error("Failed to start OAuth flow", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(503).json({ error: "Login temporarily unavailable", code: "SERVICE_UNAVAILABLE" });
  }
});

/**
 * GET /auth/discord/callback — complete the OAuth2 flow: verify state,
 * exchange the code (PKCE), fetch the profile, gate on guild membership and
 * the REVOKED role, then issue JWTs, a session row, and the refresh cookie.
 */
authRouter.get("/auth/discord/callback", authLimiter, async (req, res) => {
  const queryState = typeof req.query.state === "string" ? req.query.state : "";
  if (queryState === "" || req.cookies[STATE_COOKIE] !== queryState) {
    res.clearCookie(STATE_COOKIE);
    return res.redirect("/access-denied?reason=invalid_state");
  }
  res.clearCookie(STATE_COOKIE);

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (code === "") {
    return res.redirect("/access-denied?reason=oauth_exchange_failed");
  }

  let tokenSet: DiscordTokenSet;
  try {
    tokenSet = await discordOAuthService.exchangeCode(code, queryState);
  } catch (error) {
    if (error instanceof InvalidStateError) {
      return res.redirect("/access-denied?reason=invalid_state");
    }
    logger.error("Discord code exchange failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.redirect("/access-denied?reason=oauth_exchange_failed");
  }

  let profile: DiscordUser;
  try {
    profile = await discordOAuthService.getUserProfile(tokenSet.accessToken);
  } catch (error) {
    logger.error("Discord profile fetch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.redirect("/access-denied?reason=oauth_profile_failed");
  }

  let verification: VerificationResult;
  try {
    verification = await guildVerifierService.verifyMembership(profile.id);
    if (!verification.isMember) {
      // Retry once past the 60s verifier cache — user may have joined moments ago.
      guildVerifierService.clearCache(profile.id);
      verification = await guildVerifierService.verifyMembership(profile.id);
    }
  } catch (error) {
    logger.error("Guild verification unavailable during login", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.redirect("/access-denied?reason=verification_unavailable");
  }

  if (!verification.isMember) {
    void discordOAuthService.revokeDiscordToken(tokenSet.accessToken);
    auditSafely(AuditEventType.LOGIN_DENIED_NOT_MEMBER, profile.id, req.ip);
    return res.redirect("/access-denied?reason=not_member");
  }

  let dbUser;
  try {
    dbUser = await userRepository.upsertUser({
      discordId: profile.id,
      username: profile.username,
      avatarHash: profile.avatar ?? undefined,
    });
  } catch (error) {
    logger.error("User upsert failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.redirect("/access-denied?reason=server_error");
  }

  if (dbUser.role === "REVOKED") {
    void discordOAuthService.revokeDiscordToken(tokenSet.accessToken);
    auditSafely(AuditEventType.LOGIN_DENIED, profile.id, req.ip);
    return res.redirect("/access-denied?reason=revoked");
  }

  let refreshJti: string | undefined;
  try {
    const accessToken = jwtService.signAccessToken({
      sub: profile.id,
      username: profile.username,
      role: "MEMBER",
    });
    const { token: refreshToken, jti } = await jwtService.signRefreshToken(profile.id);
    refreshJti = jti;
    await jwtService.storeRefreshToken(jti, profile.id);
    await sessionRepository.createSession({
      userId: dbUser.id,
      refreshJti: jti,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    auditSafely(AuditEventType.LOGIN_SUCCESS, profile.id, req.ip);
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "strict",
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
    // Hand off to the SPA: access token in the URL fragment (fragments are
    // never sent to servers and stay out of access logs); the refresh cookie
    // above survives the navigation. Relative path resolves against the
    // public origin (next rewrites in dev, nginx in prod).
    return res.redirect(`/auth/callback#access_token=${encodeURIComponent(accessToken)}`);
  } catch (error) {
    logger.error("Token issuance failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (refreshJti !== undefined) {
      void jwtService.revokeRefreshToken(refreshJti).catch(() => undefined);
    }
    return res.redirect("/access-denied?reason=server_error");
  }
});
