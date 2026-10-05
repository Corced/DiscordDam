import { createRequire } from "node:module";
import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { client } from "../client.js";
import { authWebhookService } from "../services/authWebhook.js";
import { redisService } from "../services/redisService.js";
import { logger } from "../utils/logger.js";
import { requireModPermission } from "./permissions.js";

// createRequire over import attributes — stable across all Node 20.x.
const nodeRequire = createRequire(import.meta.url);
const { version: botVersion } = nodeRequire("../../package.json") as { version: string };

/** "2d 3h 4m 5s"-style duration from seconds. */
function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/** /botstats — one ephemeral panel of bot + infra health. */
export const botStatsCommand = new SlashCommandBuilder()
  .setName("botstats")
  .setDescription("Show bot and API stats");

/**
 * Gather liveness + counts in parallel and render as an ephemeral embed.
 * Every sub-check fails soft (null/false), never throws.
 */
export async function handleBotStats(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!requireModPermission(interaction)) return;
  try {
    const guild = client.guilds.cache.get(botConfig.TARGET_GUILD_ID);
    const [redisOnline, stats, health] = await Promise.all([
      redisService.ping(),
      authWebhookService.getUserStats(),
      authWebhookService.checkHealth(),
    ]);

    const embed = new EmbedBuilder()
      .setTitle("🤖 DiscordDam Bot Stats")
      .setColor(0x5865f2)
      .addFields(
        { name: "Bot Uptime", value: formatDuration(process.uptime()), inline: true },
        { name: "WebSocket Ping", value: `${client.ws.ping}ms`, inline: true },
        { name: "Redis", value: redisOnline ? "✅ Online" : "❌ Offline", inline: true },
        { name: "Auth Server", value: health !== null ? "✅ Online" : "❌ Offline", inline: true },
        { name: "Guild Members", value: String(guild?.memberCount ?? 0), inline: true },
        { name: "Bot Version", value: botVersion, inline: true },
        {
          name: "API Users (Active)",
          value: stats === null ? "—" : String(stats.active),
          inline: true,
        },
        {
          name: "API Users (Revoked)",
          value: stats === null ? "—" : String(stats.revoked),
          inline: true,
        },
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    logger.error("botstats failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          embeds: [
            new EmbedBuilder()
              .setDescription("❌ Failed to gather stats. Check bot logs.")
              .setColor(0xed4245),
          ],
          ephemeral: true,
        })
        .catch(() => undefined);
    }
  }
}
