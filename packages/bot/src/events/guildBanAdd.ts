import type { GuildBan } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";
import { revokeAccess } from "../services/revokeAccess.js";

/**
 * GuildBanAdd handler: asks the auth server to revoke API access for a
 * member banned from the target guild. Never throws.
 */
export async function onGuildBanAdd(ban: GuildBan): Promise<void> {
  try {
    if (ban.guild.id !== botConfig.TARGET_GUILD_ID) return;
    logger.info("Member banned", { discordUserId: ban.user.id });
    await revokeAccess(ban.user.id, "member_banned");
  } catch (error) {
    logger.error("guildBanAdd handler failed", { discordUserId: ban.user.id, error });
  }
}
