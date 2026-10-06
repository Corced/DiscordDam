import "express-async-errors";
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { tokenRouter } from "./routes/token.js";
import { internalRouter } from "./routes/internal.js";
import { jwtGuard, requireRole } from "./middleware/index.js";
import { logger } from "./utils/logger.js";
import { configureRateLimiters } from "./middleware/rateLimiter.js";

export interface CreateAppOptions {
  rateLimit?: { windowMs: number; max: number };
}

/**
 * Create the Express application with all middleware and routes.
 * In test mode (NODE_ENV=test), also mounts test-only guarded routes
 * and a JSON 404 fallback so tests get JSON not HTML.
 */
export function createApp(options?: CreateAppOptions): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());

  // Apply rate-limiter overrides if provided (test-only)
  if (options?.rateLimit) {
    configureRateLimiters(options.rateLimit);
  }

  // Routers with their middleware chains
  app.use(authRouter);
  app.use(tokenRouter);
  app.use(internalRouter);

  // Test-only guarded routes (must come after routers but before error handler)
  if (process.env.NODE_ENV === "test") {
    app.get("/api/protected", jwtGuard, (_req: Request, res: Response) => res.json({ ok: true }));
    app.get("/api/protected-member", jwtGuard, requireRole("MEMBER"), (_req: Request, res: Response) =>
      res.json({ ok: true })
    );
  }

  // JSON 404 fallback for unknown routes (test mode gets JSON, not HTML)
  if (process.env.NODE_ENV === "test") {
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    });
  }

  const eh: ErrorRequestHandler = (err, _req, res, _next) => {
    logger.error("Unhandled request error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  };
  app.use(eh);

  return app;
}