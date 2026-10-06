import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";
import { InvalidTokenError, TokenExpiredError } from "@DiscordDam/shared";
import { logger } from "../utils/logger.js";
import type { RedisService } from "./redisService.js";
import { redisService } from "./redisService.js";

/** Everything a verified access token guarantees about the caller. */
export interface AccessTokenPayload {
  /** Discord user ID. */
  sub: string;
  username: string;
  /** Hardcoded — access tokens can never carry ADMIN. */
  role: "MEMBER";
  /** Issued-at (epoch seconds). */
  iat: number;
  /** Expiry (epoch seconds). */
  exp: number;
  /** UUID v4 — the blacklist key. */
  jti: string;
  type: "access";
}

/** Minimal claims of a rotating refresh token. */
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: "refresh";
  exp: number;
}

export class JWTService {
  private readonly secret: string;

  /**
   * @param redis RedisService handles the jti↔user registry, blacklist and
   * TTL bookkeeping. Pass a mock in tests; pass `redisService` in production.
   * @throws if JWT_SECRET is under 32 chars (second line of defense — the
   * zod config already enforces this before we are ever constructed).
   */
  constructor(private readonly redis: RedisService) {
    if (authConfig.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET too short");
    }
    this.secret = authConfig.JWT_SECRET;
  }

  /**
   * Signs a short-lived HS256 access token.
   * iat / exp / jti / type are generated here — callers supply identity only.
   */
  signAccessToken(payload: Omit<AccessTokenPayload, "iat" | "exp" | "jti" | "type">): string {
    const jti = uuidv4();
    // Security: role is always capped at MEMBER for Discord OAuth users
    return jwt.sign({ ...payload, role: "MEMBER", jti, type: "access" }, this.secret, {
      algorithm: "HS256",
      expiresIn: authConfig.JWT_EXPIRY,
    });
  }

  /**
   * Signs a rotating refresh token. Returns the jti so the caller can
   * register it in Redis (see storeRefreshToken) before handing it out.
   */
  signRefreshToken(discordUserId: string): { token: string; jti: string } {
    const jti = uuidv4();
    const token = jwt.sign({ sub: discordUserId, jti, type: "refresh" }, this.secret, {
      algorithm: "HS256",
      expiresIn: authConfig.REFRESH_TOKEN_EXPIRY,
    });
    return { token, jti };
  }

  /**
   * Verifies an access token's signature, expiry and type.
   * @throws TokenExpiredError when past exp
   * @throws InvalidTokenError on bad signature, malformed token, or non-access type
   */
  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = this.verifyToken(token);
    if (decoded.type !== "access") {
      throw new InvalidTokenError("Token is not of type access");
    }
    const payload = decoded as AccessTokenPayload;
    if (payload.role !== "MEMBER") {
      // Security: mirror of the signing-side cap — verify-side safety net.
      throw new InvalidTokenError("Access token role is not MEMBER");
    }
    return payload;
  }

  /**
   * Verifies a refresh token's signature, expiry and type.
   * @throws TokenExpiredError when past exp
   * @throws InvalidTokenError on bad signature, malformed token, or non-refresh type
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = this.verifyToken(token);
    if (decoded.type !== "refresh") {
      throw new InvalidTokenError("Token is not of type refresh");
    }
    return decoded as RefreshTokenPayload;
  }

  /**
   * Decodes a token WITHOUT verifying its signature — diagnostics only.
   * Must never be used for auth decisions.
   */
  decodeWithoutVerify(token: string): Partial<AccessTokenPayload> {
    logger.warn("decodeWithoutVerify called — must not be used for auth decisions");
    return (jwt.decode(token) ?? {}) as Partial<AccessTokenPayload>;
  }

  /** Registers a refresh token jti in Redis with the configured TTL. */
  async storeRefreshToken(jti: string, discordUserId: string): Promise<void> {
    await this.redis.storeRefreshToken(jti, discordUserId, authConfig.REFRESH_TOKEN_EXPIRY);
  }

  /** Returns the discord user id bound to this refresh jti, or null if unknown/expired. */
  async validateRefreshToken(jti: string): Promise<string | null> {
    return this.redis.getRefreshToken(jti);
  }

  /** Deletes a single refresh jti (rotation or logout). */
  async revokeRefreshToken(jti: string): Promise<void> {
    await this.redis.deleteRefreshToken(jti);
  }

  /** Blacklists an access token jti until it would have expired anyway. */
  async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.blacklistToken(jti, ttlSeconds);
  }

  /** True if the access token jti was revoked before its natural expiry. */
  async isBlacklisted(jti: string): Promise<boolean> {
    return this.redis.isBlacklisted(jti);
  }

  /**
   * Shared verify core: pins HS256 (algorithm is decided by the server, never
   * read from the token header) and maps driver errors to typed errors.
   */
  private verifyToken(token: string): jwt.JwtPayload {
    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, this.secret, { algorithms: ["HS256"] }) as
        | string
        | jwt.JwtPayload;
    } catch (err) {
      // TokenExpiredError extends JsonWebTokenError — expired must be first.
      if (err instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError(err.message);
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new InvalidTokenError(err.message);
      }
      throw err;
    }
    if (typeof decoded === "string") {
      throw new InvalidTokenError("Token payload is not an object");
    }
    return decoded;
  }
}

/** Singleton — the Redis-backed registry is the redisService singleton. */
export const jwtService = new JWTService(redisService);
