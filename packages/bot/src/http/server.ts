import express, { type ErrorRequestHandler } from "express";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";
import { verifyRouter } from "./routes/verify.js";

/** Keeps every unexpected HTTP failure JSON-shaped, matching the API contract. */
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error("Unhandled HTTP error", { error: err.message });
  res.status(500).json({ error: "Internal error" });
};

/**
 * Start the internal HTTP server on BOT_PORT: unauthenticated health check
 * plus the secret-guarded member-verification route. Returns the Node server.
 */
export function startHttpServer() {
  const app = express();
  app.get("/internal/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });
  app.use(verifyRouter);
  app.use(errorHandler);
  return app.listen(Number(botConfig.BOT_PORT), () => {
    logger.info("Internal HTTP server listening", { port: botConfig.BOT_PORT });
  });
}
