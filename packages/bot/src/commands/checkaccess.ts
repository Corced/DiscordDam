import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { authWebhookService } from "../services/authWebhook.js";
import { logger } from "../utils/logger.js";
import { requireModPermission } from "./permissions.js";

/** /checkaccess — look up a user's API account. */
export const checkAccessCommand = new SlashCommandBuilder()
  .setName("checkaccess")
  .setDescription("Check a user's API access status")
  .addUserOption((option) =>
    option.setName("user").setDescription("User to look up").setRequired(true),
  );

/**
 * Show the user's API profile as an ephemeral embed. Null from the service
 * (404 or outage — the service logs distinguish them) renders as "no account".
 */
export async function handleCheckAccess(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!requireModPermission(interaction)) return;
  try {
    const user = interaction.options.getUser("user", true);
    const profile = await authWebhookService.getUserStatus(user.id);

    // Status and color derive from `role` (guaranteed column) — never the
    // optional `status` field, which may not exist on the on-disk User type.
    const embed =
      profile === null
        ? new EmbedBuilder()
            .setTitle("No Account")
            .setDescription("This user has no account on the API site.")
            .setColor(0x2b2d31)
        : new EmbedBuilder()
            .setTitle(`API Access: ${profile.username}`)
            .setColor(profile.role === "REVOKED" ? 0xed4245 : 0x57f287)
            .addFields(
              { name: "Discord Username", value: profile.username, inline: true },
              { name: "API Role", value: profile.role, inline: true },
              { name: "Status", value: profile.role === "REVOKED" ? "REVOKED" : "ACTIVE", inline: true },
              {
                name: "Last Login",
                value: profile.lastLogin === null ? "Never" : new Date(profile.lastLogin).toUTCString(),
                inline: true,
              },
              { name: "Created At", value: new Date(profile.createdAt).toUTCString(), inline: true },
            );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error("checkaccess failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Failed to check access. Check bot logs.")
              .setColor(0xed4245),
          ],
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}