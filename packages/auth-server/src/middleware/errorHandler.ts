import type { ErrorRequestHandler } from "express";
import {
  TokenExpiredError,
  InvalidTokenError,
  TokenBlacklistedError,
  GuildVerificationError,
  UnauthorizedInternalCallError,
} from "@discordgate/shared";
import { logger } from "../utils/logger.js";

/** A known typed error mapped to its HTTP response shape. */
interface HttpErrorShape {
  status: number;
  error: string;
  code: string;
}

/**
 * Map shared typed errors to their HTTP responses. This is the single
 * source of truth — middleware and routes forward typed errors via
 * `next(err)` instead of writing JSON in catch blocks.
 */
function mapKnownError(err: unknown): HttpErrorShape | undefined {
  if (err instanceof TokenExpiredError) {
    return { status: 401, error: "Token expired", code: "TOKEN_EXPIRED" };
  }
  if (err instanceof InvalidTokenError) {
    return { status: 401, error: "Invalid token", code: "INVALID_TOKEN" };
  }
  if (err instanceof TokenBlacklistedError) {
    return { status: 401, error: "Token revoked", code: "TOKEN_REVOKED" };
  }
  if (err instanceof UnauthorizedInternalCallError) {
    return { status: 503, error: "Internal service unavailable", code: "INTERNAL_UNAVAILABLE" };
  }
  if (err instanceof GuildVerificationError) {
    return { status: 503, error: "Guild verification unavailable", code: "VERIFICATION_UNAVAILABLE" };
  }
  return undefined;
}

/**
 * Global Express error handler: logs with the request ID, maps known typed
 * errors to their status/body, and returns a generic 500 otherwise. Stack
 * traces reach the response only outside production — never in prod.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const isProduction = process.env.NODE_ENV === "production";
  logger.error("Unhandled request error", {
    requestId: req.requestId,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const known = mapKnownError(err);
  if (known !== undefined) {
    res.status(known.status).json({ error: known.error, code: known.code });
    return;
  }

  const body: { error: string; code: string; stack?: string } = {
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  };
  if (!isProduction && err instanceof Error && err.stack !== undefined) {
    body.stack = err.stack;
  }
  res.status(500).json(body);
};