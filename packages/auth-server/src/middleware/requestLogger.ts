import { v4 as uuidv4 } from "uuid";
import type { RequestHandler } from "express";
import { logger } from "../utils/logger.js";

/**
 * Assigns a request ID (response header + `req.requestId`) and logs one
 * structured JSON line per request on response finish. `/internal/health`
 * is skipped entirely — Docker probes must cost nothing.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  if (req.path === "/internal/health") {
    next();
    return;
  }
  const requestId = uuidv4();
  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  const start = Date.now();
  res.on("finish", () => {
    logger.info("http_request", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      discordId: req.user?.discordId ?? null,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  });
  next();
};