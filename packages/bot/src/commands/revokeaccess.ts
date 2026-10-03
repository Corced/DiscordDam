import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { authWebhookService } from "../services/authWebhook.js";
import { logger } from "../utils/logger.js";
import { requireModPermission } from "./permissions.js";

const CONFIRM_BUTTON_PREFIX = "revoke_confirm_";
const CANCEL_BUTTON_ID = "revoke_cancel";
const CONFIRM_TIMEOUT_MS = 30_000;

/** /revokeaccess — revoke a user's API access, with an in-Discord confirmation step. */
export const revokeAccessCommand = new SlashCommandBuilder()
  .setName("revokeaccess")
  .setDescription("Revoke a user's API access")
  .addUserOption((option) =>
    option.setName("user").setDescription("User whose access to revoke").setRequired(true),
  )
  .addStringOption((option) =>
    option.setName("reason").setDescription("Reason for the revocation").setMaxLength(200),
  );

/**
 * Ask for confirmation, then call the auth-server's revoke endpoint.
 * Cancel and 30s timeout both end as "Revocation cancelled."; total
 * service failure never throws out of the handler.
 */
export async function handleRevokeAccess(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!requireModPermission(interaction)) return;
  try {
    const user = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("reason");
    const confirmId = `${CONFIRM_BUTTON_PREFIX}${user.id}`;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Confirm Revocation")
          .setDescription(
            `Revoke access for <@${user.id}>?\n**Reason:** ${reason ?? "No reason given"}`,
          )
          .setColor(0xfee75c),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(confirmId)
            .setLabel("Yes, Revoke")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(CANCEL_BUTTON_ID)
            .setLabel("Cancel")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger),
        ),
      ],
      ephemeral: true,
    });

    // Ephemeral replies come back to our own client as cached messages.
    const message = (await interaction.fetchReply()) as Message;
    let button: ButtonInteraction;
    try {
      button = await message.awaitMessageComponent({
        filter: (i) =>
          i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === CANCEL_BUTTON_ID),
        time: CONFIRM_TIMEOUT_MS,
      });
    } catch {
      // Timeout — collector ended without a press.
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription("Revocation cancelled.").setColor(0x2b2d31)],
        components: [],
      });
      return;
    }

    if (button.customId === CANCEL_BUTTON_ID) {
      await button.update({
        embeds: [new EmbedBuilder().setDescription("Revocation cancelled.").setColor(0x2b2d31)],
        components: [],
      });
      return;
    }

    await button.deferUpdate();
    const result = await authWebhookService.revokeAccess({
      discordUserId: user.id,
      reason: reason ?? "Manual revoke by moderator",
      revokedBy: interaction.user.id,
    });

    if (result === null) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription("❌ Failed to revoke. Check bot logs.")
            .setColor(0xed4245),
        ],
        components: [],
      });
      return;
    }
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`✅ Access revoked for <@${user.id}>. Sessions revoked: ${result.sessionsRevoked}`)
          .setColor(0x57f287),
      ],
      components: [],
    });
  } catch (error) {
    logger.error("revokeaccess failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder().setDescription("❌ Failed to revoke. Check bot logs.").setColor(0xed4245),
          ],
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}