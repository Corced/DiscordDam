import {
  EmbedBuilder,
  SlashCommandBuilder,
  type APIEmbedField,
  type ChatInputCommandInteraction,
} from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { client } from "../client.js";
import { authWebhookService } from "../services/authWebhook.js";
import { redisService } from "../services/redisService.js";
import { logger } from "../utils/logger.js";
import { requireModPermission } from "./permissions.js";

const FLAGGED_LIST_LIMIT = 10;

/** /syncmembers — diff live guild membership against active API users. */
export const syncMembersCommand = new SlashCommandBuilder()
  .setName("syncmembers")
  .setDescription("Compare guild members with active API users");

/**
 * Fetch all guild members, diff against active API users, and report.
 * Read-only: flagged users are never auto-revoked. Lock is armed after the
 * work so a failed sync doesn't consume the 10-minute window.
 */
export async function handleSyncMembers(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!requireModPermission(interaction)) return;
  try {
    // Lock check before deferring — a fast ephemeral rejection.
    const lockTtl = await redisService.getSyncLockTtlSeconds(botConfig.TARGET_GUILD_ID);
    if (lockTtl > 0) {
      await interaction.reply({
        content: `Sync can only run once every 10 minutes. Try again in ${lockTtl}s.`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = client.guilds.cache.get(botConfig.TARGET_GUILD_ID);
    if (guild === undefined) {
      throw new Error("Target guild not in cache");
    }
    await guild.members.fetch(); // full pagination — populates the cache

    const activeUserIds = await authWebhookService.getActiveUserIds();
    if (activeUserIds === null) {
      throw new Error("Failed to fetch active API users from auth-server");
    }

    const inGuildIds = new Set(guild.members.cache.keys());
    const inDbIds = new Set(activeUserIds);
    const flagged = [...inDbIds].filter((id) => !inGuildIds.has(id));

    await redisService.setSyncLock(botConfig.TARGET_GUILD_ID);

    const fields: APIEmbedField[] = [
      { name: "Guild Members Checked", value: String(guild.members.cache.size), inline: true },
      { name: "API Users Checked", value: String(inDbIds.size), inline: true },
      { name: "Flagged for Review", value: String(flagged.length), inline: true },
    ];
    if (flagged.length > 0) {
      fields.push({
        name: `Flagged Users (first ${FLAGGED_LIST_LIMIT})`,
        value: flagged.slice(0, FLAGGED_LIST_LIMIT).join("\n"),
      });
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔄 Sync Complete")
          .setDescription("Flagged users are NOT auto-revoked. Use /revokeaccess to action them.")
          .setColor(0x5865f2)
          .addFields(...fields),
      ],
    });
  } catch (error) {
    logger.error("syncmembers failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const failure = new EmbedBuilder()
      .setDescription("❌ Sync failed. Check bot logs.")
      .setColor(0xed4245);
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [failure] }).catch(() => undefined);
    } else if (!interaction.replied) {
      await interaction.reply({ embeds: [failure], ephemeral: true }).catch(() => undefined);
    }
  }
}
