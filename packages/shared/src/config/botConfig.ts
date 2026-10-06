import { z } from "zod";
import { validateEnv } from "./validateEnv.js";

/**
 * Environment contract for the bot service, validated once at import time.
 * A misconfigured bot crashes at startup with a readable error — not at the
 * first Discord API call.
 */
const BotEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z
    .string()
    .min(50, "Bot token too short — check Discord Developer Portal")
    .describe("Bot token from Discord Developer Portal"),

  DISCORD_CLIENT_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .describe("OAuth2 application client ID"),

  TARGET_GUILD_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .describe("Snowflake ID of the Discord server to gate access on"),

  BOT_INTERNAL_SECRET: z
    .string()
    .min(
      32,
      "Must be at least 32 characters — generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    )
    .describe("Shared secret for bot ↔ auth-server internal HTTP calls"),

  BOT_PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1024, "Port must be >= 1024").max(65535))
    .default("3002")
    .describe("Internal HTTP server port for the bot"),

  AUTH_SERVER_INTERNAL_URL: z
    .string()
    .regex(/^https?:\/\/[^\s]+$/, "Must be a valid URL e.g. http://auth-server:3001")
    .describe("Internal URL of the auth server (Docker service name)"),

  REDIS_URL: z
    .string()
    .startsWith("redis://", "Must start with redis://")
    .describe("Redis connection URL"),

  NODE_ENV: z
    .enum(["development", "staging", "production"])
    .default("development")
    .describe("Runtime environment"),

  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .describe("Log verbosity"),

  DISCORD_OWNER_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .optional()
    .describe("Discord ID of the server owner (optional)"),

  MOD_ROLE_ID: z
    .string()
    .regex(/^\d{17,19}$/, "Must be a Discord snowflake ID (17-19 digits)")
    .optional()
    .describe("Role ID granted moderator access (optional)"),

  REGISTER_COMMANDS_GLOBALLY: z
    .string()
    .transform((v) => v === "true")
    .default("false")
    .describe("Register slash commands globally instead of per-guild"),
});

export const botConfig = validateEnv(BotEnvSchema);
export type BotConfig = typeof botConfig;
