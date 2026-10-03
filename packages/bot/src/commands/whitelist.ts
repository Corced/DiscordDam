import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { authWebhookService } from "../services/authWebhook.js";
import { logger } from "../utils/logger.js";
import { requireModPermission } from "./permissions.js";

/** /whitelist — manage the verification whitelist override. */
export const whitelistCommand = new SlashCommandBuilder()
  .setName("whitelist")
  .setDescription("Manage the API verification whitelist")
  .addStringOption((option) =>
    option
      .setName("action")
      .setDescription("Add or remove")
      .setRequired(true)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }),
  )
  .addUserOption((option) =>
    option.setName("user").setDescription("User to whitelist").setRequired(true),
  )
  .addIntegerOption((option) =>
    option
      .setName("duration")
      .setDescription("Minutes (leave blank for permanent)")
      .setMinValue(1)
      .setMaxValue(1440),
  );

/**
 * Apply the whitelist change via the auth-server and confirm as an
 * ephemeral embed.
 */
export async function handleWhitelist(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!requireModPermission(interaction)) return;
  try {
    const user = interaction.options.getUser("user", true);
    const action = interaction.options.getString("action", true) as "add" | "remove";
    const duration = interaction.options.getInteger("duration");

    const ok = await authWebhookService.setWhitelist(
      user.id,
      action,
      action === "add" ? (duration ?? undefined) : undefined,
    );

    const embed = ok
      ? new EmbedBuilder().setColor(0x57f287).setDescription(
          action === "add"
            ? `✅ <@${user.id}> whitelisted${duration === null ? " (permanent)" : ` for ${duration} minutes`}`
            : `✅ <@${user.id}> removed from whitelist`,
        )
      : new EmbedBuilder()
          .setColor(0xed4245)
          .setDescription("❌ Failed to update whitelist. Check bot logs.");

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error("whitelist failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Failed to update whitelist. Check bot logs.")
              .setColor(0xed4245),
          ],
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}