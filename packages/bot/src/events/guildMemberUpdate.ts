import type { GuildMember, PartialGuildMember } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";

/**
 * GuildMemberUpdate handler: logs role changes on the target guild for audit
 * purposes. No API call needed in MVP.
 */
export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  try {
    if (newMember.guild.id !== botConfig.TARGET_GUILD_ID) return;
    const oldRoleIds = new Set(oldMember.roles.cache.keys());
    const newRoleIds = new Set(newMember.roles.cache.keys());
    const addedRoles = [...newRoleIds].filter((id) => !oldRoleIds.has(id));
    const removedRoles = [...oldRoleIds].filter((id) => !newRoleIds.has(id));
    if (addedRoles.length === 0 && removedRoles.length === 0) return;
    logger.info("Member roles changed", {
      discordUserId: newMember.id,
      addedRoles,
      removedRoles,
    });
  } catch (error) {
    logger.error("guildMemberUpdate handler failed", { discordUserId: newMember.id, error });
  }
}
