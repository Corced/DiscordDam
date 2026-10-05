import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";

/**
 * Moderator permission model, checked in order:
 * 1. `interaction.user.id === DISCORD_OWNER_ID`
 * 2. `ManageGuild` permission
 * 3. MOD_ROLE_ID membership (when configured)
 */
export function hasModPermission(interaction: ChatInputCommandInteraction): boolean {
  if (interaction.user.id === botConfig.DISCORD_OWNER_ID) return true;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const modRoleId = botConfig.MOD_ROLE_ID;
  if (modRoleId !== undefined && modRoleId !== "" && interaction.inCachedGuild()) {
    return interaction.member.roles.cache.has(modRoleId);
  }
  return false;
}

/**
 * Guard form of {@link hasModPermission}: performs the model's step 4 —
 * replies with the standard ephemeral denial when the check fails.
 * Handlers use it as a one-liner: `if (!requireModPermission(interaction)) return;`
 */
export function requireModPermission(interaction: ChatInputCommandInteraction): boolean {
  if (hasModPermission(interaction)) return true;
  void interaction
    .reply({ content: "You don't have permission to use this command.", ephemeral: true })
    .catch(() => undefined);
  return false;
}
