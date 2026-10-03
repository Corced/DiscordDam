import { Client, GatewayIntentBits } from "discord.js";

// ⚠️ PRIVILEGED INTENT — GuildMembers must be enabled manually in the
// Discord Developer Portal (Application → Bot → Privileged Gateway Intents).
// Without it, login fails with "Used disallowed intents".

/** The single Discord client instance for the whole bot process. */
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // ← privileged, see comment above
    GatewayIntentBits.GuildBans,
  ],
});