import { REST, Routes, type ChatInputCommandInteraction, type Interaction } from "discord.js";
import { botConfig } from "@DiscordDam/shared/config/botConfig.js";
import { logger } from "../utils/logger.js";
import { checkAccessCommand, handleCheckAccess } from "./checkaccess.js";
import { revokeAccessCommand, handleRevokeAccess } from "./revokeaccess.js";
import { whitelistCommand, handleWhitelist } from "./whitelist.js";
import { botStatsCommand, handleBotStats } from "./botstats.js";
import { syncMembersCommand, handleSyncMembers } from "./syncmembers.js";

/** All slash commands, registration-ready (used by registerCommands). */
export const commandDefinitions = [
  checkAccessCommand,
  revokeAccessCommand,
  whitelistCommand,
  botStatsCommand,
  syncMembersCommand,
];

type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

const handlers = new Map<string, CommandHandler>([
  ["checkaccess", handleCheckAccess],
  ["revokeaccess", handleRevokeAccess],
  ["whitelist", handleWhitelist],
  ["botstats", handleBotStats],
  ["syncmembers", handleSyncMembers],
]);

/**
 * Register all slash commands with Discord. Guild-scoped to TARGET_GUILD_ID
 * by default (instant availability); REGISTER_COMMANDS_GLOBALLY=true
 * switches to global registration (propagates up to ~1h). Failures are
 * logged, never thrown — dead commands must not kill the ready sequence.
 */
export async function registerCommands(): Promise<void> {
  try {
    const rest = new REST({ version: "10" }).setToken(botConfig.DISCORD_BOT_TOKEN);
    const body = commandDefinitions.map((command) => command.toJSON());
    if (botConfig.REGISTER_COMMANDS_GLOBALLY) {
      await rest.put(Routes.applicationCommands(botConfig.DISCORD_CLIENT_ID), { body });
      logger.info("Slash commands registered globally", { count: body.length });
    } else {
      await rest.put(
        Routes.applicationGuildCommands(botConfig.DISCORD_CLIENT_ID, botConfig.TARGET_GUILD_ID),
        { body },
      );
      logger.info("Slash commands registered to guild", {
        guildId: botConfig.TARGET_GUILD_ID,
        count: body.length,
      });
    }
  } catch (error) {
    logger.error("Slash command registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * interactionCreate router: dispatches chat-input commands to their
 * handler; unknown commands and non-command interactions are ignored.
 */
export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  const handler = handlers.get(interaction.commandName);
  if (handler === undefined) return;
  try {
    await handler(interaction);
  } catch (error) {
    // Handlers catch their own errors; this is the last-ditch net.
    logger.error(`Command ${interaction.commandName} failed`, {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "Something went wrong. Check bot logs.", ephemeral: true })
        .catch(() => undefined);
    }
  }
}
