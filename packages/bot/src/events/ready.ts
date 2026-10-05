import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { client } from "../client.js";
import { logger } from "../utils/logger.js";
import { registerCommands } from "../commands/index.js";
/**
 * ClientReady handler: confirms the target guild is accessible, then logs
 * bot tag, guild name, and member count. Exits the process if the target
 * guild is not visible — the bot is useless without it.
 */
export async function onReady(): Promise<void> {
  try {
    const guild = client.guilds.cache.get(botConfig.TARGET_GUILD_ID);
    if (guild === undefined) {
      logger.error("Target guild not accessible — check TARGET_GUILD_ID and the bot invite", {
        targetGuildId: botConfig.TARGET_GUILD_ID,
      });
      process.exit(1);
    }
    logger.info("Bot ready", {
      tag: client.user?.tag ?? "unknown",
      guild: guild.name,
      memberCount: guild.memberCount,
    });
    await registerCommands();
  } catch (error) {
    logger.error("Ready handler failed", { error: error });
  }
}
