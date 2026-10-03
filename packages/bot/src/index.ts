// Env validation runs first: importing shared botConfig performs the
// crash-fast zod validation (all missing vars at once, non-zero exit) before
// anything else executes — imports are hoisted, so import ORDER is the
// mechanism (established pattern; auth-server does the same with authConfig).
import { botConfig } from "@discordgate/shared/config/botConfig.js";
import { Events } from "discord.js";
import { client } from "./client.js";
import { onReady } from "./events/ready.js";
import { onGuildMemberRemove } from "./events/guildMemberRemove.js";
import { onGuildBanAdd } from "./events/guildBanAdd.js";
import { onGuildMemberUpdate } from "./events/guildMemberUpdate.js";
import { startHttpServer } from "./http/server.js";
import { logger } from "./utils/logger.js";

logger.info("✅ Bot env validated");

client.once(Events.ClientReady, onReady);
client.on(Events.GuildMemberRemove, onGuildMemberRemove);
client.on(Events.GuildBanAdd, onGuildBanAdd);
client.on(Events.GuildMemberUpdate, onGuildMemberUpdate);

startHttpServer();

await client.login(botConfig.DISCORD_BOT_TOKEN);