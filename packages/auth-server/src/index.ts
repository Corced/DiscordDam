// Config import first — crash-fast env validation (established pattern).
import { authConfig } from "@DiscordDam/shared/config/authConfig.js";
import { createApp } from "./app.js";
import { logger } from "./utils/logger.js";

const app = createApp();

const port = authConfig.PORT;
app.listen(port, () => {
  logger.info("Auth server listening", { port });
});