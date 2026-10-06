import type { Request, RequestHandler } from "express";
import { redisService } from "../services/redisService.js";

/** Options for {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Fixed window length in seconds. */
  windowSeconds: number;
  /** Requests allowed per window per key. */
  maxRequests: number;
  /** Custom key builder; defaults to `req.ip ?? "unknown"`. */
  keyGenerator?: (req: Request) => string;
  /** Custom 429 message. */
  message?: string;
}

/**
 * Create a Redis-backed fixed-window rate limiter. Over-limit requests get
 * a 429 with a `Retry-After` header. Redis failures bubble to `next(err)`
 * (fail closed — consistent with jwtGuard: no Redis, no auth).
 *
 * @param options Window size, request cap, optional key generator/message.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  return async (req, res, next) => {
    try {
      const key =
        options.keyGenerator !== undefined ? options.keyGenerator(req) : (req.ip ?? "unknown");
      const count = await redisService.incrementRateLimit(key, options.windowSeconds);
      if (count > options.maxRequests) {
        // Clamp Redis TTL sentinels (-1 no expiry, -2 missing) to 0.
        const retryAfter = Math.max(await redisService.ttl(`rl:${key}`), 0);
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({
          error: options.message ?? "Too many requests",
          code: "RATE_LIMITED",
          retryAfter,
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Internal mutable references — reconfigured once at startup (or in tests).
let authLimiterImpl: RequestHandler = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 10,
  message: "Too many auth attempts",
});

const apiLimiterImpl: RequestHandler = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 100,
});

const refreshLimiterImpl: RequestHandler = createRateLimiter({
  windowSeconds: 60,
  maxRequests: 20,
});

/** Login/callback attempts — strict. */
export const authLimiter: RequestHandler = (req, res, next) => authLimiterImpl(req, res, next);

/** General API routes — generous. */
export const apiLimiter: RequestHandler = (req, res, next) => apiLimiterImpl(req, res, next);

/** Token refresh — between the two. */
export const refreshLimiter: RequestHandler = (req, res, next) => refreshLimiterImpl(req, res, next);

/**
 * Reconfigure rate limiters (used by createApp in test mode).
 * Production defaults are unchanged when called without overrides.
 *
 * @param overrides Optional override for auth limiter only (windowMs in ms, max requests).
 *                  Other limiters keep production defaults.
 */
export function configureRateLimiters(overrides?: { windowMs: number; max: number }): void {
  if (overrides) {
    const windowSeconds = Math.max(1, Math.floor(overrides.windowMs / 1000));
    authLimiterImpl = createRateLimiter({
      windowSeconds,
      maxRequests: overrides.max,
      message: "Too many auth attempts",
    });
  }
}