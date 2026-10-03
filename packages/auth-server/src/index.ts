// Config import first — crash-fast env validation (established pattern).
import { authConfig } from "@discordgate/shared/config/authConfig.js";
import "express-async-errors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { tokenRouter } from "./routes/token.js";
import { internalRouter } from "./routes/internal.js";
import { errorHandler } from "./middleware/index.js";
import { logger } from "./utils/logger.js";

const app = express();
// Behind nginx/compose: trust the proxy so req.ip is the real client IP
// (rate-limit buckets and session records key off it).
app.set("trust proxy", 1);
app.use(helmet());

app.use(authRouter);
app.use(tokenRouter);
app.use(internalRouter);

const eh: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error("Unhandled request error", {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
};
app.use(eh);

const port = Number(authConfig.AUTH_SERVER_PORT);
app.listen(port, () => {
  logger.info("Auth server listening", { port });
});