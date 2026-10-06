import type { GuildMember, PartialGuildMember } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";
import { revokeAccess } from "../services/revokeAccess.js";

/**
 * GuildMemberRemove handler: asks the auth server to revoke API access for a
 * member that left the target guild. Never throws.
 */
export async function onGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
): Promise<void> {
  try {
    if (member.guild.id !== botConfig.TARGET_GUILD_ID) return;
    logger.info("Member left guild", { discordUserId: member.id });
    await revokeAccess(member.id, "member_left");
  } catch (error) {
    logger.error("guildMemberRemove handler failed", { discordUserId: member.id, error });
  }
}
